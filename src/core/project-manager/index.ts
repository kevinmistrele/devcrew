// project-manager: CRUD de projetos (repo + equipe), criando do zero (clone) ou conectando um
// repositório já existente no disco. Orquestra git-service (I/O de Git) + db (persistência).
import { cloneRepo, connectExistingRepo, type GitRepoInfo } from '@/core/git-service'
import { createProject, createRepo, type Project } from '@/core/db'
import { getStoredGithubToken } from '@/core/github-service'

export interface CreateProjectFromCloneInput {
  name?: string
  url: string
  teamId?: string
}

export async function createProjectFromClone(input: CreateProjectFromCloneInput): Promise<Project> {
  const token = await getStoredGithubToken()
  const repoInfo = await cloneRepo(input.url, token)
  return persistProject(input.name, repoInfo, 'new', input.teamId)
}

export interface CreateProjectFromExistingInput {
  name?: string
  path: string
  teamId?: string
}

export async function createProjectFromExisting(
  input: CreateProjectFromExistingInput,
): Promise<Project> {
  const repoInfo = await connectExistingRepo(input.path)
  return persistProject(input.name, repoInfo, 'existing', input.teamId)
}

async function persistProject(
  name: string | undefined,
  repoInfo: GitRepoInfo,
  origin: 'new' | 'existing',
  teamId: string | undefined,
): Promise<Project> {
  const repo = await createRepo({
    name: repoInfo.name,
    localPath: repoInfo.localPath,
    remoteUrl: repoInfo.remoteUrl,
    defaultBranch: repoInfo.defaultBranch,
  })
  return createProject({
    name: name?.trim() || repoInfo.name,
    repoId: repo.id,
    teamId,
    origin,
  })
}
