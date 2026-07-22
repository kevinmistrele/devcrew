// eventPolling: detecta eventos REAIS do GitHub (pr_opened, changes_requested,
// review_approved, pushed) via polling da API REST e grava em task_events.
//
// *** Isto consome a cota de API do GitHub (~5.000 req/h por token), NUNCA tokens de IA. ***
// O vigia só observa (chamadas HTTP simples pra api.github.com); nenhuma chamada de IA
// existe aqui. Ver docs/07-colaboracao-e-fluxos.md, "O motor: eventos reais do GitHub".
//
// Regras de eficiência aplicadas (mesma doc):
// - Só polla enquanto há tarefa ativa no projeto — sem tarefa ativa, o poller se desliga.
// - ETags/If-None-Match: quando nada mudou, o GitHub responde 304 e isso NÃO conta na cota.
// - Intervalo adaptativo: quente (5–10s) logo após detectar mudança, recuando gradualmente
//   até um teto ocioso (60s+) enquanto nada muda.
import {
  createTaskEvent,
  getProject,
  getRepo,
  linkPullRequest,
  listTasks,
  updateTaskStatus,
  type Task,
  type TaskEventType,
  type TaskStatus,
} from '@/core/db'
import { getStoredGithubToken } from './token'

const GITHUB_API = 'https://api.github.com'

const HOT_INTERVAL_MS = 7_000 // 5–10s: loop "quente", algo mudou recentemente
const IDLE_INTERVAL_MS = 60_000 // teto "ocioso": nada mudou nas últimas rodadas
const BACKOFF_FACTOR = 1.6

// Só essas tarefas justificam gastar cota de API — o resto (pending/done/paused/rejected)
// não tem PR pra observar ou já não está mais em jogo.
const ACTIVE_TASK_STATUSES: TaskStatus[] = [
  'running',
  'pr_open',
  'changes_requested',
  'qa_approved',
  'awaiting_merge',
]

interface ProjectPollerState {
  intervalMs: number
  timer: ReturnType<typeof setTimeout> | null
  /** ETag por URL — permite requisição condicional (If-None-Match) em cada endpoint. */
  etags: Map<string, string>
  /** Último `head.sha` conhecido do PR de cada tarefa, pra detectar `pushed`. */
  knownHeadSha: Map<string, string>
  /** IDs de review já processados de cada tarefa, pra não duplicar eventos. */
  seenReviewIds: Map<string, Set<number>>
}

const pollers = new Map<string, ProjectPollerState>()

// --- Ponte pro loop-controller, sem que este arquivo precise conhecê-lo (evita import
// circular: loop-controller depende de github-service e de task-runner, nunca o contrário).

export type TaskEventHandler = (taskId: string, eventType: TaskEventType, payload: unknown) => void

const eventHandlers = new Set<TaskEventHandler>()

/** Registra um observador chamado toda vez que um evento real é detectado e gravado. */
export function onTaskEvent(handler: TaskEventHandler): () => void {
  eventHandlers.add(handler)
  return () => eventHandlers.delete(handler)
}

/**
 * Notifica os observadores registrados via `onTaskEvent`. Exportada porque nem todo evento
 * passa pelo polling pra ser descoberto: quando o próprio app abre um PR (`openPullRequest`
 * no task-runner), ele já SABE o `pr_opened` na hora — não tem por que esperar um poll tick
 * "descobrir" de novo algo que acabamos de fazer.
 */
export function emitTaskEvent(taskId: string, eventType: TaskEventType, payload: unknown): void {
  for (const handler of eventHandlers) handler(taskId, eventType, payload)
}

/**
 * Garante que o projeto está sendo pollado. Idempotente — chamar de novo enquanto já está
 * rodando não faz nada. Chame isso sempre que uma tarefa entra em estado ativo (o
 * task-runner já faz isso) ou quando a UI passa a exibir um projeto com tarefa ativa.
 */
