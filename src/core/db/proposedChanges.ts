// proposedChanges.ts: escrita na tabela proposed_changes — leitura fica em tasks.ts
// (mudanças sempre são lidas aninhadas numa tarefa).
import { getDb } from './client'
import type { ProposedChange } from './types'

export interface CreateProposedChangeInput {
  taskId: string
  filePath: string
  diff: string
  oldContent: string | null
  newContent: string
}

export async function createProposedChange(input: CreateProposedChangeInput): Promise<ProposedChange> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO proposed_changes (id, task_id, file_path, diff, old_content, new_content, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
    [id, input.taskId, input.filePath, input.diff, input.oldContent, input.newContent, now],
  )
  return {
    id,
    filePath: input.filePath,
    diff: input.diff,
    oldContent: input.oldContent,
    newContent: input.newContent,
    status: 'pending',
  }
}

export async function updateProposedChangeStatus(
  id: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE proposed_changes SET status = $2 WHERE id = $1', [id, status])
}
