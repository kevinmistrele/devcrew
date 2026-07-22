import { useSyncExternalStore } from 'react'
import { Badge } from '@/components/ui/badge'
import { getSessionUsageSnapshot, subscribeSessionUsage } from '@/core/ai-router'
import { providerLabel } from '@/core/employee-manager'

export function CostBar() {
  const usage = useSyncExternalStore(subscribeSessionUsage, getSessionUsageSnapshot)
  const totalTokens = usage.tokensIn + usage.tokensOut

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-border bg-sidebar px-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span>Provedor:</span>
        <Badge variant="outline" className="h-5 px-1.5 font-normal">
          {usage.activeProvider ? providerLabel(usage.activeProvider) : '—'}
        </Badge>
      </span>
      <span>Tokens: {totalTokens > 0 ? `${usage.tokensIn} in / ${usage.tokensOut} out` : '—'}</span>
      <span>Custo: ${usage.costUsd.toFixed(4)}</span>
    </footer>
  )
}
