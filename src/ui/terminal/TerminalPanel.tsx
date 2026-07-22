import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useTerminalLines } from './useTerminalLines'
import type { TerminalStream } from '@/core/terminal-service'

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('pt-BR', { hour12: false })
}

const STREAM_CLASSNAME: Record<TerminalStream, string> = {
  stdout: 'text-zinc-200',
  stderr: 'text-red-400',
  ai: 'text-cyan-300',
}

const STREAM_PREFIX: Record<TerminalStream, string> = {
  stdout: '$',
  stderr: '!',
  ai: '»',
}

interface TerminalPanelProps {
  channelId: string
}

/**
 * Espelho de I/O real de um funcionário: stdout/stderr de processos (git) e eco de
 * respostas de IA que já aconteceram. Fonte monoespaçada, fundo escuro — nunca gera texto
 * por conta própria (ver core/terminal-service).
 */
export function TerminalPanel({ channelId }: TerminalPanelProps) {
  const lines = useTerminalLines(channelId)
  const scrollRef = useRef<HTMLDivElement>(null)

  const lastLineId = lines[lines.length - 1]?.id

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    // `lines.length` para de mudar quando o buffer atinge o teto de 500 (linhas antigas são
    // descartadas); o id da última linha muda sempre, então é ele que garante o auto-scroll.
  }, [lastLineId])

  return (
    <div
      ref={scrollRef}
      className="h-[calc(100vh-16rem)] min-h-64 overflow-y-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs leading-relaxed"
    >
      {lines.length === 0 && (
        <p className="text-zinc-500">
          Nada ainda — aparece aqui assim que este funcionário rodar um comando git ou responder alguma tarefa.
        </p>
      )}
      {lines.map((line) => (
        <div key={line.id} className="flex gap-2 whitespace-pre-wrap break-all">
          <span className="shrink-0 select-none text-zinc-600">{formatTime(line.timestamp)}</span>
          <span className={cn('shrink-0 select-none', STREAM_CLASSNAME[line.stream])}>
            {STREAM_PREFIX[line.stream]}
          </span>
          <span className={STREAM_CLASSNAME[line.stream]}>{line.text}</span>
        </div>
      ))}
    </div>
  )
}
