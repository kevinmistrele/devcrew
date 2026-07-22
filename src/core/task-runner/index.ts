// task-runner: orquestra uma tarefa de ponta a ponta — monta o contexto (prompt do
// funcionário + arquivos do escopo), chama a IA, calcula os diffs propostos e guarda tudo
// no banco. Aprovar/rejeitar cada mudança fica a cargo do diff-engine, chamado daqui.
//
// Quando o provedor preferido esgota a quota, o ai-router não troca sozinho — devolve um
// sinal de fallback que este módulo propaga pra UI (task fica `paused`, sem diffs ainda).
// Só depois que o usuário confirma no modal é que `continueTaskWithFallback` reenvia o
// MESMO histórico ao provedor de fallback.
import { estimateRemainingTokens, sendToAI, sendToProvider, type AIResponseWithProvider } from '@/core/ai-router'
import {
  addMessage,
  createTask,
  createTaskEvent,
  getAppSettings,
  getEmployee,
  getProject,
  getRepo,
  getTask,
  linkPullRequest,
  updateTaskStatus,
  type Employee,
  type EmployeeScope,
  type Message,
  type ProviderId,
  type Repo,
  type Task,
} from '@/core/db'
import { findTeamMemberByRole } from '@/core/employee-manager'
import {
  approveChange,
  buildFileDiff,
  parseFileBlocks,
  persistProposedChanges,
  rejectChange,
  type FileDiffResult,
  type ProposedFileDiff,
} from '@/core/diff-engine'
import {
  commitFiles,
  createTaskBranch,
  listRepoFilesRecursive,
  pushBranch,
  readRepoFile,
  writeRepoFile,
} from '@/core/git-service'
import {
  createPullRequest,
  createPullRequestReview,
  emitTaskEvent,
  ensureProjectPolling,
  getStoredGithubToken,
} from '@/core/github-service'
import { emitTerminalLine } from '@/core/terminal-service'

const MAX_CONTEXT_FILES = 30
const MAX_FILE_CHARS = 20_000

/** Converte um glob simples de escopo ('src/**', '**\/*.ts', '**') numa regex de caminho. */
function globToRegExp(glob: string): RegExp {
  let pattern = '^'
  let i = 0
  while (i < glob.length) {
    const char = glob[i]
    if (char === '*' && glob[i + 1] === '*') {
      i += 2
      if (glob[i] === '/') i += 1
      pattern += '(?:.*/)?'
      continue
    }
    if (char === '*') {
      pattern += '[^/]*'
      i += 1
      continue
    }
    if (char === '?') {
      pattern += '[^/]'
      i += 1
      continue
    }
    if ('.+^${}()|[]\\'.includes(char)) {
      pattern += `\\${char}`
    } else {
      pattern += char
    }
    i += 1
  }
  pattern += '$'
  return new RegExp(pattern)
}

async function gatherScopedContext(
  repoPath: string,
  pathGlobs: string[],
): Promise<{ path: string; content: string }[]> {
  const matchers = pathGlobs.map(globToRegExp)
  const allFiles = await listRepoFilesRecursive(repoPath)
  const matched = allFiles.filter((file) => matchers.some((re) => re.test(file.path))).slice(0, MAX_CONTEXT_FILES)

  return Promise.all(
    matched.map(async (file) => {
      const content = await readRepoFile(repoPath, file.path)
      return { path: file.path, content: (content ?? '').slice(0, MAX_FILE_CHARS) }
    }),
  )
}

const RESPONSE_FORMAT_INSTRUCTIONS = `
Para cada arquivo que precisar criar ou modificar para cumprir a tarefa, responda usando
exatamente este formato — um bloco por arquivo, com o conteúdo COMPLETO e final do arquivo
(nunca um diff parcial ou um trecho):

<file path="caminho/relativo/ao/repo.ext">
conteúdo completo e final do arquivo aqui
</file>

Regras:
- Um bloco <file> por arquivo, com o caminho relativo à raiz do repositório.
- Sempre o conteúdo inteiro do arquivo final, mesmo que só uma parte tenha mudado.
- Não escreva nada fora dos blocos além de uma explicação breve, se quiser.
`.trim()

