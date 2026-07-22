// types.ts: interfaces de domínio espelhando docs/04-modelo-de-dados.md.
// As API keys nunca aparecem aqui — ficam no keychain do SO.

export type Role = 'orchestrator' | 'dev' | 'qa' | 'documenter' | 'architect'
export type Permission = 'read' | 'write' | 'commit'
export type ProviderId = 'anthropic' | 'openai'

export interface Employee {
  id: string
  name: string
  role: Role
  avatar?: string
  systemPrompt: string
  preferredProvider: ProviderId
  fallbackProvider?: ProviderId
  permission: Permission
  scopes: EmployeeScope[]
}

export interface EmployeeScope {
  repoId: string
  pathGlob: string // ex: 'src/**'
}

export interface Repo {
  id: string
  name: string
  localPath: string
  remoteUrl?: string
  defaultBranch: string
}

export interface Team {
  id: string
  name: string
  memberIds: string[] // employees
}

export interface Project {
  id: string
  name: string
  repoId: string
  teamId?: string
  origin: 'new' | 'existing'
}

export type TaskStatus =
  | 'pending' | 'running' | 'pr_open' | 'changes_requested'
  | 'qa_approved' | 'awaiting_merge' | 'done' | 'paused' | 'rejected'

export interface Task {
  id: string
  projectId: string
  employeeId: string // responsável atual
  createdBy?: string // orquestrador que criou
  title: string
  description?: string
  status: TaskStatus
  branch?: string
  prNumber?: number
  prUrl?: string
  round: number // rodadas Dev↔QA já ocorridas
  maxRounds: number // teto de rodadas
  costCapUsd: number // teto de custo
  costUsedUsd: number // custo acumulado
  pausedReason?: 'rounds' | 'cost' | 'error'
  messages: Message[]
  changes: ProposedChange[]
}

export type TaskEventType =
  | 'pr_opened' | 'changes_requested' | 'review_approved' | 'pushed'

export interface TaskEvent {
  id: string
  taskId: string
  type: TaskEventType
  payload?: unknown
  handled: boolean
}

export interface Message {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  provider?: ProviderId
  tokensIn?: number
  tokensOut?: number
  /** Ausente em mensagens efêmeras montadas só pra mandar pro provedor (nunca persistidas). */
  createdAt?: string
}

export interface ProposedChange {
  id: string
  filePath: string
  diff: string // diff unificado, para exibição/histórico
  oldContent: string | null // null = arquivo novo
  newContent: string // conteúdo completo a escrever no disco se aprovado
  status: 'pending' | 'approved' | 'rejected'
}

export interface Usage {
  id: string
  provider: ProviderId
  taskId?: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  createdAt: string
}

// Contrato comum a todos os provedores de IA
export interface AIProvider {
  id: ProviderId
  send(messages: Message[], systemPrompt: string): Promise<AIResponse>
  isQuotaError(err: unknown): boolean
  /** USD por 1M tokens do modelo default do provedor — usado pra estimar tokens restantes no fallback. */
  pricePerMillionTokens: { input: number; output: number }
}

export interface AIResponse {
  content: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}
