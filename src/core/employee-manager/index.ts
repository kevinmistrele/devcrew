// employee-manager: CRUD de funcionários, seus prompts de sistema, permissões e escopo de repositórios.
import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  getTeam,
  listEmployees,
  updateEmployee,
  type CreateEmployeeInput,
  type Employee,
  type Permission,
  type Project,
  type ProviderId,
  type Role,
} from '@/core/db'

export { listEmployees, getEmployee, deleteEmployee }
export type { CreateEmployeeInput }

/**
 * Acha o funcionário da equipe do projeto com um papel específico (ex.: o Dev ou o QA do
 * time). Usado tanto pelo loop-controller (Fluxo 1, pra alternar Dev↔QA) quanto pelo
 * task-runner (Fluxo 2, pra distribuir as tarefas que o Orquestrador cria).
 */
export async function findTeamMemberByRole(project: Project, role: Role): Promise<Employee | undefined> {
  if (!project.teamId) return undefined
  const team = await getTeam(project.teamId)
  if (!team) return undefined
  const employees = await listEmployees()
  return employees.find((employee) => team.memberIds.includes(employee.id) && employee.role === role)
}

export interface SaveEmployeeInput extends CreateEmployeeInput {
  id?: string
}

/** Cria um funcionário novo ou atualiza um existente, conforme a presença de `id`. */
export async function saveEmployee(input: SaveEmployeeInput): Promise<Employee> {
  const { id, ...rest } = input
  return id ? updateEmployee(id, rest) : createEmployee(rest)
}

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'orchestrator', label: 'Orquestrador' },
  { value: 'dev', label: 'Dev' },
  { value: 'qa', label: 'QA' },
  { value: 'documenter', label: 'Documentador' },
  { value: 'architect', label: 'Arquiteto' },
]

export const PROVIDER_OPTIONS: { value: ProviderId; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (ChatGPT)' },
]

export const PERMISSION_OPTIONS: { value: Permission; label: string }[] = [
  { value: 'read', label: 'Somente leitura' },
  { value: 'write', label: 'Escrita' },
  { value: 'commit', label: 'Pode commitar' },
]

export function roleLabel(role: Role): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role
}

export function providerLabel(provider: ProviderId): string {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider
}
