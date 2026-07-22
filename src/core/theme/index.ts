// theme: alterna claro/escuro/sistema, persistido em localStorage. Aplica a classe `dark`
// no <html> de forma síncrona já no carregamento do módulo — importar isso cedo (ver
// main.tsx) evita um flash do tema errado antes do React montar.
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'devcrew-theme'
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_MEDIA_QUERY).matches
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function resolveIsDark(pref: ThemePreference): boolean {
  return pref === 'system' ? systemPrefersDark() : pref === 'dark'
}

function applyTheme(pref: ThemePreference): void {
  document.documentElement.classList.toggle('dark', resolveIsDark(pref))
}

let preference: ThemePreference = readStoredPreference()
applyTheme(preference)

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function getThemePreference(): ThemePreference {
  return preference
}

export function setThemePreference(next: ThemePreference): void {
  preference = next
  localStorage.setItem(STORAGE_KEY, next)
  applyTheme(next)
  notify()
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Com a preferência em "sistema", reage em tempo real se o SO trocar de tema.
window.matchMedia(DARK_MEDIA_QUERY).addEventListener('change', () => {
  if (preference === 'system') {
    applyTheme(preference)
    notify()
  }
})