export function ensureProjectPolling(projectId: string): void {
  if (pollers.has(projectId)) return
  const state: ProjectPollerState = {
    intervalMs: HOT_INTERVAL_MS,
    timer: null,
    etags: new Map(),
    knownHeadSha: new Map(),
    seenReviewIds: new Map(),
  }
  pollers.set(projectId, state)
  void tick(projectId, state)
}

/** Para o polling de um projeto imediatamente, descartando ETags/baseline acumulados. */
export function stopProjectPolling(projectId: string): void {
  const state = pollers.get(projectId)
  if (state?.timer) clearTimeout(state.timer)
  pollers.delete(projectId)
}

export function isPollingProject(projectId: string): boolean {
  return pollers.has(projectId)
}

async function tick(projectId: string, state: ProjectPollerState): Promise<void> {
  if (!pollers.has(projectId)) return // foi parado explicitamente entre o agendamento e agora

  const activeTasks = (await listTasks(projectId)).filter((task) => ACTIVE_TASK_STATUSES.includes(task.status))

  if (activeTasks.length === 0) {
    // Sem tarefa ativa: para de vez. Não fica em loop ocioso gastando cota à toa.
    pollers.delete(projectId)
    return
  }

  const project = await getProject(projectId)
  const repo = project ? await getRepo(project.repoId) : undefined

  let anyEventDetected = false
  if (repo?.remoteUrl) {
    for (const task of activeTasks) {
      try {
        const detected = await pollTask(task, repo.remoteUrl, state)
        anyEventDetected ||= detected
      } catch {
        // Uma tarefa com erro (token revogado, PR apagado, rate limit) não deve travar o
        // polling das demais nem derrubar o loop inteiro — só não conta como "atividade".
      }
    }
  }

  state.intervalMs = anyEventDetected
    ? HOT_INTERVAL_MS
    : Math.min(Math.round(state.intervalMs * BACKOFF_FACTOR), IDLE_INTERVAL_MS)

  state.timer = setTimeout(() => void tick(projectId, state), state.intervalMs)
}

/** Poll de uma única tarefa. Retorna `true` se algum evento novo foi detectado e gravado. */
async function pollTask(task: Task, remoteUrl: string, state: ProjectPollerState): Promise<boolean> {
  const token = await getStoredGithubToken()
  if (!token) return false // sem token conectado, não há como chamar a API do GitHub

  const ownerRepo = parseOwnerRepo(remoteUrl)
  if (!ownerRepo) return false
  const { owner, repo } = ownerRepo

  // Tarefa ainda sem PR vinculado: procura se um PR já existe pra branch dela (pode ter
  // sido aberto por fora do app) e vincula assim que aparecer.
  if (!task.prNumber) {
    if (!task.branch) return false
    const pr = await findPullRequestByBranch(token, owner, repo, task.branch, state.etags)
    if (!pr) return false

    await linkPullRequest(task.id, { prNumber: pr.number, prUrl: pr.htmlUrl })
    const payload = { number: pr.number, url: pr.htmlUrl }
    await createTaskEvent({ taskId: task.id, type: 'pr_opened', payload })
    await updateTaskStatus(task.id, 'pr_open')
    state.knownHeadSha.set(task.id, pr.headSha)
    emitTaskEvent(task.id, 'pr_opened', payload)
    return true
  }

  let detected = false

  const prDetail = await fetchPullRequestDetail(token, owner, repo, task.prNumber, state.etags)
  if (prDetail) {
    const previousSha = state.knownHeadSha.get(task.id)
    // Só emite `pushed` a partir da segunda leitura — a primeira só estabelece a baseline.
    if (previousSha && previousSha !== prDetail.headSha) {
      const payload = { sha: prDetail.headSha }
      await createTaskEvent({ taskId: task.id, type: 'pushed', payload })
      emitTaskEvent(task.id, 'pushed', payload)
      detected = true
    }
    state.knownHeadSha.set(task.id, prDetail.headSha)
  }

  const reviews = await fetchPullRequestReviews(token, owner, repo, task.prNumber, state.etags)
  if (reviews) {
    const seen = state.seenReviewIds.get(task.id) ?? new Set<number>()
    for (const review of reviews) {
      if (seen.has(review.id)) continue
      seen.add(review.id)

      if (review.state === 'APPROVED') {
        const payload = { reviewId: review.id, user: review.user, body: review.body }
        await createTaskEvent({ taskId: task.id, type: 'review_approved', payload })
        await updateTaskStatus(task.id, 'qa_approved')
        emitTaskEvent(task.id, 'review_approved', payload)
        detected = true
      } else if (review.state === 'CHANGES_REQUESTED') {
        const payload = { reviewId: review.id, user: review.user, body: review.body }
        await createTaskEvent({ taskId: task.id, type: 'changes_requested', payload })
        await updateTaskStatus(task.id, 'changes_requested')
        emitTaskEvent(task.id, 'changes_requested', payload)
        detected = true
      }
      // outros estados (COMMENTED, DISMISSED, PENDING) não mapeiam pra um TaskEventType.
    }
    state.seenReviewIds.set(task.id, seen)
  }

  return detected
}

