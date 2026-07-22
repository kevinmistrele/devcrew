// usage.ts: acesso tipado à tabela usage (dashboard de custo por provedor).
import { getDb } from './client'
import type { ProviderId, Usage } from './types'

interface UsageRow {
  id: string
  provider: ProviderId
  task_id: string | null
  tokens_in: number
  tokens_out: number
  cost_usd: number
  created_at: string
}

function toUsage(row: UsageRow): Usage {
  return {
    id: row.id,
    provider: row.provider,
    taskId: row.task_id ?? undefined,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    costUsd: row.cost_usd,
    createdAt: row.created_at,
  }
}

export async function listUsage(taskId?: string): Promise<Usage[]> {
  const db = await getDb()
  const rows = taskId
    ? await db.select<UsageRow[]>('SELECT * FROM usage WHERE task_id = $1 ORDER BY created_at', [taskId])
    : await db.select<UsageRow[]>('SELECT * FROM usage ORDER BY created_at')
  return rows.map(toUsage)
}

export interface RecordUsageInput {
  provider: ProviderId
  taskId?: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}

export async function recordUsage(input: RecordUsageInput): Promise<Usage> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await db.execute(
    'INSERT INTO usage (id, provider, task_id, tokens_in, tokens_out, cost_usd, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, input.provider, input.taskId ?? null, input.tokensIn, input.tokensOut, input.costUsd, createdAt],
  )
  return {
    id,
    provider: input.provider,
    taskId: input.taskId,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    costUsd: input.costUsd,
    createdAt,
  }
}

// --- Agregações pro dashboard de custo/uso ---

export interface ProviderUsageSummary {
  provider: ProviderId
  costUsd: number
  tokensIn: number
  tokensOut: number
  calls: number
}

/** Gasto por provedor — soma de tudo que já foi gasto, sem recorte de período. */
export async function listUsageByProvider(): Promise<ProviderUsageSummary[]> {
  const db = await getDb()
  const rows = await db.select<
    { provider: ProviderId; cost_usd: number; tokens_in: number; tokens_out: number; calls: number }[]
  >(
    `SELECT provider, SUM(cost_usd) as cost_usd, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out, COUNT(*) as calls
     FROM usage GROUP BY provider ORDER BY cost_usd DESC`,
  )
  return rows.map((row) => ({
    provider: row.provider,
    costUsd: row.cost_usd,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    calls: row.calls,
  }))
}

export interface ProjectUsageSummary {
  /** `null` = chamadas sem tarefa vinculada ainda (ex.: a primeira leitura do Orquestrador). */
  projectId: string | null
  projectName: string
  costUsd: number
}

/**
 * Gasto por projeto — via `usage.task_id → tasks.project_id → projects`. Chamadas sem
 * `task_id` (a leitura inicial do Orquestrador, antes de existir tarefa) entram como
 * "Sem projeto" pra o total bater com `listUsageByProvider`.
 */
export async function listUsageByProject(): Promise<ProjectUsageSummary[]> {
  const db = await getDb()
  const [projectRows, totalRows] = await Promise.all([
    db.select<{ project_id: string; project_name: string; cost_usd: number }[]>(
      `SELECT p.id as project_id, p.name as project_name, SUM(u.cost_usd) as cost_usd
       FROM usage u
       JOIN tasks t ON u.task_id = t.id
       JOIN projects p ON t.project_id = p.id
       GROUP BY p.id, p.name
       ORDER BY cost_usd DESC`,
    ),
    db.select<{ cost_usd: number | null }[]>('SELECT SUM(cost_usd) as cost_usd FROM usage'),
  ])

  const attributed = projectRows.reduce((sum, row) => sum + row.cost_usd, 0)
  const total = totalRows[0]?.cost_usd ?? 0
  const unattributed = Math.max(0, total - attributed)

  const result: ProjectUsageSummary[] = projectRows.map((row) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    costUsd: row.cost_usd,
  }))
  if (unattributed > 0.000001) {
    result.push({ projectId: null, projectName: 'Sem projeto', costUsd: unattributed })
  }
  return result
}

export interface DailyUsageSummary {
  day: string // YYYY-MM-DD
  costUsd: number
}

/** Gasto por dia, dos últimos `days` dias (default 30) — pra ver a tendência ao longo do tempo. */
export async function listUsageByDay(days = 30): Promise<DailyUsageSummary[]> {
  const db = await getDb()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const rows = await db.select<{ day: string; cost_usd: number }[]>(
    `SELECT substr(created_at, 1, 10) as day, SUM(cost_usd) as cost_usd
     FROM usage WHERE created_at >= $1 GROUP BY day ORDER BY day`,
    [since],
  )
  return rows.map((row) => ({ day: row.day, costUsd: row.cost_usd }))
}
