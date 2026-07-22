// client.ts: carrega a conexão SQLite única usada por toda a camada de acesso a dados.
import Database from '@tauri-apps/plugin-sql'

const DB_PATH = 'sqlite:devcrew.db'

let dbPromise: Promise<Database> | null = null

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_PATH)
  }
  return dbPromise
}
