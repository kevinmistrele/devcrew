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
import { COST_CAP_INCREMENT_USD, ROUND_CAP_INCREMENT } from '@/core/loop-controller'
import type { Task } from '@/core/db'

const REASON_COPY: Record<'rounds' | 'cost' | 'error', { title: string; description: string }> = {
  rounds: {
    title: 'Loop pausado — teto de rodadas atingido',
    description: 'O QA já revisou o máximo de vezes combinado pra esta tarefa, sem convergir.',
  },
  cost: {
    title: 'Loop pausado — teto de custo atingido',
    description: 'O gasto de IA nesta tarefa bateu no teto configurado.',
  },
  error: {
    title: 'Loop pausado — precisa de uma decisão',
    description: 'Algo impediu a próxima rodada de rodar sozinha.',
  },
}

const RESUME_LABEL: Record<'rounds' | 'cost' | 'error', string> = {
  rounds: `Continuar (+${ROUND_CAP_INCREMENT} rodadas)`,
  cost: `Continuar (+$${COST_CAP_INCREMENT_USD.toFixed(2)})`,
  error: 'Tentar de novo',
}

interface LoopPausedModalProps {
  /** Só passe uma tarefa com `status === 'paused'` e `pausedReason` definido. */
  task: Task | null
  resuming: boolean
  onResume: () => void
  onDismiss: () => void
}

/**
 * Aberto quando o loop-controller pausa o loop Dev↔QA (Fluxo 1, docs/07) por ter batido um
 * dos dois tetos — rodadas ou custo/tokens — ou por precisar de uma decisão manual (ex.:
 * fallback de IA pendente). O loop NUNCA continua sozinho depois disso.
 */
export function LoopPausedModal({ task, resuming, onResume, onDismiss }: LoopPausedModalProps) {
  const reason = task?.pausedReason ? REASON_COPY[task.pausedReason] : undefined

  return (
    <Dialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {task && reason && task.pausedReason && (
          <>
            <DialogHeader>
              <DialogTitle>{reason.title}</DialogTitle>
              <DialogDescription>{reason.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p>
                Rodadas: {task.round} / {task.maxRounds}
              </p>
              <p>
                Custo: ${task.costUsedUsd.toFixed(2)} / ${task.costCapUsd.toFixed(2)}
              </p>
              <p className="text-xs">
                O PR continua aberto e nada foi perdido — nenhum merge é feito automaticamente. O
                merge sempre depende de você, direto no GitHub.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onDismiss} disabled={resuming}>
                Deixar pausado
              </Button>
              <Button onClick={onResume} disabled={resuming}>
                {resuming && <Loader2 className="animate-spin" />}
                {RESUME_LABEL[task.pausedReason]}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