function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const cleaned = remoteUrl.trim().replace(/\.git$/, '').replace(/\/$/, '')
  const idx = cleaned.indexOf('github.com')
  if (idx === -1) return null

  const path = cleaned.slice(idx + 'github.com'.length).replace(/^[:/]/, '')
  const [owner, repo] = path.split('/')
  return owner && repo ? { owner, repo } : null
}

/**
 * GET condicional: manda `If-None-Match` se já temos um ETag daquela URL. Retorna `null`
 * em caso de 304 (nada mudou — e essa resposta não conta na cota do GitHub).
 */
async function githubGet(url: string, token: string, etags: Map<string, string>): Promise<Response | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DevCrew-App',
  }
  const etag = etags.get(url)
  if (etag) headers['If-None-Match'] = etag

  const response = await fetch(url, { headers })

  if (response.status === 304) return null

  const newEtag = response.headers.get('etag')
  if (newEtag) etags.set(url, newEtag)

  if (!response.ok) {
    throw new Error(`Falha ao consultar o GitHub (HTTP ${response.status}): ${url}`)
  }

  return response
}

interface RemotePullRequest {
  number: number
  htmlUrl: string
  headSha: string
}

async function findPullRequestByBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  etags: Map<string, string>,
): Promise<RemotePullRequest | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=all&sort=created&direction=desc`
  const response = await githubGet(url, token, etags)
  if (!response) return null

  const pulls = (await response.json()) as Array<{ number: number; html_url: string; head: { sha: string } }>
  const first = pulls[0]
  return first ? { number: first.number, htmlUrl: first.html_url, headSha: first.head.sha } : null
}

async function fetchPullRequestDetail(
  token: string,
  owner: string,
  repo: string,
  number: number,
  etags: Map<string, string>,
): Promise<{ headSha: string } | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}`
  const response = await githubGet(url, token, etags)
  if (!response) return null

  const pr = (await response.json()) as { head: { sha: string } }
  return { headSha: pr.head.sha }
}

interface RemoteReview {
  id: number
  state: string
  user: string
  body: string
}

async function fetchPullRequestReviews(
  token: string,
  owner: string,
  repo: string,
  number: number,
  etags: Map<string, string>,
): Promise<RemoteReview[] | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}/reviews`
  const response = await githubGet(url, token, etags)
  if (!response) return null

  const reviews = (await response.json()) as Array<{
    id: number
    state: string
    body: string | null
    user: { login: string } | null
  }>
  return reviews.map((review) => ({
    id: review.id,
    state: review.state,
    user: review.user?.login ?? 'desconhecido',
    body: review.body ?? '',
  }))
}
