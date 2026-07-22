// ai-router: abstrai provedores de IA, conta tokens/custo, e detecta esgotamento de quota —
// mas NUNCA troca de provedor sozinho (ver docs/05-multi-ia-fallback.md). Quando o provedor
// preferido falha por quota e o funcionário tem um fallback configurado, o router só sinaliza
// `needsFallback`; quem decide se troca é o usuário, através do modal na UI.
import { anthropicProvider, openaiProvider } from '@/core/provider'
import { recordUsage, type AIProvider, type AIResponse, type Message, type ProviderId } from '@/core/db'

const PROVIDERS: Partial<Record<ProviderId, AIProvider>> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
}

function requireProvider(providerId: ProviderId): AIProvider {
  const provider = PROVIDERS[providerId]
  if (!provider) throw new Error(`Provedor "${providerId}" ainda não está disponível.`)
  return provider
}

export interface AIResponseWithProvider extends AIResponse {
  provider: ProviderId
}

export interface SendToAIOptions {
  preferredProvider: ProviderId
  fallbackProvider?: ProviderId
  /** Tarefa dona desta chamada, se houver — pro dashboard de custo poder atribuir gasto a
   *  um projeto (via usage.task_id → tasks.project_id). Ausente só na chamada inicial do
   *  Orquestrador, que ainda não tem nenhuma tarefa criada. */
  taskId?: string
}

/** Resultado de sucesso: a resposta normal da IA, com o provedor que efetivamente respondeu. */
export interface SendToAISuccess extends AIResponseWithProvider {
  needsFallback: false
}

/**
 * Sinal de "preciso que você decida": o provedor preferido esgotou a quota e há um fallback
 * configurado. O router NÃO reenviou nada ainda — quem decide se troca é o usuário.
 */
export interface SendToAINeedsFallback {
  needsFallback: true
  from: ProviderId
  to: ProviderId
}

export type SendToAIResult = SendToAISuccess | SendToAINeedsFallback

/**
 * Chama o provedor preferido do funcionário. Se der erro de quota e houver fallback
 * configurado, retorna `{ needsFallback: true, from, to }` em vez de trocar sozinho — a UI
 * é quem pergunta ao usuário e decide continuar (ver `sendToProvider`) ou pausar a tarefa.
 * Qualquer outro erro (sem fallback configurado, ou erro que não é de quota) sobe direto.
 */
export async function sendToAI(
  messages: Message[],
  systemPrompt: string,
  options: SendToAIOptions,
): Promise<SendToAIResult> {
  const preferred = requireProvider(options.preferredProvider)

  try {
    const response = await preferred.send(messages, systemPrompt)
    await recordUsage({ provider: options.preferredProvider, taskId: options.taskId, ...response })
    recordSessionUsage({ ...response, provider: options.preferredProvider })
    return { ...response, provider: options.preferredProvider, needsFallback: false }
  } catch (err) {
    if (options.fallbackProvider && preferred.isQuotaError(err)) {
      return { needsFallback: true, from: options.preferredProvider, to: options.fallbackProvider }
    }
    throw err
  }
}

/**
 * Reenvia o MESMO histórico (`messages`) a um provedor específico — chamado depois que o
 * usuário confirma o modal de fallback. Troca "entre tarefas": esta chamada substitui por
 * completo a que falhou, sem tentar de novo o provedor original no meio do caminho.
 */
export async function sendToProvider(
  providerId: ProviderId,
  messages: Message[],
  systemPrompt: string,
  taskId?: string,
): Promise<AIResponseWithProvider> {
  const provider = requireProvider(providerId)
  const response = await provider.send(messages, systemPrompt)
  await recordUsage({ provider: providerId, taskId, ...response })
  recordSessionUsage({ ...response, provider: providerId })
  return { ...response, provider: providerId }
}

/**
 * Estima quantos tokens um provedor ainda "aguenta" dado um orçamento em USD restante
 * (normalmente o teto de custo da tarefa menos o já consumido). Não existe uma API real de
 * "quota restante" nem na Anthropic nem na OpenAI — por isso a estimativa é derivada do
 * próprio teto de custo da tarefa, não de um número inventado.
 */
export function estimateRemainingTokens(providerId: ProviderId, remainingBudgetUsd: number): number {
  const provider = PROVIDERS[providerId]
  if (!provider || remainingBudgetUsd <= 0) return 0
  const pricePerToken = provider.pricePerMillionTokens.output / 1_000_000
  if (pricePerToken <= 0) return 0
  return Math.floor(remainingBudgetUsd / pricePerToken)
}

// --- Uso da sessão atual, para a barra de status (provedor ativo / tokens / custo em tempo real) ---

export interface SessionUsageState {
  activeProvider: ProviderId | null
  tokensIn: number
  tokensOut: number
  costUsd: number
}

let sessionUsage: SessionUsageState = { activeProvider: null, tokensIn: 0, tokensOut: 0, costUsd: 0 }
const sessionUsageListeners = new Set<() => void>()

function recordSessionUsage(response: AIResponseWithProvider): void {
  sessionUsage = {
    activeProvider: response.provider,
    tokensIn: sessionUsage.tokensIn + response.tokensIn,
    tokensOut: sessionUsage.tokensOut + response.tokensOut,
    costUsd: sessionUsage.costUsd + response.costUsd,
  }
  for (const listener of sessionUsageListeners) listener()
}

/** Para `useSyncExternalStore` na barra de status: assina mudanças no uso da sessão. */
export function subscribeSessionUsage(listener: () => void): () => void {
  sessionUsageListeners.add(listener)
  return () => sessionUsageListeners.delete(listener)
}

export function getSessionUsageSnapshot(): SessionUsageState {
  return sessionUsage
}
