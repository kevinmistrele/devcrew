// taskEvents.ts: acesso tipado à tabela task_events (eventos do GitHub detectados por polling).
import { getDb } from './client'
import type { TaskEvent, TaskEventType } from './types'

interface TaskEventRow {
  id: string
  task_id: string
  type: TaskEventType
  payload: string | null
  handled: number
  created_at: string
}

function toTaskEvent(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type,
    payload: row.payload ? (JSON.parse(row.payload) as unknown) : undefined,
    handled: row.handled === 1,
  }
}

export async function listTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const db = await getDb()
  const rows = await db.select<TaskEventRow[]>(
    'SELECT * FROM task_events WHERE task_id = $1 ORDER BY created_at',
    [taskId],
  )
  return rows.map(toTaskEvent)
}

export interface CreateTaskEventInput {
  taskId: string
  type: TaskEventType
  payload?: unknown
}

/** Grava um evento real do GitHub detectado por polling (ver core/github-service/eventPolling). */
export async function createTaskEvent(input: CreateTaskEventInput): Promise<TaskEvent> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const payloadJson = input.payload !== undefined ? JSON.stringify(input.payload) : null
  await db.execute(
    'INSERT INTO task_events (id, task_id, type, payload, handled, created_at) VALUES ($1, $2, $3, $4, 0, $5)',
    [id, input.taskId, input.type, payloadJson, now],
  )
  return { id, taskId: input.taskId, type: input.type, payload: input.payload, handled: false }
}
