// provider/anthropic: adaptador da API da Anthropic — implementa a interface AIProvider comum.
// A API key nunca é lida do SQLite: vem do keychain do SO via core/secrets.
import Anthropic, { APIError, RateLimitError } from '@anthropic-ai/sdk'
import { deleteSecret, getSecret, setSecret } from '@/core/secrets'
import type { AIProvider, AIResponse, Message } from '@/core/db'

const ANTHROPIC_API_KEY = 'anthropic_api_key'
const DEFAULT_MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 4096

// USD por 1M tokens — ver docs/05-multi-ia-fallback.md quando o roteador multi-IA existir.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
}

async function getClient(): Promise<Anthropic> {
  const apiKey = await getSecret(ANTHROPIC_API_KEY)
  if (!apiKey) {
    throw new Error('Nenhuma API key da Anthropic conectada. Configure em Configurações.')
  }
  // O app roda dentro do WebView do Tauri, não num navegador público — a Anthropic
  // aceita chamadas diretas do cliente nesse caso via este header de opt-in.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages
    .filter((message): message is Message & { role: 'user' | 'assistant' } =>
      message.role === 'user' || message.role === 'assistant',
    )
    .map((message) => ({ role: message.role, content: message.content }))
}

function calcCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = PRICING[model] ?? PRICING[DEFAULT_MODEL]
  return (tokensIn / 1_000_000) * pricing.input + (tokensOut / 1_000_000) * pricing.output
}

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  pricePerMillionTokens: PRICING[DEFAULT_MODEL],

  async send(messages: Message[], systemPrompt: string): Promise<AIResponse> {
    const client = await getClient()
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: toAnthropicMessages(messages),
    })

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const tokensIn = response.usage.input_tokens
    const tokensOut = response.usage.output_tokens
    const costUsd = calcCostUsd(response.model, tokensIn, tokensOut)

    // Gravar em `usage` é responsabilidade do ai-router (só ele sabe a que tarefa, se
    // houver, esta chamada pertence) — ver core/ai-router.
    return { content, tokensIn, tokensOut, costUsd }
  },

  isQuotaError(err: unknown): boolean {
    if (err instanceof RateLimitError) return true
    if (err instanceof APIError) {
      return err.type === 'rate_limit_error' || /credit balance|insufficient/i.test(err.message)
    }
    return false
  },
}

export interface AnthropicConnection {
  model: string
  displayName: string
}

async function testConnection(): Promise<AnthropicConnection> {
  const client = await getClient()
  const model = await client.models.retrieve(DEFAULT_MODEL)
  return { model: model.id, displayName: model.display_name }
}

/** Salva a API key no keychain e valida contra a API da Anthropic. Reverte se inválida. */
export async function connectAnthropic(apiKey: string): Promise<AnthropicConnection> {
  await setSecret(ANTHROPIC_API_KEY, apiKey)
  try {
    return await testConnection()
  } catch (err) {
    await deleteSecret(ANTHROPIC_API_KEY)
    throw err
  }
}

export async function disconnectAnthropic(): Promise<void> {
  await deleteSecret(ANTHROPIC_API_KEY)
}

/** Lê a chave salva e reconfirma que ainda é válida. Autolimpa se foi revogada. */
export async function checkAnthropicConnection(): Promise<AnthropicConnection | null> {
  const apiKey = await getSecret(ANTHROPIC_API_KEY)
  if (!apiKey) return null
  try {
    return await testConnection()
  } catch {
    await disconnectAnthropic()
    return null
  }
}

/** Testa a conexão sob demanda (botão "Testar conexão"), sem alterar o keychain. */
export async function testAnthropicConnection(): Promise<AnthropicConnection> {
  return testConnection()
}
