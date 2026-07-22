import { cn } from '@/lib/utils'

interface ErrorMessageProps {
  message: string
  className?: string
}

/** Erro inline padrão — `role="alert"` garante que leitores de tela anunciem sozinhos. */
export function ErrorMessage({ message, className }: ErrorMessageProps) {
  return (
    <p role="alert" className={cn('text-sm text-destructive', className)}>
      {message}
    </p>
  )
}
