// repos.ts: acesso tipado à tabela repos.
import { getDb } from './client'
import type { Repo } from './types'

interface RepoRow {
  id: string
  name: string
  local_path: string
  remote_url: string | null
  default_branch: string
  connected_at: string
}

function toRepo(row: RepoRow): Repo {
  return {
    id: row.id,
    name: row.name,
    localPath: row.local_path,
    remoteUrl: row.remote_url ?? undefined,
    defaultBranch: row.default_branch,
  }
}

export async function listRepos(): Promise<Repo[]> {
  const db = await getDb()
  const rows = await db.select<RepoRow[]>('SELECT * FROM repos ORDER BY name')
  return rows.map(toRepo)
}

export async function getRepo(id: string): Promise<Repo | undefined> {
  const db = await getDb()
  const rows = await db.select<RepoRow[]>('SELECT * FROM repos WHERE id = $1', [id])
  return rows[0] ? toRepo(rows[0]) : undefined
}

export interface CreateRepoInput {
  name: string
  localPath: string
  remoteUrl?: string
  defaultBranch: string
}

export async function createRepo(input: CreateRepoInput): Promise<Repo> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const connectedAt = new Date().toISOString()
  await db.execute(
    'INSERT INTO repos (id, name, local_path, remote_url, default_branch, connected_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, input.name, input.localPath, input.remoteUrl ?? null, input.defaultBranch, connectedAt],
  )
  return {
    id,
    name: input.name,
    localPath: input.localPath,
    remoteUrl: input.remoteUrl,
    defaultBranch: input.defaultBranch,
  }
}
