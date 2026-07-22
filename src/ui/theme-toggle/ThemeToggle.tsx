import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveIsDark } from '@/core/theme'
import { useTheme } from './useTheme'

/** Alternância rápida entre claro/escuro — o controle completo (+ "sistema") fica em Configurações. */
export function ThemeToggle() {
  const [preference, setPreference] = useTheme()
  const isDark = resolveIsDark(preference)
  const label = isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'

  return (
    <Button variant="ghost" size="icon-sm" onClick={() => setPreference(isDark ? 'light' : 'dark')}>
      {isDark ? <Sun /> : <Moon />}
      <span className="sr-only">{label}</span>
    </Button>
  )
}