function buildUserPrompt(files: { path: string; content: string }[], description: string): string {
  const filesBlock = files.length
    ? files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n')
    : '(nenhum arquivo do escopo foi encontrado no repositório)'

  return [
    'Arquivos atuais do escopo do projeto:',
    filesBlock,
    '',
    'Tarefa solicitada:',
    description,
    '',
    RESPONSE_FORMAT_INSTRUCTIONS,
  ].join('\n')
}

async function requireTask(id: string): Promise<Task> {
  const task = await getTask(id)
  if (!task) throw new Error('Falha ao recarregar a tarefa.')
  return task
}

export interface RunTaskInput {
  projectId: string
  employeeId: string
  title: string
  description: string
  /** Presente quando é o Orquestrador quem cria a tarefa (Fluxo 2), não você diretamente. */
  createdBy?: string
}

export interface PendingFallback {
  from: ProviderId
  to: ProviderId
  /** Tokens restantes estimados de cada lado, pro modal mostrar (ver estimateRemainingTokens). */
  remainingTokensFrom: number
  remainingTokensTo: number
  /** Guardados pra reenviar o MESMO histórico ao provedor de fallback, se o usuário confirmar. */
  messages: Message[]
  systemPrompt: string
}

export interface RunTaskResult {
  task: Task
  diffs: ProposedFileDiff[]
  /** Arquivos que a IA tentou tocar mas ficam fora do escopo do funcionário — ignorados. */
  warnings: string[]
  /** Presente quando o provedor preferido esgotou a quota — a UI deve abrir o modal de fallback. */
  fallback?: PendingFallback
}

/**
 * Carrega uma tarefa já existente (board/fila) no mesmo formato que `runTask` devolve, pra
 * reaproveitar a tela de detalhe (diff/PR/loop) em qualquer tarefa, não só na que acabou de
 * ser criada nesta sessão. Os diffs vêm de `proposed_changes` já persistidos — recalcula só
 * as `lines` linha a linha, sem chamar a IA de novo.
 */
export async function loadTaskResult(taskId: string): Promise<RunTaskResult> {
  const task = await requireTask(taskId)
  const diffs: ProposedFileDiff[] = task.changes.map((change) => {
    const diff = buildFileDiff(change.filePath, change.oldContent, change.newContent)
    return { ...diff, id: change.id, status: change.status }
  })
  return { task, diffs, warnings: [] }
}

/** Roda `diffs`/`warnings` a partir de uma resposta de IA já obtida (preferido ou fallback). */
async function finishTaskWithResponse(
  task: Task,
  repo: Repo,
  scopes: EmployeeScope[],
  aiResponse: AIResponseWithProvider,
): Promise<RunTaskResult> {
  await addMessage(task.id, {
    role: 'assistant',
    content: aiResponse.content,
    provider: aiResponse.provider,
    tokensIn: aiResponse.tokensIn,
    tokensOut: aiResponse.tokensOut,
  })
  // Eco no Terminal ao vivo: a resposta já aconteceu (a chamada acima) — isto só exibe,
  // nunca gera uma chamada nova (docs/07).
  emitTerminalLine(task.employeeId, 'ai', aiResponse.content)

  const parsedFiles = parseFileBlocks(aiResponse.content)
  const scopeMatchers = scopes.map((scope) => globToRegExp(scope.pathGlob))
  const inScope = parsedFiles.filter((file) => scopeMatchers.some((re) => re.test(file.filePath)))
  const outOfScope = parsedFiles.filter((file) => !scopeMatchers.some((re) => re.test(file.filePath)))

  const diffResults: FileDiffResult[] = []
  for (const file of inScope) {
    const oldContent = await readRepoFile(repo.localPath, file.filePath)
    diffResults.push(buildFileDiff(file.filePath, oldContent, file.newContent))
  }

  const diffs = await persistProposedChanges(task.id, diffResults)
  await updateTaskStatus(task.id, 'running', { costUsedUsd: task.costUsedUsd + aiResponse.costUsd })

  // A tarefa está ativa agora — garante que o projeto está sendo pollado pra detectar
  // eventos reais do GitHub (PR aberto por fora, push, review) assim que acontecerem.
  ensureProjectPolling(task.projectId)

  return {
    task: await requireTask(task.id),
    diffs,
    warnings: outOfScope.map((file) => `Fora do escopo do funcionário, ignorado: ${file.filePath}`),
  }
}

