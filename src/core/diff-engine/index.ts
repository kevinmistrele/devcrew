// diff-engine: transforma a resposta em texto da IA em mudanças de arquivo estruturadas,
// calcula o diff linha a linha para o diff-viewer renderizar, e escreve no disco (via
// git-service, na branch isolada da tarefa) quando uma mudança é aprovada.
import { diffLines, createPatch } from 'diff'
import { writeRepoFile } from '@/core/git-service'
import { createProposedChange, updateProposedChangeStatus, type ProposedChange } from '@/core/db'

/**
 * O contrato de resposta que pedimos à IA no prompt do task-runner: um bloco `<file>`
 * por arquivo criado/modificado, sempre com o conteúdo completo e final do arquivo.
 */
const FILE_BLOCK_RE = /<file\s+path="([^"]+)"\s*>\n?([\s\S]*?)\n?<\/file>/g

export interface ParsedFileChange {
  filePath: string
  newContent: string
}

export function parseFileBlocks(responseText: string): ParsedFileChange[] {
  const changes: ParsedFileChange[] = []
  for (const match of responseText.matchAll(FILE_BLOCK_RE)) {
    const [, filePath, content] = match
    if (filePath.trim()) {
      changes.push({ filePath: filePath.trim(), newContent: content })
    }
  }
  return changes
}

export interface DiffLineEntry {
  type: 'add' | 'remove' | 'context'
  value: string
}

export interface FileDiffResult {
  filePath: string
  oldContent: string | null
  newContent: string
  unifiedDiff: string
  lines: DiffLineEntry[]
  isNewFile: boolean
}

/** Calcula o diff linha a linha de um arquivo (`oldContent` null = arquivo novo). */
export function buildFileDiff(filePath: string, oldContent: string | null, newContent: string): FileDiffResult {
  const before = oldContent ?? ''
  const unifiedDiff = createPatch(filePath, before, newContent, 'antes', 'depois')

  const lines: DiffLineEntry[] = []
  for (const part of diffLines(before, newContent)) {
    const type: DiffLineEntry['type'] = part.added ? 'add' : part.removed ? 'remove' : 'context'
    const valueLines = part.value.split('\n')
    if (valueLines[valueLines.length - 1] === '') valueLines.pop()
    for (const value of valueLines) lines.push({ type, value })
  }

  return { filePath, oldContent, newContent, unifiedDiff, lines, isNewFile: oldContent === null }
}

export interface ProposedFileDiff extends FileDiffResult {
  id: string
  status: ProposedChange['status']
}

/** Persiste os diffs calculados como proposed_changes, retornando-os já com o id salvo. */
export async function persistProposedChanges(
  taskId: string,
  diffs: FileDiffResult[],
): Promise<ProposedFileDiff[]> {
  const results: ProposedFileDiff[] = []
  for (const diff of diffs) {
    const saved = await createProposedChange({
      taskId,
      filePath: diff.filePath,
      diff: diff.unifiedDiff,
      oldContent: diff.oldContent,
      newContent: diff.newContent,
    })
    results.push({ ...diff, id: saved.id, status: saved.status })
  }
  return results
}

/** Aprova uma mudança: escreve o conteúdo novo no disco (na branch isolada) e marca `approved`. */
export async function approveChange(
  change: ProposedFileDiff,
  repoPath: string,
  branchName: string,
): Promise<void> {
  await writeRepoFile(repoPath, branchName, change.filePath, change.newContent)
  await updateProposedChangeStatus(change.id, 'approved')
}

/** Rejeita uma mudança: nada é escrito no disco, só marca `rejected`. */
export async function rejectChange(change: ProposedFileDiff): Promise<void> {
  await updateProposedChangeStatus(change.id, 'rejected')
}
