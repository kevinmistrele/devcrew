import { useState } from 'react'
import { Check, FileDiff, FilePlus2, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ProposedFileDiff } from '@/core/diff-engine'

interface DiffViewerProps {
  diffs: ProposedFileDiff[]
  onApprove: (change: ProposedFileDiff) => Promise<void> | void
  onReject: (change: ProposedFileDiff) => Promise<void> | void
}

export function DiffViewer({ diffs, onApprove, onReject }: DiffViewerProps) {
  const [busyId, setBusyId] = useState<string | null>(null)

  if (diffs.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma mudança proposta.</p>
  }

  async function handle(change: ProposedFileDiff, action: 'approve' | 'reject') {
    setBusyId(change.id)
    try {
      await (action === 'approve' ? onApprove(change) : onReject(change))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {diffs.map((change) => {
        const busy = busyId === change.id
        return (
          <Card key={change.id} size="sm">
            <CardHeader>
              <CardTitle className="flex min-w-0 items-center gap-2 font-mono text-xs">
                {change.isNewFile ? (
                  <FilePlus2 className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{change.filePath}</span>
                {change.isNewFile && (
                  <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                    novo
                  </Badge>
                )}
              </CardTitle>

              <CardAction>
                {change.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handle(change, 'reject')}>
                      {busy ? <Loader2 className="animate-spin" /> : <X />}
                      Rejeitar
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => handle(change, 'approve')}>
                      {busy ? <Loader2 className="animate-spin" /> : <Check />}
                      Aprovar
                    </Button>
                  </div>
                ) : (
                  <Badge variant={change.status === 'approved' ? 'default' : 'secondary'}>
                    {change.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                  </Badge>
                )}
              </CardAction>
            </CardHeader>

            <CardContent className="p-0">
              <div className="max-h-80 overflow-auto border-t border-border font-mono text-xs">
                {change.lines.map((line, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex whitespace-pre-wrap px-3 py-0.5',
                      line.type === 'add' && 'bg-green-500/15 text-green-800 dark:text-green-300',
                      line.type === 'remove' && 'bg-red-500/15 text-red-800 dark:text-red-300',
                    )}
                  >
                    <span className="mr-2 shrink-0 select-none text-muted-foreground">
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                    </span>
                    <span className="min-w-0 break-all">{line.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