async function loadScopedRepo(employee: Employee, projectId: string): Promise<{ repo: Repo; scopes: EmployeeScope[] }> {
  const project = await getProject(projectId)
  if (!project) throw new Error('Projeto não encontrado.')
  const repo = await getRepo(project.repoId)
  if (!repo) throw new Error('Repositório do projeto não encontrado.')

  const scopes = employee.scopes.filter((scope) => scope.repoId === repo.id)
  if (scopes.length === 0) {
    throw new Error(
      `"${employee.name}" não tem escopo configurado para o repositório "${repo.name}". ` +
        'Configure o escopo em Funcionários antes de rodar a tarefa.',
    )
  }

  return { repo, scopes }
}

export async function runTask(input: RunTaskInput): Promise<RunTaskResult> {
  const employee = await getEmployee(input.employeeId)
  if (!employee) throw new Error('Funcionário não encontrado.')

  const { repo, scopes } = await loadScopedRepo(employee, input.projectId)

  const branch = `devcrew/task-${crypto.randomUUID().slice(0, 8)}`
  await createTaskBranch(repo.localPath, branch)

  const settings = await getAppSettings()
  const task = await createTask({
    projectId: input.projectId,
    employeeId: input.employeeId,
    title: input.title,
    description: input.description,
    branch,
    createdBy: input.createdBy,
    maxRounds: settings.defaultMaxRounds,
    costCapUsd: settings.defaultCostCapUsd,
  })

  await addMessage(task.id, { role: 'user', content: input.description })

  const contextFiles = await gatherScopedContext(repo.localPath, scopes.map((scope) => scope.pathGlob))
  const userPrompt = buildUserPrompt(contextFiles, input.description)
  const messages: Message[] = [{ id: 'ctx', role: 'user', content: userPrompt }]

  let result
  try {
    result = await sendToAI(messages, employee.systemPrompt, {
      preferredProvider: employee.preferredProvider,
      fallbackProvider: employee.fallbackProvider,
      taskId: task.id,
    })
  } catch (err) {
    await updateTaskStatus(task.id, 'paused', { pausedReason: 'error' })
    throw err
  }

  if (result.needsFallback) {
    // Esgotou por definição — foi isso que disparou o pedido de fallback.
    const remainingBudgetUsd = Math.max(0, task.costCapUsd - task.costUsedUsd)
    await updateTaskStatus(task.id, 'paused', { pausedReason: 'error' })
    return {
      task: await requireTask(task.id),
      diffs: [],
      warnings: [],
      fallback: {
        from: result.from,
        to: result.to,
        remainingTokensFrom: 0,
        remainingTokensTo: estimateRemainingTokens(result.to, remainingBudgetUsd),
        messages,
        systemPrompt: employee.systemPrompt,
      },
    }
  }

  return finishTaskWithResponse(task, repo, scopes, result)
}

/**
 * Chamado depois que o usuário confirma o modal de fallback: reenvia o MESMO histórico
 * (`messages`/`systemPrompt` vindos de `PendingFallback`) ao provedor escolhido e completa
 * a tarefa normalmente a partir daí.
 */
export async function continueTaskWithFallback(
  task: Task,
  toProvider: ProviderId,
  messages: Message[],
  systemPrompt: string,
): Promise<RunTaskResult> {
  const employee = await getEmployee(task.employeeId)
  if (!employee) throw new Error('Funcionário não encontrado.')
  const { repo, scopes } = await loadScopedRepo(employee, task.projectId)

  let aiResponse
  try {
    aiResponse = await sendToProvider(toProvider, messages, systemPrompt, task.id)
  } catch (err) {
    await updateTaskStatus(task.id, 'paused', { pausedReason: 'error' })
    throw err
  }

  return finishTaskWithResponse(task, repo, scopes, aiResponse)
}

/** Aprova uma mudança proposta: escreve no disco (na branch da tarefa) e marca como aprovada. */
export async function approveProposedChange(task: Task, change: ProposedFileDiff): Promise<void> {
  const project = await getProject(task.projectId)
  if (!project) throw new Error('Projeto da tarefa não encontrado.')
  const repo = await getRepo(project.repoId)
  if (!repo) throw new Error('Repositório da tarefa não encontrado.')
  if (!task.branch) throw new Error('Tarefa sem branch isolada associada.')

  await approveChange(change, repo.localPath, task.branch)
}

