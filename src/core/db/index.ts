// db: camada de acesso a dados tipada sobre o SQLite local (via plugin oficial do Tauri).
export * from './types'
export { getDb } from './client'
export { listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee } from './employees'
export type { CreateEmployeeInput } from './employees'
export { listRepos, getRepo, createRepo } from './repos'
export type { CreateRepoInput } from './repos'
export { listTeams, getTeam } from './teams'
export { listProjects, getProject, createProject } from './projects'
export type { CreateProjectInput } from './projects'
export {
  listTasks,
  getTask,
  createTask,
  updateTaskStatus,
  addMessage,
  linkPullRequest,
  setTaskEmployee,
  incrementTaskRound,
  bumpTaskCaps,
} from './tasks'
export type {
  CreateTaskInput,
  UpdateTaskStatusPatch,
  AddMessageInput,
  LinkPullRequestInput,
  BumpTaskCapsInput,
} from './tasks'
export { createProposedChange, updateProposedChangeStatus } from './proposedChanges'
export type { CreateProposedChangeInput } from './proposedChanges'
export { listTaskEvents, createTaskEvent } from './taskEvents'
export type { CreateTaskEventInput } from './taskEvents'
export { listUsage, recordUsage, listUsageByProvider, listUsageByProject, listUsageByDay } from './usage'
export type {
  RecordUsageInput,
  ProviderUsageSummary,
  ProjectUsageSummary,
  DailyUsageSummary,
} from './usage'
export { getAppSettings, updateAppSettings } from './appSettings'
export type { AppSettings } from './appSettings'
