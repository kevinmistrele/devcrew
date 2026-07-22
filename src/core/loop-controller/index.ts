// loop-controller: fecha o loop Dev↔QA do Fluxo 1 (docs/07-colaboracao-e-fluxos.md).
//
// Reage SÓ a eventos reais que o github-service detecta por polling — nunca decide nada
// por conta própria fora disso (nada de "achar" que uma rodada deveria rolar). Ao detectar
// `pr_opened`/`pushed`, aciona o QA; ao detectar `changes_requested`, reaciona o Dev; ao
// detectar `review_approved`, o loop convergiu — só falta o merge, que é sempre manual.
//
// Duas travas de segurança, o que bater primeiro pausa e devolve a decisão pro usuário
// (Modal de Loop Pausado): teto de RODADAS (round >= maxRounds) e teto de CUSTO/tokens
// (costUsedUsd >= costCapUsd). Ambos vêm de tasks (já existiam no schema).
import {
  addMessage,
  bumpTaskCaps,
  getProject,
  getTask,
  incrementTaskRound,
  listTaskEvents,
  setTaskEmployee,
  updateTaskStatus,
  type Task,
  type TaskEventType,
  type TaskStatus,
} from '@/core/db'
import { findTeamMemberByRole } from '@/core/employee-manager'
import { onTaskEvent } from '@/core/github-service'
import { runDevFixRound, runQaReviewRound } from '@/core/task-runner'

/** Quanto o teto se estende quando o usuário escolhe "continuar" no Modal de Loop Pausado. */
export const ROUND_CAP_INCREMENT = 5
export const COST_CAP_INCREMENT_USD = 2

// Estados em que faz sentido o QA olhar (de novo) pro PR: primeira vez (pr_open logo após
// abrir), ou depois de um push — seja ele uma correção do Dev ou algo empurrado por fora.
const REVIEWABLE_STATUSES: TaskStatus[] = ['pr_open', 'changes_requested', 'running']

onTaskEvent((taskId, eventType) => {
  void handleTaskEvent(taskId, eventType)
})

async function handleTaskEvent(taskId: string, eventType: TaskEventType): Promise<void> {
  switch (eventType) {
    case 'pr_opened':
    case 'pushed':
      await maybeTriggerQaReview(taskId)
      return
    case 'changes_requested': {
      const feedback = await lastChangesRequestedFeedback(taskId)
      await maybeTriggerDevFix(taskId, feedback)
      return
    }
    case 'review_approved':
      // Convergiu. Nenhuma ação de IA aqui — só o usuário faz o merge, direto no GitHub.
      return
  }
}

async function lastChangesRequestedFeedback(taskId: string): Promise<string> {
  const events = await listTaskEvents(taskId)
  const last = [...events].reverse().find((event) => event.type === 'changes_requested')
  return extractFeedback(last?.payload)
}

function extractFeedback(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'body' in payload) {
    const body = (payload as { body?: unknown }).body
    if (typeof body === 'string' && body.trim()) return body.trim()
  }
  return 'O QA pediu mudanças no Pull Request (sem comentário detalhado).'
}

/** Aplica os tetos ANTES de gastar um turno de IA. Retorna `true` se pausou (não deve agir). */
async function applyCapsOrPause(task: Task): Promise<boolean> {
  if (task.round >= task.maxRounds) {
    await addMessage(task.id, {
      role: 'system',
      content: `Loop pausado: teto de rodadas atingido (${task.round}/${task.maxRounds}).`,
    })
    await updateTaskStatus(task.id, 'paused', { pausedReason: 'rounds' })
    return true
  }
  if (task.costUsedUsd >= task.costCapUsd) {
    await addMessage(task.id, {
      role: 'system',
      content: `Loop pausado: teto de custo atingido ($${task.costUsedUsd.toFixed(2)}/$${task.costCapUsd.toFixed(2)}).`,
    })
    await updateTaskStatus(task.id, 'paused', { pausedReason: 'cost' })
    return true
  }
  return false
}

async function pauseOnError(taskId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  await addMessage(taskId, { role: 'system', content: `Loop pausado: ${message}` })
  await updateTaskStatus(taskId, 'paused', { pausedReason: 'error' })
}

async function maybeTriggerQaReview(taskId: string): Promise<void> {
  const task = await getTask(taskId)
  if (!task || !REVIEWABLE_STATUSES.includes(task.status)) return
  if (await applyCapsOrPause(task)) return

  const project = await getProject(task.projectId)
  const qa = project ? await findTeamMemberByRole(project, 'qa') : undefined
  if (!qa) return // sem QA configurado na equipe do projeto — não tem quem revisar

  await incrementTaskRound(task.id) // essa olhada do QA conta como uma rodada Dev↔QA
  await setTaskEmployee(task.id, qa.id)

  const reassigned = await getTask(task.id)
  if (!reassigned) return

  try {
    await runQaReviewRound(reassigned)
  } catch (err) {
    await pauseOnError(task.id, err)
  }
}

async function maybeTriggerDevFix(taskId: string, feedback: string): Promise<void> {
  const task = await getTask(taskId)
  if (!task || task.status !== 'changes_requested') return
  if (await applyCapsOrPause(task)) return

  const project = await getProject(task.projectId)
  const dev = project ? await findTeamMemberByRole(project, 'dev') : undefined
  if (!dev) return // sem Dev configurado na equipe do projeto — não tem quem ajustar

  await setTaskEmployee(task.id, dev.id)

  const reassigned = await getTask(task.id)
  if (!reassigned) return

  try {
    await runDevFixRound(reassigned, feedback)
  } catch (err) {
    await pauseOnError(task.id, err)
  }
}

/**
 * Chamado pelo Modal de Loop Pausado quando o usuário escolhe continuar: estende o teto que
 * bateu (rodadas ou custo — `error`, tipo fallback de IA pendente, não tem teto pra
 * estender) e redespacha pro lado do loop que estava esperando, com base no último evento
 * conhecido da tarefa (não há evento novo do GitHub nesse ponto pra disparar sozinho).
 */
export async function resumeTaskLoop(taskId: string): Promise<Task> {
  const task = await getTask(taskId)
  if (!task) throw new Error('Tarefa não encontrada.')
  if (task.status !== 'paused' || !task.pausedReason) {
    throw new Error('Esta tarefa não está com o loop pausado.')
  }

  if (task.pausedReason === 'rounds') {
    await bumpTaskCaps(task.id, { addRounds: ROUND_CAP_INCREMENT })
  } else if (task.pausedReason === 'cost') {
    await bumpTaskCaps(task.id, { addCostUsd: COST_CAP_INCREMENT_USD })
  }

  const events = await listTaskEvents(task.id)
  const lastEvent = events[events.length - 1]

  if (lastEvent?.type === 'changes_requested') {
    await updateTaskStatus(task.id, 'changes_requested')
    await maybeTriggerDevFix(task.id, extractFeedback(lastEvent.payload))
  } else {
    await updateTaskStatus(task.id, 'pr_open')
    await maybeTriggerQaReview(task.id)
  }

  const resumed = await getTask(task.id)
  if (!resumed) throw new Error('Falha ao recarregar a tarefa.')
  return resumed
}