/** Rejeita uma mudança proposta: nada é escrito no disco. */
export async function rejectProposedChange(change: ProposedFileDiff): Promise<void> {
  await rejectChange(change)
}

function buildPullRequestBody(task: Task, approvedFilePaths: string[]): string {
  return [
    task.description ?? '',
    '',
    '---',
    'Arquivos alterados:',
    ...approvedFilePaths.map((filePath) => `- ${filePath}`),
    '',
    '_Aberto pelo DevCrew — revise e faça o merge manualmente no GitHub._',
  ].join('\n')
}

/**
 * Commita as mudanças aprovadas na branch isolada da tarefa, envia pro remoto e abre um PR
 * real no GitHub — só deve ser chamado depois de confirmação explícita do usuário na UI
 * (ver docs/02-arquitetura.md, "Aprovação humana"). Nunca dá merge: essa é sempre uma
 * decisão manual, direto no GitHub. Vincula o PR criado à tarefa (pr_number, pr_url).
 */
export async function openPullRequest(task: Task, approvedFilePaths: string[]): Promise<Task> {
  if (approvedFilePaths.length === 0) {
    throw new Error('Nenhuma mudança aprovada para commitar.')
  }
  if (!task.branch) throw new Error('Tarefa sem branch isolada associada.')

  const project = await getProject(task.projectId)
  if (!project) throw new Error('Projeto da tarefa não encontrado.')
  const repo = await getRepo(project.repoId)
  if (!repo) throw new Error('Repositório da tarefa não encontrado.')
  if (!repo.remoteUrl) {
    throw new Error('Repositório sem remoto configurado — não é possível abrir um Pull Request.')
  }

  const commitMessage = task.description ? `${task.title}\n\n${task.description}` : task.title
  await commitFiles(repo.localPath, task.branch, approvedFilePaths, commitMessage, task.employeeId)

  const token = await getStoredGithubToken()
  await pushBranch(repo.localPath, task.branch, task.employeeId, token)

  const pr = await createPullRequest({
    remoteUrl: repo.remoteUrl,
    base: repo.defaultBranch,
    head: task.branch,
    title: task.title,
    body: buildPullRequestBody(task, approvedFilePaths),
  })

  await linkPullRequest(task.id, { prNumber: pr.number, prUrl: pr.htmlUrl })

  // O app já SABE que acabou de abrir este PR — não faz sentido esperar o próximo poll
  // tick "descobrir" de novo algo que acabamos de fazer. Grava o evento e notifica o
  // loop-controller na hora, pelo mesmo canal que o polling usaria pra um PR externo.
  const payload = { number: pr.number, url: pr.htmlUrl }
  await createTaskEvent({ taskId: task.id, type: 'pr_opened', payload })
  emitTaskEvent(task.id, 'pr_opened', payload)

  // Garante que o projeto está sendo pollado a partir de agora, pra detectar review/push
  // no PR que acabou de abrir (útil sobretudo se o app foi reiniciado desde então).
  ensureProjectPolling(task.projectId)

  return requireTask(task.id)
}

// --- Rodadas do loop Dev↔QA autônomo (Fluxo 1, docs/07-colaboracao-e-fluxos.md) ---
// Quem decide QUANDO cada rodada roda, quem é o Dev/QA da vez e os tetos de rodadas/custo
// é o core/loop-controller — aqui só fica o trabalho de UMA rodada (chamar a IA e agir).

const QA_RESPONSE_FORMAT_INSTRUCTIONS = `
Responda EXATAMENTE neste formato, sem nada fora dele:

<review status="approve"></review>

Ou, se encontrar algo que precisa ser corrigido antes do merge:

<review status="changes_requested">
Explique objetivamente o que precisa ser corrigido.
</review>
`.trim()

function buildQaPrompt(task: Task, changesSummary: string): string {
  return [
    `Pull Request #${task.prNumber}: ${task.title}`,
    task.description ? `Descrição da tarefa original: ${task.description}` : '',
    '',
    'Diff das mudanças propostas:',
    changesSummary || '(nenhuma mudança registrada para esta tarefa)',
    '',
    QA_RESPONSE_FORMAT_INSTRUCTIONS,
  ].join('\n')
}

