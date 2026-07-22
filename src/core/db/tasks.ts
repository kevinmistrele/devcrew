// tasks.ts: acesso tipado à tabela tasks, com messages e proposed_changes aninhados.
import { getDb } from './client'
import type { Message, ProposedChange, ProviderId, Task, TaskStatus } from './types'

interface TaskRow {
  id: string
  project_id: string
  employee_id: string
  created_by: string | null
  title: string
  description: string | null
  status: TaskStatus
  branch: string | null
  pr_number: number | null
  pr_url: string | null
  round: number
  max_rounds: number
  cost_cap_usd: number
  cost_used_usd: number
  paused_reason: 'rounds' | 'cost' | 'error' | null
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  task_id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  provider: ProviderId | null
  tokens_in: number | null
  tokens_out: number | null
  created_at: string
}

interface ProposedChangeRow {
  id: string
  task_id: string
  file_path: string
  diff: string
  old_content: string | null
  new_content: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    provider: row.provider ?? undefined,
    tokensIn: row.tokens_in ?? undefined,
    tokensOut: row.tokens_out ?? undefined,
    createdAt: row.created_at,
  }
}

function toProposedChange(row: ProposedChangeRow): ProposedChange {
  return {
    id: row.id,
    filePath: row.file_path,
    diff: row.diff,
    oldContent: row.old_content,
    newContent: row.new_content,
    status: row.status,
  }
}

function toTask(row: TaskRow, messages: MessageRow[], changes: ProposedChangeRow[]): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    employeeId: row.employee_id,
    createdBy: row.created_by ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    branch: row.branch ?? undefined,
    prNumber: row.pr_number ?? undefined,
    prUrl: row.pr_url ?? undefined,
    round: row.round,
    maxRounds: row.max_rounds,
    costCapUsd: row.cost_cap_usd,
    costUsedUsd: row.cost_used_usd,
    pausedReason: row.paused_reason ?? undefined,
    messages: messages.filter((message) => message.task_id === row.id).map(toMessage),
    changes: changes.filter((change) => change.task_id === row.id).map(toProposedChange),
  }
}

export async function listTasks(projectId?: string): Promise<Task[]> {
  const db = await getDb()
  const taskRows = projectId
    ? await db.select<TaskRow[]>('SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at', [projectId])
    : await db.select<TaskRow[]>('SELECT * FROM tasks ORDER BY created_at')

  const taskIds = taskRows.map((row) => row.id)
  if (taskIds.length === 0) return []

  const placeholders = taskIds.map((_, index) => `$${index + 1}`).join(', ')
  const [messageRows, changeRows] = await Promise.all([
    db.select<MessageRow[]>(`SELECT * FROM messages WHERE task_id IN (${placeholders}) ORDER BY created_at`, taskIds),
    db.select<ProposedChangeRow[]>(`SELECT * FROM proposed_changes WHERE task_id IN (${placeholders}) ORDER BY created_at`, taskIds),
  ])

  return taskRows.map((row) => toTask(row, messageRows, changeRows))
}

export async function getTask(id: string): Promise<Task | undefined> {
  const db = await getDb()
  const [taskRows, messageRows, changeRows] = await Promise.all([
    db.select<TaskRow[]>('SELECT * FROM tasks WHERE id = $1', [id]),
    db.select<MessageRow[]>('SELECT * FROM messages WHERE task_id = $1 ORDER BY created_at', [id]),
    db.select<ProposedChangeRow[]>('SELECT * FROM proposed_changes WHERE task_id = $1 ORDER BY created_at', [id]),
  ])
  const row = taskRows[0]
  return row ? toTask(row, messageRows, changeRows) : undefined
}

export interface CreateTaskInput {
  projectId: string
  employeeId: string
  title: string
  description?: string
  /** Só tarefas que mexem em código têm branch isolada — tarefas de acompanhamento (ex.: a
   *  do QA criada pelo Orquestrador no Fluxo 2) podem não ter nenhuma ainda. */
  branch?: string
  /** Default `running` (fluxo direto de sempre); passe `pending` pra uma tarefa que só
   *  registra uma expectativa e não deve rodar sozinha (ex.: a do QA no Fluxo 2). */
  status?: TaskStatus
  /** Orquestrador que criou esta tarefa, se houver (Fluxo 2) — null quando é você mesmo. */
  createdBy?: string
  maxRounds?: number
  costCapUsd?: number
}

/** Cria a tarefa (default `running`), presa à branch isolada onde o funcionário vai trabalhar. */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO tasks
      (id, project_id, employee_id, created_by, title, description, status, branch, round, max_rounds, cost_cap_usd, cost_used_usd, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, 0, $11, $11)`,
    [
      id,
      input.projectId,
      input.employeeId,
      input.createdBy ?? null,
      input.title,
      input.description ?? null,
      input.status ?? 'running',
      input.branch ?? null,
      input.maxRounds ?? 5,
      input.costCapUsd ?? 2.0,
      now,
    ],
  )
  return (await getTask(id))!
}

export interface UpdateTaskStatusPatch {
  pausedReason?: 'rounds' | 'cost' | 'error'
  costUsedUsd?: number
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  patch?: UpdateTaskStatusPatch,
): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.execute(
    `UPDATE tasks SET status = $2, paused_reason = $3, cost_used_usd = COALESCE($4, cost_used_usd), updated_at = $5
     WHERE id = $1`,
    [id, status, patch?.pausedReason ?? null, patch?.costUsedUsd ?? null, now],
  )
}

export interface AddMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
  provider?: ProviderId
  tokensIn?: number
  tokensOut?: number
}

export async function addMessage(taskId: string, input: AddMessageInput): Promise<void> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO messages (id, task_id, role, content, provider, tokens_in, tokens_out, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, taskId, input.role, input.content, input.provider ?? null, input.tokensIn ?? 0, input.tokensOut ?? 0, now],
  )
}

export interface LinkPullRequestInput {
  prNumber: number
  prUrl: string
}

/** Vincula o PR real aberto no GitHub à tarefa, e move o status pra `pr_open`. */
export async function linkPullRequest(id: string, input: LinkPullRequestInput): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.execute(
    `UPDATE tasks SET status = 'pr_open', pr_number = $2, pr_url = $3, updated_at = $4 WHERE id = $1`,
    [id, input.prNumber, input.prUrl, now],
  )
}

/** Troca o funcionário responsável atual — usado pelo loop-controller pra alternar Dev↔QA. */
export async function setTaskEmployee(id: string, employeeId: string): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.execute('UPDATE tasks SET employee_id = $2, updated_at = $3 WHERE id = $1', [id, employeeId, now])
}

/** Incrementa `round` em 1 — cada olhada do QA no loop Dev↔QA conta como uma rodada. */
export async function incrementTaskRound(id: string): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.execute('UPDATE tasks SET round = round + 1, updated_at = $2 WHERE id = $1', [id, now])
}

export interface BumpTaskCapsInput {
  addRounds?: number
  addCostUsd?: number
}

/** Estende os tetos da tarefa (rodadas e/ou custo) — usado ao retomar um loop pausado. */
export async function bumpTaskCaps(id: string, input: BumpTaskCapsInput): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.execute(
    `UPDATE tasks SET
       max_rounds = max_rounds + COALESCE($2, 0),
       cost_cap_usd = cost_cap_usd + COALESCE($3, 0),
       updated_at = $4
     WHERE id = $1`,
    [id, input.addRounds ?? null, input.addCostUsd ?? null, now],
  )
}
