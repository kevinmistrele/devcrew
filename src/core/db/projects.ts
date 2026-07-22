// projects.ts: acesso tipado à tabela projects.
import { getDb } from './client'
import type { Project } from './types'

interface ProjectRow {
  id: string
  name: string
  repo_id: string
  team_id: string | null
  origin: 'new' | 'existing'
  created_at: string
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    repoId: row.repo_id,
    teamId: row.team_id ?? undefined,
    origin: row.origin,
  }
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb()
  const rows = await db.select<ProjectRow[]>('SELECT * FROM projects ORDER BY name')
  return rows.map(toProject)
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDb()
  const rows = await db.select<ProjectRow[]>('SELECT * FROM projects WHERE id = $1', [id])
  return rows[0] ? toProject(rows[0]) : undefined
}

export interface CreateProjectInput {
  name: string
  repoId: string
  teamId?: string
  origin: 'new' | 'existing'
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await db.execute(
    'INSERT INTO projects (id, name, repo_id, team_id, origin, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, input.name, input.repoId, input.teamId ?? null, input.origin, createdAt],
  )
  return {
    id,
    name: input.name,
    repoId: input.repoId,
    teamId: input.teamId,
    origin: input.origin,
  }
}
