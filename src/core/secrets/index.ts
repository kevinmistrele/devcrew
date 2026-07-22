// secrets: acesso a valores sensíveis no keychain do SO (nunca no SQLite).
// É só uma fronteira fina sobre os comandos Rust — a leitura/escrita real acontece no backend.
import { invoke } from '@tauri-apps/api/core'

export async function setSecret(key: string, value: string): Promise<void> {
  await invoke('secret_set', { key, value })
}

export async function getSecret(key: string): Promise<string | undefined> {
  const value = await invoke<string | null>('secret_get', { key })
  return value ?? undefined
}

export async function deleteSecret(key: string): Promise<void> {
  await invoke('secret_delete', { key })
}
