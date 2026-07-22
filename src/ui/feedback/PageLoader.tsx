import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageLoaderProps {
  label?: string
  className?: string
}

/** Loading padrão pra toda a tela — centralizado, anunciado a leitores de tela. */
export function PageLoader({ label = 'Carregando…', className }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground', className)}
    >
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  )
}
