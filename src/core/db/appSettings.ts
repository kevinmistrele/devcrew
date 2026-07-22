// appSettings.ts: acesso tipado à tabela app_settings (linha única) — hoje só os tetos
// padrão de rodadas/custo aplicados a toda tarefa nova (ver Configurações na UI).
import { getDb } from './client'

const SETTINGS_ID = 'default'

export interface AppSettings {
  defaultMaxRounds: number
  defaultCostCapUsd: number
}

interface AppSettingsRow {
  id: string
  default_max_rounds: number
  default_cost_cap_usd: number
}

const FALLBACK_SETTINGS: AppSettings = { defaultMaxRounds: 5, defaultCostCapUsd: 2.0 }

export async function getAppSettings(): Promise<AppSettings> {
  const db = await getDb()
  const rows = await db.select<AppSettingsRow[]>('SELECT * FROM app_settings WHERE id = $1', [SETTINGS_ID])
  const row = rows[0]
  return row
    ? { defaultMaxRounds: row.default_max_rounds, defaultCostCapUsd: row.default_cost_cap_usd }
    : FALLBACK_SETTINGS
}

export async function updateAppSettings(input: AppSettings): Promise<AppSettings> {
  const db = await getDb()
  await db.execute(
    'UPDATE app_settings SET default_max_rounds = $2, default_cost_cap_usd = $3 WHERE id = $1',
    [SETTINGS_ID, input.defaultMaxRounds, input.defaultCostCapUsd],
  )
  return input
}