interface ParsedReview {
  approved: boolean
  comment: string
}

const REVIEW_RESPONSE_RE = /<review\s+status="(approve|changes_requested)"\s*>([\s\S]*?)<\/review>/

function parseReviewResponse(responseText: string): ParsedReview | null {
  const match = REVIEW_RESPONSE_RE.exec(responseText)
  if (!match) return null
  return { approved: match[1] === 'approve', comment: match[2].trim() }
}

/**
 * Uma rodada de revisão do QA: lê a tarefa + descrição do PR + diff, e responde aprovando
 * ou pedindo mudanças — sempre com um review REAL no PR (nunca simulado). Nunca dá merge:
 * aprovar aqui só deixa o PR "pronto pra merge", que continua sendo sempre manual.
 */
export async function runQaReviewRound(task: Task): Promise<Task> {
  const employee = await getEmployee(task.employeeId)
  if (!employee) throw new Error('Funcionário (QA) não encontrado.')

  const project = await getProject(task.projectId)
  if (!project) throw new Error('Projeto da tarefa não encontrado.')
  const repo = await getRepo(project.repoId)
  if (!repo) throw new Error('Repositório da tarefa não encontrado.')
  if (!repo.remoteUrl) throw new Error('Repositório sem remoto — não é possível revisar o Pull Request.')
  if (!task.prNumber) throw new Error('Tarefa sem Pull Request aberto para revisar.')

  const changesSummary = task.changes
    .filter((change) => change.status !== 'rejected')
    .map((change) => `--- ${change.filePath} ---\n${change.diff}`)
    .join('\n\n')

  const userPrompt = buildQaPrompt(task, changesSummary)
  const messages: Message[] = [{ id: 'qa-review', role: 'user', content: userPrompt }]

  const result = await sendToAI(messages, employee.systemPrompt, {
    preferredProvider: employee.preferredProvider,
    fallbackProvider: employee.fallbackProvider,
    taskId: task.id,
  })

  if (result.needsFallback) {
    throw new Error(
      `"${employee.name}" esgotou a cota do provedor preferido e precisa de decisão manual sobre trocar de IA.`,
    )
  }

  await addMessage(task.id, {
    role: 'assistant',
    content: result.content,
    provider: result.provider,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  })
  emitTerminalLine(task.employeeId, 'ai', result.content)

  const review = parseReviewResponse(result.content)
  if (!review) {
    throw new Error('O QA não respondeu no formato esperado (bloco <review status="...">).')
  }

  await createPullRequestReview({
    remoteUrl: repo.remoteUrl,
    prNumber: task.prNumber,
    event: review.approved ? 'APPROVE' : 'REQUEST_CHANGES',
    body: review.comment || (review.approved ? 'Aprovado.' : 'Mudanças solicitadas.'),
  })

  // Não muda o status aqui de propósito: quem reflete "aprovado"/"mudanças pedidas" no
  // status da tarefa é o polling, ao detectar este mesmíssimo review que acabou de ser
  // postado — um único caminho de verdade pro estado, venha o review de onde vier.
  await updateTaskStatus(task.id, task.status, { costUsedUsd: task.costUsedUsd + result.costUsd })
  return requireTask(task.id)
}

function buildFixPrompt(
  files: { path: string; content: string }[],
  feedback: string,
  taskDescription: string | undefined,
): string {
  const filesBlock = files.length
    ? files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n')
    : '(nenhum arquivo do escopo foi encontrado no repositório)'

  return [
    'Você é o Dev do time. O QA revisou seu Pull Request e pediu as seguintes mudanças:',
    feedback,
    '',
    taskDescription ? `Tarefa original: ${taskDescription}` : '',
    '',
    'Arquivos atuais no Pull Request (já commitados):',
    filesBlock,
    '',
    RESPONSE_FORMAT_INSTRUCTIONS,
  ].join('\n')
}

/**
 * Uma rodada de ajuste do Dev em resposta ao feedback do QA: lê os comentários, corrige e
 * dá push DIRETO na branch da tarefa — sem passar pela revisão humana de diff de novo (o
 * loop Dev↔QA roda autônomo até convergir ou bater um teto; só o merge final é manual).
 */
