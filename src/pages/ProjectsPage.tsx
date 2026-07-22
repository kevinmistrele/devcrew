import { useEffect, useState } from 'react'
import { FolderGit2, FolderOpen, Loader2, MousePointerClick, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { listProjects, listRepos, type Project, type Repo } from '@/core/db'
import { createProjectFromClone, createProjectFromExisting } from '@/core/project-manager'
import { pickLocalRepoFolder } from '@/core/git-service'
import { FileTree } from '@/ui/file-tree'
import { EmptyState, ErrorMessage, PageLoader } from '@/ui/feedback'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [reposById, setReposById] = useState<Record<string, Repo>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function refresh() {
    try {
      const [projectRows, repoRows] = await Promise.all([listProjects(), listRepos()])
      setProjects(projectRows)
      setReposById(Object.fromEntries(repoRows.map((repo) => [repo.id, repo])))
      setSelectedId((current) => current ?? projectRows[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const selectedProject = projects.find((p) => p.id === selectedId)
  const selectedRepo = selectedProject ? reposById[selectedProject.repoId] : undefined

  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="flex w-full shrink-0 flex-col border-b border-border md:h-full md:w-64 md:border-r md:border-b-0 lg:w-72">
        <div className="flex items-center justify-between p-3">
          <h1 className="text-sm font-medium">Projetos</h1>
          <Button size="icon-sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus />
            <span className="sr-only">Novo projeto</span>
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 p-2 pt-0">
            {loading && <PageLoader label="Carregando…" className="p-3 text-xs" />}
            {!loading && error && <ErrorMessage message={error} className="p-3 text-xs" />}

            {!loading && !error && projects.length === 0 && (
              <EmptyState
                icon={FolderGit2}
                title="Nenhum projeto ainda"
                description="Clone um repositório ou conecte um que já existe no seu disco."
                action={
                  <Button size="sm" onClick={() => setDialogOpen(true)}>
                    <Plus />
                    Novo projeto
                  </Button>
                }
                className="m-1 border-none p-3"
              />
            )}

            {projects.map((project) => {
              const repo = reposById[project.repoId]
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedId(project.id)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted',
                    selectedId === project.id && 'bg-muted',
                  )}
                >
                  <span className="text-sm font-medium">{project.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FolderGit2 className="size-3" />
                    {repo?.name ?? '—'}
                    <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                      {project.origin === 'new' ? 'clonado' : 'existente'}
                    </Badge>
                  </span>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      <div className="min-w-0 flex-1 overflow-auto p-6">
        {!loading && !selectedProject && (
          <EmptyState
            icon={MousePointerClick}
            title="Selecione um projeto"
            description="Escolha um projeto na lista ao lado para ver os arquivos do repositório."
          />
        )}

        {selectedProject && selectedRepo && (
          <Card>
            <CardHeader>
              <CardTitle>{selectedProject.name}</CardTitle>
              <p className="truncate text-xs text-muted-foreground">{selectedRepo.localPath}</p>
            </CardHeader>
            <CardContent className="p-0">
              <FileTree repoPath={selectedRepo.localPath} />
            </CardContent>
          </Card>
        )}
      </div>

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={async (project) => {
          await refresh()
          setSelectedId(project.id)
        }}
      />
    </div>
  )
}

function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (project: Project) => void
}) {
  const [mode, setMode] = useState<'clone' | 'existing'>('clone')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [path, setPath] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setUrl('')
    setPath('')
    setError(null)
    setSubmitting(false)
  }

  async function handlePickFolder() {
    const selected = await pickLocalRepoFolder()
    if (selected) setPath(selected)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const project =
        mode === 'clone'
          ? await createProjectFromClone({ name, url: url.trim() })
          : await createProjectFromExisting({ name, path: path.trim() })
      onCreated(project)
      onOpenChange(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = mode === 'clone' ? url.trim().length > 0 : path.trim().length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>
            Clone um repositório novo ou conecte um que já existe no seu disco.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'clone' | 'existing')}>
          <TabsList className="w-full">
            <TabsTrigger value="clone">Clonar repo</TabsTrigger>
            <TabsTrigger value="existing">Conectar existente</TabsTrigger>
          </TabsList>

          <TabsContent value="clone" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="clone-url">URL do repositório</Label>
              <Input
                id="clone-url"
                placeholder="https://github.com/usuario/repo.git"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Repos privados usam o token do GitHub salvo em Configurações.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="existing" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="existing-path">Pasta no disco</Label>
              <div className="flex gap-2">
                <Input
                  id="existing-path"
                  placeholder="Selecione uma pasta…"
                  value={path}
                  readOnly
                />
                <Button type="button" variant="outline" onClick={handlePickFolder}>
                  <FolderOpen />
                  Escolher
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label htmlFor="project-name">Nome do projeto (opcional)</Label>
          <Input
            id="project-name"
            placeholder="Usa o nome do repo se deixar em branco"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {error && <ErrorMessage message={error} className="text-xs" />}

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {mode === 'clone' ? 'Clonar' : 'Conectar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
