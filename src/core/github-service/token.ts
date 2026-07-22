// token: conexão com o GitHub via Personal Access Token.
// O token nunca é persistido no SQLite — vive só no keychain do SO (ver core/secrets).
import { invoke } from '@tauri-apps/api/core'
import { deleteSecret, getSecret, setSecret } from '@/core/secrets'

const GITHUB_TOKEN_KEY = 'github_pat'

export interface GithubUser {
  login: string
  name?: string
  avatarUrl?: string
}

async function validateToken(token: string): Promise<GithubUser> {
  return invoke<GithubUser>('github_validate_token', { token })
}

/** Valida o token contra a API do GitHub e, se válido, salva no keychain do SO. */
export async function connectGithub(token: string): Promise<GithubUser> {
  const user = await validateToken(token)
  await setSecret(GITHUB_TOKEN_KEY, token)
  return user
}

export async function disconnectGithub(): Promise<void> {
  await deleteSecret(GITHUB_TOKEN_KEY)
}

export async function getStoredGithubToken(): Promise<string | undefined> {
  return getSecret(GITHUB_TOKEN_KEY)
}

/**
 * Lê o token salvo e confirma que ainda é válido junto ao GitHub.
 * Se o token foi revogado, limpa o keychain e retorna null.
 */
export async function checkGithubConnection(): Promise<GithubUser | null> {
  const token = await getStoredGithubToken()
  if (!token) return null

  try {
    return await validateToken(token)
  } catch {
    await disconnectGithub()
    return null
  }
}
