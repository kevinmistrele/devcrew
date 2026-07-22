import { useSyncExternalStore } from 'react'
import { getThemePreference, setThemePreference, subscribeTheme, type ThemePreference } from '@/core/theme'

export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribeTheme, getThemePreference)
  return [preference, setThemePreference]
}
