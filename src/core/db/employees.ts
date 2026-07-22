// employees.ts: acesso tipado às tabelas employees e employee_scopes.
import type Database from '@tauri-apps/plugin-sql'
import { getDb } from './client'
import type { Employee, EmployeeScope, Permission, ProviderId, Role } from './types'

interface EmployeeRow {
  id: string
  name: string
  role: Role
  avatar: string | null
  system_prompt: string
  preferred_provider: ProviderId
  fallback_provider: ProviderId | null
  permission: Permission
  created_at: string
  updated_at: string
}

interface EmployeeScopeRow {
  id: string
  employee_id: string
  repo_id: string
  path_glob: string
}

function toEmployee(row: EmployeeRow, scopes: EmployeeScopeRow[]): Employee {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    avatar: row.avatar ?? undefined,
    systemPrompt: row.system_prompt,
    preferredProvider: row.preferred_provider,
    fallbackProvider: row.fallback_provider ?? undefined,
    permission: row.permission,
    scopes: scopes
      .filter((scope) => scope.employee_id === row.id)
      .map((scope): EmployeeScope => ({ repoId: scope.repo_id, pathGlob: scope.path_glob })),
  }
}

export async function listEmployees(): Promise<Employee[]> {
  const db = await getDb()
  const [employeeRows, scopeRows] = await Promise.all([
    db.select<EmployeeRow[]>('SELECT * FROM employees ORDER BY name'),
    db.select<EmployeeScopeRow[]>('SELECT * FROM employee_scopes'),
  ])
  return employeeRows.map((row) => toEmployee(row, scopeRows))
}

export async function getEmployee(id: string): Promise<Employee | undefined> {
  const db = await getDb()
  const [employeeRows, scopeRows] = await Promise.all([
    db.select<EmployeeRow[]>('SELECT * FROM employees WHERE id = $1', [id]),
    db.select<EmployeeScopeRow[]>('SELECT * FROM employee_scopes WHERE employee_id = $1', [id]),
  ])
  const row = employeeRows[0]
  return row ? toEmployee(row, scopeRows) : undefined
}

export interface CreateEmployeeInput {
  name: string
  role: Role
  avatar?: string
  systemPrompt: string
  preferredProvider: ProviderId
  fallbackProvider?: ProviderId
  permission: Permission
  scopes: EmployeeScope[]
}

async function replaceScopes(db: Database, employeeId: string, scopes: EmployeeScope[]): Promise<void> {
  await db.execute('DELETE FROM employee_scopes WHERE employee_id = $1', [employeeId])
  for (const scope of scopes) {
    await db.execute(
      'INSERT INTO employee_scopes (id, employee_id, repo_id, path_glob) VALUES ($1, $2, $3, $4)',
      [crypto.randomUUID(), employeeId, scope.repoId, scope.pathGlob || '**'],
    )
  }
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO employees
      (id, name, role, avatar, system_prompt, preferred_provider, fallback_provider, permission, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [
      id,
      input.name,
      input.role,
      input.avatar ?? null,
      input.systemPrompt,
      input.preferredProvider,
      input.fallbackProvider ?? null,
      input.permission,
      now,
    ],
  )
  await replaceScopes(db, id, input.scopes)
  return { id, ...input }
}

export async function updateEmployee(id: string, input: CreateEmployeeInput): Promise<Employee> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.execute(
    `UPDATE employees SET
      name = $2, role = $3, avatar = $4, system_prompt = $5,
      preferred_provider = $6, fallback_provider = $7, permission = $8, updated_at = $9
     WHERE id = $1`,
    [
      id,
      input.name,
      input.role,
      input.avatar ?? null,
      input.systemPrompt,
      input.preferredProvider,
      input.fallbackProvider ?? null,
      input.permission,
      now,
    ],
  )
  await replaceScopes(db, id, input.scopes)
  return { id, ...input }
}

export async function deleteEmployee(id: string): Promise<void> {
  const db = await getDb()
  await db.execute('DELETE FROM employees WHERE id = $1', [id])
}
