// provider/openai: adaptador da API da OpenAI — implementa a interface AIProvider comum.
// A API key nunca é lida do SQLite: vem do keychain do SO via core/secrets.
import OpenAI, { APIError } from 'openai'
import { deleteSecret, getSecret, setSecret } from '@/core/secrets'
import type { AIProvider, AIResponse, Message } from '@/core/db'

const OPENAI_API_KEY = 'openai_api_key'
const DEFAULT_MODEL = 'gpt-5.1'
const MAX_TOKENS = 4096

// USD por 1M tokens — ver docs/05-multi-ia-fallback.md.
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.1': { input: 3, output: 15 },
}

async function getClient(): Promise<OpenAI> {
  const apiKey = await getSecret(OPENAI_API_KEY)
  if (!apiKey) {
    throw new Error('Nenhuma API key da OpenAI conectada. Configure em Configurações.')
  }
  // O app roda dentro do WebView do Tauri, não num navegador público — a OpenAI
  // aceita chamadas diretas do cliente nesse caso via este header de opt-in.
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
}

function toOpenAIMessages(
  messages: Message[],
  systemPrompt: string,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const history = messages
    .filter((message): message is Message & { role: 'user' | 'assistant' } =>
      message.role === 'user' || message.role === 'assistant',
    )
    .map((message): OpenAI.Chat.ChatCompletionMessageParam => ({ role: message.role, content: message.content }))
  return [{ role: 'system', content: systemPrompt }, ...history]
}

function calcCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = PRICING[model] ?? PRICING[DEFAULT_MODEL]
  return (tokensIn / 1_000_000) * pricing.input + (tokensOut / 1_000_000) * pricing.output
}

export const openaiProvider: AIProvider = {
  id: 'openai',
  pricePerMillionTokens: PRICING[DEFAULT_MODEL],

  async send(messages: Message[], systemPrompt: string): Promise<AIResponse> {
    const client = await getClient()
    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      messages: toOpenAIMessages(messages, systemPrompt),
    })

    const content = response.choices[0]?.message?.content ?? ''
    const tokensIn = response.usage?.prompt_tokens ?? 0
    const tokensOut = response.usage?.completion_tokens ?? 0
    const costUsd = calcCostUsd(response.model, tokensIn, tokensOut)

    // Gravar em `usage` é responsabilidade do ai-router (só ele sabe a que tarefa, se
    // houver, esta chamada pertence) — ver core/ai-router.
    return { content, tokensIn, tokensOut, costUsd }
  },

  isQuotaError(err: unknown): boolean {
    if (err instanceof APIError) {
      return err.status === 429 || /quota|insufficient/i.test(err.message)
    }
    return false
  },
}

export interface OpenAIConnection {
  model: string
  displayName: string
}

async function testConnection(): Promise<OpenAIConnection> {
  const client = await getClient()
  const model = await client.models.retrieve(DEFAULT_MODEL)
  return { model: model.id, displayName: model.id }
}

/** Salva a API key no keychain e valida contra a API da OpenAI. Reverte se inválida. */
export async function connectOpenAI(apiKey: string): Promise<OpenAIConnection> {
  await setSecret(OPENAI_API_KEY, apiKey)
  try {
    return await testConnection()
  } catch (err) {
    await deleteSecret(OPENAI_API_KEY)
    throw err
  }
}

export async function disconnectOpenAI(): Promise<void> {
  await deleteSecret(OPENAI_API_KEY)
}

/** Lê a chave salva e reconfirma que ainda é válida. Autolimpa se foi revogada. */
export async function checkOpenAIConnection(): Promise<OpenAIConnection | null> {
  const apiKey = await getSecret(OPENAI_API_KEY)
  if (!apiKey) return null
  try {
    return await testConnection()
  } catch {
    await disconnectOpenAI()
    return null
  }
}

/** Testa a conexão sob demanda (botão "Testar conexão"), sem alterar o keychain. */
export async function testOpenAIConnection(): Promise<OpenAIConnection> {
  return testConnection()
}
