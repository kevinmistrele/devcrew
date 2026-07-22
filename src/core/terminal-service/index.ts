// terminal-service: o "Terminal ao vivo" de docs/07 — um espelho de I/O real por
// funcionário, nunca IA narrando. Duas fontes alimentam cada canal (aba = funcionário):
//
// 1. I/O de processo real: eventos `terminal:line` que o backend Rust emite a partir de
//    callbacks genuínos do git2 (texto que o próprio servidor manda durante push, hash de
//    commit) — sem custo de token, sem chamada de IA nenhuma.
// 2. Eco de uma resposta de IA que JÁ aconteceu: quem gera o texto é o task-runner, na
//    mesma chamada que qualquer forma já faria (Dev/QA/Orquestrador). Este módulo só
//    reaproveita o conteúdo pra exibir — `emitTerminalLine` nunca dispara uma chamada nova.
//
// Regra de ouro (docs/07): nenhuma chamada de IA existe só pra alimentar esta tela.
import { listen } from '@tauri-apps/api/event'

export type TerminalStream = 'stdout' | 'stderr' | 'ai'

export interface TerminalLine {
  id: string
  stream: TerminalStream
  text: string
  timestamp: string
}

const MAX_LINES_PER_CHANNEL = 500
const EMPTY_LINES: TerminalLine[] = []

const buffers = new Map<string, TerminalLine[]>()
const listeners = new Map<string, Set<() => void>>()
const seededChannels = new Set<string>()

function notify(channelId: string): void {
  const subs = listeners.get(channelId)
  if (subs) for (const listener of subs) listener()
}

function appendLines(channelId: string, newLines: TerminalLine[]): void {
  if (newLines.length === 0) return
  const current = buffers.get(channelId) ?? EMPTY_LINES
  const merged = [...current, ...newLines]
  const trimmed = merged.length > MAX_LINES_PER_CHANNEL ? merged.slice(merged.length - MAX_LINES_PER_CHANNEL) : merged
  buffers.set(channelId, trimmed)
  notify(channelId)
}

/** Adiciona uma linha (ou várias, separadas por `\n`) ao terminal de um funcionário. */
export function emitTerminalLine(channelId: string, stream: TerminalStream, text: string): void {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): TerminalLine => ({ id: crypto.randomUUID(), stream, text: line, timestamp: new Date().toISOString() }))
  appendLines(channelId, lines)
}

/**
 * Preenche o histórico de um canal a partir de mensagens de IA já persistidas (nenhuma
 * chamada nova) — só roda uma vez por canal por sessão, pra não duplicar entradas toda
 * vez que a tela do Terminal é revisitada.
 */
export function seedTerminalHistory(channelId: string, entries: { text: string; timestamp: string }[]): void {
  if (seededChannels.has(channelId)) return
  seededChannels.add(channelId)
  if (entries.length === 0) return

  const lines: TerminalLine[] = entries.flatMap((entry) =>
    entry.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line): TerminalLine => ({ id: crypto.randomUUID(), stream: 'ai', text: line, timestamp: entry.timestamp })),
  )
  appendLines(channelId, lines)
}

/** Para `useSyncExternalStore`: assina mudanças no canal (aba) de um funcionário. */
export function subscribeTerminal(channelId: string, listener: () => void): () => void {
  let subs = listeners.get(channelId)
  if (!subs) {
    subs = new Set()
    listeners.set(channelId, subs)
  }
  subs.add(listener)
  return () => subs.delete(listener)
}

export function getTerminalSnapshot(channelId: string): TerminalLine[] {
  return buffers.get(channelId) ?? EMPTY_LINES
}

interface GitTerminalEventPayload {
  channelId: string
  stream: 'stdout' | 'stderr'
  text: string
}

// Assina uma única vez, no carregamento do módulo, os eventos que o backend Rust emite a
// partir de callbacks reais do git2 (ver src-tauri/src/git.rs) — I/O de processo genuíno.
void listen<GitTerminalEventPayload>('terminal:line', (event) => {
  emitTerminalLine(event.payload.channelId, event.payload.stream, event.payload.text)
})