export async function runDevFixRound(task: Task, feedback: string): Promise<Task> {
  const employee = await getEmployee(task.employeeId)
  if (!employee) throw new Error('Funcionário (Dev) não encontrado.')
  if (!task.branch) throw new Error('Tarefa sem branch isolada associada.')

  const { repo, scopes } = await loadScopedRepo(employee, task.projectId)

  const contextFiles = await gatherScopedContext(repo.localPath, scopes.map((scope) => scope.pathGlob))
  const userPrompt = buildFixPrompt(contextFiles, feedback, task.description)
  const messages: Message[] = [{ id: 'dev-fix', role: 'user', content: userPrompt }]

  const result = await sendToAI(messages, employee.systemPrompt, {
    preferredProvider: employee.preferredProvider,
    fallbackProvider: employee.fallbackProvider,
    taskId: task.id,
  })

  if (result.needsFallback) {
    throw new Error(
      `"${employee.name}" esgotou a cota do provedor preferido e precisa de decisão manual sobre trocar de IA.`,
    )
  }

  await addMessage(task.id, {
    role: 'assistant',
    content: result.content,
    provider: result.provider,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  })
  emitTerminalLine(task.employeeId, 'ai', result.content)

  const parsedFiles = parseFileBlocks(result.content)
  const scopeMatchers = scopes.map((scope) => globToRegExp(scope.pathGlob))
  const inScope = parsedFiles.filter((file) => scopeMatchers.some((re) => re.test(file.filePath)))

  if (inScope.length === 0) {
    throw new Error('A IA não propôs nenhum arquivo dentro do escopo para corrigir.')
  }

  for (const file of inScope) {
    await writeRepoFile(repo.localPath, task.branch, file.filePath, file.newContent)
  }

  const commitMessage = `Ajustes pedidos pelo QA — ${task.title}`
  await commitFiles(repo.localPath, task.branch, inScope.map((file) => file.filePath), commitMessage, task.employeeId)

  const token = await getStoredGithubToken()
  await pushBranch(repo.localPath, task.branch, task.employeeId, token)

  // Idem: o status "aguardando QA de novo" vem do polling, ao detectar este push (evento
  // `pushed`) — não o setamos direto aqui, pro estado ter uma única fonte de verdade.
  await updateTaskStatus(task.id, task.status, { costUsedUsd: task.costUsedUsd + result.costUsd })
  return requireTask(task.id)
}

// --- Fluxo 2: Orquestrador → tasks (docs/07-colaboracao-e-fluxos.md) ---
// Você descreve uma funcionalidade; o Orquestrador quebra em uma tarefa pro Dev e uma pro
// QA. O comportamento de COMO quebrar vem inteiramente do prompt de sistema do Orquestrador
// — este módulo só fornece o encanamento (chamar a IA, criar as tarefas, tocar o Dev).

const ORCHESTRATOR_RESPONSE_FORMAT_INSTRUCTIONS = `
Quebre a funcionalidade descrita em tarefas para o time. Responda EXATAMENTE neste formato,
um bloco <task> por tarefa (no máximo uma com role="dev" e uma com role="qa"):

<task role="dev" title="título curto da tarefa do Dev">
Descrição detalhada do que o Dev precisa implementar.
</task>

<task role="qa" title="título curto da tarefa do QA">
Descrição detalhada do que o QA precisa validar quando o PR estiver aberto.
</task>

Não escreva nada fora desses blocos.
`.trim()

function buildOrchestratorPrompt(featureDescription: string): string {
  return ['Funcionalidade solicitada:', featureDescription, '', ORCHESTRATOR_RESPONSE_FORMAT_INSTRUCTIONS].join('\n')
}

interface ParsedOrchestratorTask {
  role: 'dev' | 'qa'
  title: string
  description: string
}

const ORCHESTRATOR_TASK_RE = /<task\s+role="(dev|qa)"\s+title="([^"]*)"\s*>\n?([\s\S]*?)\n?<\/task>/g

function parseOrchestratorResponse(responseText: string): ParsedOrchestratorTask[] {
  const tasks: ParsedOrchestratorTask[] = []
  for (const match of responseText.matchAll(ORCHESTRATOR_TASK_RE)) {
    const [, role, title, description] = match
    if (title.trim()) {
      tasks.push({ role: role as 'dev' | 'qa', title: title.trim(), description: description.trim() })
    }
  }
  return tasks
}

