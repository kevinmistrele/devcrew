// pullRequests: abre PRs reais no GitHub via API (comando Rust). Nunca faz merge — essa
// decisão é sempre manual, direto no GitHub.
import { invoke } from '@tauri-apps/api/core'
import { getStoredGithubToken } from './token'

export interface PullRequestInfo {
  number: number
  htmlUrl: string
}

export interface CreatePullRequestInput {
  remoteUrl: string
  base: string
  head: string
  title: string
  body: string
}

/**
 * Abre um Pull Request real no GitHub, usando o token salvo no keychain. Nunca faz merge —
 * essa decisão é sempre manual, direto no GitHub.
 */
export async function createPullRequest(input: CreatePullRequestInput): Promise<PullRequestInfo> {
  const token = await getStoredGithubToken()
  if (!token) {
    throw new Error('Nenhum token do GitHub conectado. Configure em Configurações.')
  }
  return invoke<PullRequestInfo>('github_create_pull_request', {
    token,
    remoteUrl: input.remoteUrl,
    base: input.base,
    head: input.head,
    title: input.title,
    body: input.body,
  })
}

export interface CreatePullRequestReviewInput {
  remoteUrl: string
  prNumber: number
  event: 'APPROVE' | 'REQUEST_CHANGES'
  body: string
}

/**
 * Envia um review real no PR — aprovação ou pedido de mudanças. Usado pelo QA no loop
 * Dev↔QA (docs/07-colaboracao-e-fluxos.md). Isso nunca faz merge: review e merge são ações
 * separadas na API do GitHub, e merge é sempre feito manualmente pelo usuário.
 */
export async function createPullRequestReview(input: CreatePullRequestReviewInput): Promise<void> {
  const token = await getStoredGithubToken()
  if (!token) {
    throw new Error('Nenhum token do GitHub conectado. Configure em Configurações.')
  }
  await invoke('github_create_pull_request_review', {
    token,
    remoteUrl: input.remoteUrl,
    pullNumber: input.prNumber,
    event: input.event,
    body: input.body,
  })
}
