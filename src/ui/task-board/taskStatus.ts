// taskStatus: rótulos em pt-BR pra cada status de tarefa, e as colunas do kanban.
import type { TaskStatus } from '@/core/db'

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendente',
  running: 'Em andamento',
  pr_open: 'PR aberto',
  changes_requested: 'Mudanças solicitadas',
  qa_approved: 'Aprovado pelo QA',
  awaiting_merge: 'Aguardando merge',
  done: 'Concluído',
  paused: 'Pausado',
  rejected: 'Rejeitado',
}

export interface KanbanColumn {
  status: TaskStatus
  label: string
}

// As 7 colunas pedidas, na ordem do fluxo — mais "Pausado", porque esconder tarefas
// pausadas (teto de rodadas/custo, ou fallback de IA pendente) seria abrir mão exatamente
// da visibilidade que a trava de segurança do loop existe pra dar (docs/07).
export const KANBAN_COLUMNS: KanbanColumn[] = [
  { status: 'pending', label: TASK_STATUS_LABELS.pending },
  { status: 'running', label: TASK_STATUS_LABELS.running },
  { status: 'pr_open', label: TASK_STATUS_LABELS.pr_open },
  { status: 'changes_requested', label: TASK_STATUS_LABELS.changes_requested },
  { status: 'qa_approved', label: TASK_STATUS_LABELS.qa_approved },
  { status: 'awaiting_merge', label: TASK_STATUS_LABELS.awaiting_merge },
  { status: 'done', label: TASK_STATUS_LABELS.done },
  { status: 'paused', label: TASK_STATUS_LABELS.paused },
]

/** Tarefas que ainda contam como "na fila" de um funcionário — done/rejected já saíram. */
export const QUEUE_STATUSES: TaskStatus[] = [
  'pending',
  'running',
  'pr_open',
  'changes_requested',
  'qa_approved',
  'awaiting_merge',
  'paused',
]
