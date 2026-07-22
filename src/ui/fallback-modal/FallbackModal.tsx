import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { providerLabel } from '@/core/employee-manager'
import type { PendingFallback } from '@/core/task-runner'

function formatTokens(tokens: number): string {
  if (tokens <= 0) return '0 tokens'
  if (tokens >= 1000) return `~${Math.round(tokens / 1000)}k tokens`
  return `~${tokens} tokens`
}

interface FallbackModalProps {
  fallback: PendingFallback | null
  confirming: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal aberto quando o ai-router sinaliza `needsFallback`: o provedor preferido esgotou a
 * quota. O router nunca troca sozinho — é aqui que o usuário decide continuar com o
 * fallback (reenviando o mesmo histórico) ou pausar a tarefa.
 */
export function FallbackModal({ fallback, confirming, onConfirm, onCancel }: FallbackModalProps) {
  return (
    <Dialog
      open={fallback !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {fallback && (
          <>
            <DialogHeader>
              <DialogTitle>Créditos do {providerLabel(fallback.from)} acabaram</DialogTitle>
              <DialogDescription>
                Deseja continuar esta tarefa com {providerLabel(fallback.to)}? O mesmo histórico da
                conversa será reenviado — nada se perde.
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              {providerLabel(fallback.from)}: {formatTokens(fallback.remainingTokensFrom)} restantes ·{' '}
              {providerLabel(fallback.to)}: {formatTokens(fallback.remainingTokensTo)} restantes
              <br />
              <span className="text-xs">(estimativa com base no teto de custo da tarefa)</span>
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={onCancel} disabled={confirming}>
                Pausar tarefa
              </Button>
              <Button onClick={onConfirm} disabled={confirming}>
                {confirming && <Loader2 className="animate-spin" />}
                Continuar com {providerLabel(fallback.to)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
