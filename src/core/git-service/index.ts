// git-service: clonar, conectar, ler a árvore de um repositório local, isolar/escrever o
// trabalho de uma tarefa numa branch dedicada, e — só com confirmação explícita do usuário
// na UI — commitar e enviar essa branch pro remoto. Nunca dá merge.
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export interface GitRepoInfo {
  name: string
  localPath: string
  remoteUrl?: string
  defaultBranch: string
}

export interface GitTreeEntry {
  name: string
  path: string
  isDir: boolean
}

/** Clona um repo remoto para dentro de `<appData>/repos/projects`. */
export async function cloneRepo(url: string, token?: string): Promise<GitRepoInfo> {
  return invoke<GitRepoInfo>('git_clone_repo', { url, token })
}

/** Valida e conecta um repositório Git já existente no disco, no caminho onde ele está. */
export async function connectExistingRepo(path: string): Promise<GitRepoInfo> {
  return invoke<GitRepoInfo>('git_connect_existing', { path })
}

/** Abre o seletor nativo de pastas do SO; retorna null se o usuário cancelar. */
export async function pickLocalRepoFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, title: 'Selecionar repositório' })
  return typeof selected === 'string' ? selected : null
}

/**
 * Lista um nível da árvore de arquivos do repo (lazy-load), ignorando `.git`
 * e tudo que o `.gitignore` cobre. `subPath` é relativo à raiz do repo.
 */
export async function listRepoDir(repoPath: string, subPath?: string): Promise<GitTreeEntry[]> {
  return invoke<GitTreeEntry[]>('git_list_dir', { repoPath, subPath })
}

/**
 * Lista recursivamente todos os arquivos do repo (ou de um subcaminho), ignorando `.git`
 * e o que o `.gitignore` cobre. `maxEntries` evita varrer um repositório enorme por inteiro.
 */
export async function listRepoFilesRecursive(
  repoPath: string,
  options?: { subPath?: string; maxEntries?: number },
): Promise<GitTreeEntry[]> {
  return invoke<GitTreeEntry[]>('git_list_files_recursive', {
    repoPath,
    subPath: options?.subPath,
    maxEntries: options?.maxEntries,
  })
}

/** Lê um arquivo do repo. Retorna `null` (em vez de lançar) quando o arquivo não existe. */
export async function readRepoFile(repoPath: string, filePath: string): Promise<string | null> {
  return invoke<string | null>('git_read_file', { repoPath, filePath })
}

/** Nome da branch atualmente com checkout no repositório. */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  return invoke<string>('git_current_branch', { repoPath })
}

/**
 * Cria (se preciso) e faz checkout de uma branch isolada para uma tarefa — nunca `main`/`master`.
 * Todo o trabalho de um agente acontece nessa branch, nunca direto na branch principal.
 */
export async function createTaskBranch(repoPath: string, branchName: string): Promise<string> {
  return invoke<string>('git_create_task_branch', { repoPath, branchName })
}

/**
 * Escreve o conteúdo de um arquivo no disco. O backend recusa a escrita se a branch com
 * checkout não for `branchName` — segunda camada de defesa contra escrever na main.
 */
export async function writeRepoFile(
  repoPath: string,
  branchName: string,
  filePath: string,
  content: string,
): Promise<void> {
  await invoke('git_write_file', { repoPath, branchName, filePath, content })
}

/**
 * Cria um commit contendo só os `filePaths` passados (as mudanças aprovadas da tarefa) na
 * branch isolada. Recusa se a branch com checkout não for a esperada. Retorna o SHA do commit.
 *
 * `channelId` é a aba do Terminal ao vivo (normalmente o id do funcionário) que recebe o
 * eco real de `git add`/`git commit` — texto genuíno, não gerado por IA (docs/07).
 */
export async function commitFiles(
  repoPath: string,
  branchName: string,
  filePaths: string[],
  message: string,
  channelId: string,
): Promise<string> {
  return invoke<string>('git_commit_files', { repoPath, branchName, channelId, filePaths, message })
}

/**
 * Envia a branch isolada da tarefa pro remoto `origin`. Nunca dá push na main/master, e não
 * dá merge — isso é sempre feito manualmente pelo usuário, direto no GitHub.
 *
 * `channelId` é a aba do Terminal ao vivo que recebe o progresso real do push (mensagens
 * que o próprio servidor Git manda, e o progresso de envio de objetos) — docs/07.
 */
export async function pushBranch(
  repoPath: string,
  branchName: string,
  channelId: string,
  token?: string,
): Promise<void> {
  await invoke('git_push_branch', { repoPath, branchName, channelId, token })
}