export interface RunOrchestratorInput {
  projectId: string
  orchestratorEmployeeId: string
  featureDescription: string
}

export interface RunOrchestratorResult {
  /** A tarefa do Dev já rodada — "[Dev] pega a task automaticamente → entra no Fluxo 1". */
  devTask?: RunTaskResult
  /** Tarefa de acompanhamento criada pro QA (fica no board; a revisão de verdade acontece
   *  no Fluxo 1, reatribuindo a MESMA tarefa do Dev quando o PR abrir). */
  qaTask?: Task
  warnings: string[]
}

/**
 * Roda o Orquestrador: ele lê a funcionalidade pedida e quebra em tasks pro time, seguindo
 * as instruções do prompt de sistema dele. A tarefa do Dev é disparada na hora (mesma coisa
 * que você clicar em "Rodar tarefa"); a do QA fica registrada, aguardando o Fluxo 1.
 */
export async function runOrchestrator(input: RunOrchestratorInput): Promise<RunOrchestratorResult> {
  const orchestrator = await getEmployee(input.orchestratorEmployeeId)
  if (!orchestrator) throw new Error('Funcionário (Orquestrador) não encontrado.')
  if (orchestrator.role !== 'orchestrator') {
    throw new Error(`"${orchestrator.name}" não tem o papel de Orquestrador.`)
  }

  const project = await getProject(input.projectId)
  if (!project) throw new Error('Projeto não encontrado.')

  const userPrompt = buildOrchestratorPrompt(input.featureDescription)
  const messages: Message[] = [{ id: 'orchestrator', role: 'user', content: userPrompt }]

  const result = await sendToAI(messages, orchestrator.systemPrompt, {
    preferredProvider: orchestrator.preferredProvider,
    fallbackProvider: orchestrator.fallbackProvider,
  })

  if (result.needsFallback) {
    throw new Error(
      `"${orchestrator.name}" esgotou a cota do provedor preferido. Troque de provedor em ` +
        'Configurações (ou espere a quota liberar) e tente de novo.',
    )
  }

  // Eco no Terminal ao vivo: não existe uma "tarefa" ainda pra prender essa mensagem no
  // histórico (é ela quem decide se cria uma ou duas), mas a resposta já aconteceu — só exibe.
  emitTerminalLine(orchestrator.id, 'ai', result.content)

  const parsedTasks = parseOrchestratorResponse(result.content)
  const devPlan = parsedTasks.find((planned) => planned.role === 'dev')
  const qaPlan = parsedTasks.find((planned) => planned.role === 'qa')

  const warnings: string[] = []
  if (!devPlan) warnings.push('O Orquestrador não propôs uma tarefa para o Dev.')
  if (!qaPlan) warnings.push('O Orquestrador não propôs uma tarefa para o QA.')

  let devTask: RunTaskResult | undefined
  if (devPlan) {
    const dev = await findTeamMemberByRole(project, 'dev')
    if (!dev) {
      warnings.push('Nenhum Dev configurado na equipe deste projeto — a tarefa do Dev não foi criada.')
    } else {
      // "[Dev] pega a task automaticamente → entra no Fluxo 1": roda a tarefa agora mesmo,
      // exatamente como se você tivesse clicado em "Rodar tarefa" pra esse funcionário.
      devTask = await runTask({
        projectId: input.projectId,
        employeeId: dev.id,
        title: devPlan.title,
        description: devPlan.description,
        createdBy: orchestrator.id,
      })
    }
  }

  let qaTask: Task | undefined
  if (qaPlan) {
    const qa = await findTeamMemberByRole(project, 'qa')
    if (!qa) {
      warnings.push('Nenhum QA configurado na equipe deste projeto — a tarefa do QA não foi criada.')
    } else {
      const settings = await getAppSettings()
      qaTask = await createTask({
        projectId: input.projectId,
        employeeId: qa.id,
        title: qaPlan.title,
        description: qaPlan.description,
        status: 'pending',
        createdBy: orchestrator.id,
        maxRounds: settings.defaultMaxRounds,
        costCapUsd: settings.defaultCostCapUsd,
      })
    }
  }

  return { devTask, qaTask, warnings }
}
