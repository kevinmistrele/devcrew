import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, GitBranch, GitPullRequest, KanbanSquare, Loader2, Sparkles, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getTask,
  listEmployees,
  listProjects,
  listRepos,
  listTasks,
  type Employee,
  type Project,
  type Repo,
  type Task,
} from '@/core/db'
import {
  approveProposedChange,
  continueTaskWithFallback,
  loadTaskResult,
  openPullRequest,
  rejectProposedChange,
  runOrchestrator,
  runTask,
  type RunTaskResult,
} from '@/core/task-runner'
import type { ProposedFileDiff } from '@/core/diff-engine'
import { ensureProjectPolling } from '@/core/github-service'
import { resumeTaskLoop } from '@/core/loop-controller'
import { DiffViewer } from '@/ui/diff-viewer'
import { FallbackModal } from '@/ui/fallback-modal'
import { LoopPausedModal } from '@/ui/loop-paused-modal'
import { EmployeeQueue, TaskBoard } from '@/ui/task-board'
import { EmptyState, ErrorMessage, PageLoader } from '@/ui/feedback'

type BoardView = 'kanban' | 'queue' | 'new'

export function BoardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [reposById, setReposById] = useState<Record<string, Repo>>({})
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({})
  const [employeesById, setEmployeesById] = useState<Record<string, Employee>>({})
  const [allTasks, setAllTasks] = useState<Task[]>([])

  const [view, setView] = useState<BoardView>('kanban')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [loadingSelected, setLoadingSelected] = useState(false)
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [confirmingOpenPr, setConfirmingOpenPr] = useState(false)

  const [projectId, setProjectId] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string>('')
  const [description, setDescription] = useState('')

  const [mode, setMode] = useState<'direct' | 'orchestrator'>('direct')
  const [orchestratorEmployeeId, setOrchestratorEmployeeId] = useState<string>('')
  const [featureDescription, setFeatureDescription] = useState('')
  const [runningOrchestrator, setRunningOrchestrator] = useState(false)
  const [orchestratorWarnings, setOrchestratorWarnings] = useState<string[]>([])
  const [qaTaskInfo, setQaTaskInfo] = useState<Task | null>(null)

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RunTaskResult | null>(null)
  const [confirmingFallback, setConfirmingFallback] = useState(false)
  const [openingPr, setOpeningPr] = useState(false)
  const [resumingLoop, setResumingLoop] = useState(false)
  const [dismissedPauseKey, setDismissedPauseKey] = useState<string | null>(null)

  async function refreshBoard() {
    try {
      const [projectRows, employeeRows, repoRows, taskRows] = await Promise.all([
        listProjects(),
        listEmployees(),
        listRepos(),
        listTasks(),
      ])
      setProjects(projectRows)
      setEmployees(employeeRows)
      setReposById(Object.fromEntries(repoRows.map((repo) => [repo.id, repo])))
      setProjectsById(Object.fromEntries(projectRows.map((project) => [project.id, project])))
      setEmployeesById(Object.fromEntries(employeeRows.map((employee) => [employee.id, employee])))
      setAllTasks(taskRows)
      setProjectId((current) => current || projectRows[0]?.id || '')
      setEmployeeId((current) => current || employeeRows[0]?.id || '')
      setOrchestratorEmployeeId(
        (current) => current || employeeRows.find((employee) => employee.role === 'orchestrator')?.id || '',
      )
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : String(err))
    } finally {
      setBoardLoading(false)
    }
  }

  useEffect(() => {
    void refreshBoard()
  }, [])

  useEffect(() => {
    // O kanban/fila precisam refletir tarefas que o loop-controller move em segundo plano,
    // mesmo sem nenhuma tarefa aberta em detalhe nesta tela.
    const interval = setInterval(() => {
      listTasks().then(setAllTasks)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Retoma o polling de eventos do GitHub se este projeto já tem tarefa ativa — cobre o
    // caso do app ter sido reiniciado depois que a tarefa começou (o poller vive só em
    // memória). Se não houver tarefa ativa, `ensureProjectPolling` não faz nada.
    if (projectId) ensureProjectPolling(projectId)
  }, [projectId])

  useEffect(() => {
    if (!selectedTaskId) return
    // Se `result` já é dessa mesma tarefa (acabamos de criá-la via runTask/runOrchestrator
    // nesta mesma ação), não busca de novo — evita um flash e uma leitura à toa.
    if (result && result.task.id === selectedTaskId) return

    let cancelled = false
    setLoadingSelected(true)
    setError(null)
    setResult(null)
    loadTaskResult(selectedTaskId)
      .then((loaded) => {
        if (cancelled) return
        setResult(loaded)
        ensureProjectPolling(loaded.task.projectId)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingSelected(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId])

  useEffect(() => {
    // O loop Dev↔QA roda em segundo plano (loop-controller reagindo a eventos do
    // polling), fora de qualquer clique nesta tela — então a tela precisa ir buscar o
    // estado mais recente da tarefa periodicamente pra refletir status/rodadas/custo e
    // abrir o Modal de Loop Pausado assim que ele pausar.
    if (!result) return
    const taskId = result.task.id
    const interval = setInterval(async () => {
      const fresh = await getTask(taskId)
      if (fresh) setResult((current) => (current && current.task.id === taskId ? { ...current, task: fresh } : current))
    }, 4000)
    return () => clearInterval(interval)
  }, [result?.task.id])

  const canRun = Boolean(projectId && employeeId && description.trim()) && !running

  const orchestrators = employees.filter((employee) => employee.role === 'orchestrator')
  const canRunOrchestrator =
    Boolean(projectId && orchestratorEmployeeId && featureDescription.trim()) && !runningOrchestrator

  // Distingue do pause "esperando decisão de fallback" (result.fallback, do runTask
  // inicial, antes de existir PR) do pause do loop-controller (Fluxo 1, só depois do PR
  // aberto) — os dois usam status `paused`, então o que diferencia é ter PR vinculado.
  const loopPausedTask =
    result && !result.fallback && result.task.status === 'paused' && result.task.pausedReason && result.task.prNumber
      ? result.task
      : null
  // Uma chave que muda sempre que uma pausa é genuinamente nova (mesmo motivo, mas mais
  // rodadas/custo desde a última vez) — permite "Deixar pausado" sem escondê-la de novo
  // pra sempre se o loop pausar outra vez mais adiante.
  function pauseKey(task: Task): string {
    return `${task.id}:${task.pausedReason}:${task.round}:${task.costUsedUsd.toFixed(4)}`
  }
  const loopPausedVisible = loopPausedTask && pauseKey(loopPausedTask) !== dismissedPauseKey ? loopPausedTask : null

  function handleSelectTask(taskId: string) {
    setSelectedTaskId(taskId)
  }

  function handleBackToBoard() {
    setSelectedTaskId(null)
    setResult(null)
    setError(null)
    listTasks().then(setAllTasks)
  }

  async function handleRun() {
    if (!canRun) return
    setRunning(true)
    setError(null)
    setResult(null)
    setQaTaskInfo(null)
    setOrchestratorWarnings([])
    try {
      const title = description.trim().split('\n')[0].slice(0, 80)
      const taskResult = await runTask({ projectId, employeeId, title, description: description.trim() })
      setResult(taskResult)
      setSelectedTaskId(taskResult.task.id)
      void listTasks().then(setAllTasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  async function handleRunOrchestrator() {
    if (!canRunOrchestrator) return
    setRunningOrchestrator(true)
    setError(null)
    setResult(null)
    setQaTaskInfo(null)
    setOrchestratorWarnings([])
    try {
      const orchestratorResult = await runOrchestrator({
        projectId,
        orchestratorEmployeeId,
        featureDescription: featureDescription.trim(),
      })
      setOrchestratorWarnings(orchestratorResult.warnings)
      setQaTaskInfo(orchestratorResult.qaTask ?? null)
      if (orchestratorResult.devTask) {
        setResult(orchestratorResult.devTask)
        setSelectedTaskId(orchestratorResult.devTask.task.id)
        setFeatureDescription('')
      }
      void listTasks().then(setAllTasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunningOrchestrator(false)
    }
  }

  function updateChangeStatus(changeId: string, status: ProposedFileDiff['status']) {
    setResult((current) => {
      if (!current) return current
      return {
        ...current,
        diffs: current.diffs.map((diff) => (diff.id === changeId ? { ...diff, status } : diff)),
      }
    })
  }

  async function handleApprove(change: ProposedFileDiff) {
    if (!result) return
    await approveProposedChange(result.task, change)
    updateChangeStatus(change.id, 'approved')
  }

  async function handleReject(change: ProposedFileDiff) {
    await rejectProposedChange(change)
    updateChangeStatus(change.id, 'rejected')
  }

  function handleNewTask() {
    setSelectedTaskId(null)
    setResult(null)
    setError(null)
    setDescription('')
    setQaTaskInfo(null)
    setOrchestratorWarnings([])
    setView('new')
  }

  async function handleConfirmFallback() {
    if (!result?.fallback) return
    const { fallback } = result
    setConfirmingFallback(true)
    setError(null)
    try {
      const nextResult = await continueTaskWithFallback(result.task, fallback.to, fallback.messages, fallback.systemPrompt)
      setResult(nextResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConfirmingFallback(false)
    }
  }

  function handleCancelFallback() {
    // A tarefa já foi marcada como `paused` pelo task-runner assim que o fallback foi sinalizado.
    setResult((current) => (current ? { ...current, fallback: undefined } : current))
  }

  async function handleResumeLoop() {
    if (!loopPausedTask) return
    setResumingLoop(true)
    setError(null)
    try {
      const updatedTask = await resumeTaskLoop(loopPausedTask.id)
      setResult((current) => (current ? { ...current, task: updatedTask } : current))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResumingLoop(false)
    }
  }

  function handleDismissLoopPaused() {
    if (loopPausedTask) setDismissedPauseKey(pauseKey(loopPausedTask))
  }

  async function handleConfirmOpenPullRequest() {
    if (!result) return
    const approvedFilePaths = result.diffs.filter((diff) => diff.status === 'approved').map((diff) => diff.filePath)
    if (approvedFilePaths.length === 0) return

    setOpeningPr(true)
    setError(null)
    try {
      const updatedTask = await openPullRequest(result.task, approvedFilePaths)
      setResult((current) => (current ? { ...current, task: updatedTask } : current))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOpeningPr(false)
      setConfirmingOpenPr(false)
    }
  }

  const showDetail = Boolean(selectedTaskId)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-medium">Board</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe as tarefas por status, veja a fila de cada funcionário, ou crie uma nova.
        </p>
      </div>

      {boardLoading && <PageLoader />}
      {!boardLoading && boardError && <ErrorMessage message={boardError} />}

      {!boardLoading && !boardError && (showDetail ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBackToBoard}>
              <ArrowLeft />
              Voltar ao board
            </Button>
            <Button variant="outline" size="sm" onClick={handleNewTask}>
              Nova tarefa
            </Button>
          </div>

          {loadingSelected && <PageLoader label="Carregando tarefa…" />}

          {error && <ErrorMessage message={error} />}

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{result.task.title}</span>
                {result.task.branch && (
                  <Badge variant="outline" className="gap-1 font-normal">
                    <GitBranch className="size-3" />
                    {result.task.branch}
                  </Badge>
                )}
                <Badge variant="secondary" className="font-normal">
                  {result.task.status}
                </Badge>
                {result.task.round > 0 && (
                  <Badge variant="outline" className="font-normal">
                    rodada {result.task.round}/{result.task.maxRounds}
                  </Badge>
                )}
                {(() => {
                  const owner = employeesById[result.task.employeeId]
                  return owner ? (
                    <span className="text-xs text-muted-foreground">
                      com {owner.avatar ? `${owner.avatar} ` : ''}
                      {owner.name}
                    </span>
                  ) : null
                })()}
                {(() => {
                  const project = projectsById[result.task.projectId]
                  const repo = project ? reposById[project.repoId] : undefined
                  return repo ? <span className="text-xs text-muted-foreground">{repo.localPath}</span> : null
                })()}
              </div>

              {!result.fallback && result.warnings.length > 0 && (
                <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  {result.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}

              {result.fallback ? (
                <p className="text-sm text-muted-foreground">
                  Tarefa pausada aguardando decisão sobre o provedor de fallback — veja o modal.
                </p>
              ) : (
                <>
                  {result.task.prNumber && result.task.prUrl ? (
                    <Card size="sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <GitPullRequest className="size-4 text-muted-foreground" />
                          Pull Request #{result.task.prNumber}
                        </CardTitle>
                        <CardAction>
                          <Button asChild variant="outline" size="sm">
                            <a href={result.task.prUrl} target="_blank" rel="noreferrer">
                              Ver no GitHub
                              <ExternalLink />
                            </a>
                          </Button>
                        </CardAction>
                      </CardHeader>
                      {result.task.description && (
                        <CardContent className="text-sm text-muted-foreground">{result.task.description}</CardContent>
                      )}
                    </Card>
                  ) : null}

                  {result.task.status === 'qa_approved' && (
                    <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                      PR aprovado pelo QA. Pronto para merge — o merge continua sendo sempre seu, direto no GitHub.
                    </div>
                  )}

                  {!result.task.prNumber && result.task.branch && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">
                        {result.diffs.some((diff) => diff.status === 'approved')
                          ? 'Commita as mudanças aprovadas, envia a branch e abre um Pull Request real no GitHub.'
                          : 'Aprove ao menos uma mudança para poder abrir um Pull Request.'}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={openingPr || !result.diffs.some((diff) => diff.status === 'approved')}
                        onClick={() => setConfirmingOpenPr(true)}
                      >
                        {openingPr ? <Loader2 className="animate-spin" /> : <GitPullRequest />}
                        Commitar e abrir PR
                      </Button>
                    </div>
                  )}

                  <DiffViewer diffs={result.diffs} onApprove={handleApprove} onReject={handleReject} />
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <Tabs value={view} onValueChange={(value) => setView(value as BoardView)}>
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="queue">Fila por funcionário</TabsTrigger>
            <TabsTrigger value="new">Nova tarefa</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="pt-4">
            {allTasks.length === 0 ? (
              <EmptyState
                icon={KanbanSquare}
                title="Nenhuma tarefa ainda"
                description="Rode uma tarefa direto com um funcionário, ou peça pro Orquestrador quebrar uma funcionalidade."
                action={
                  <Button size="sm" onClick={() => setView('new')}>
                    Nova tarefa
                  </Button>
                }
              />
            ) : (
              <TaskBoard
                tasks={allTasks}
                employeesById={employeesById}
                projectsById={projectsById}
                onSelectTask={handleSelectTask}
              />
            )}
          </TabsContent>

          <TabsContent value="queue" className="pt-4">
            <EmployeeQueue
              employees={employees}
              tasks={allTasks}
              projectsById={projectsById}
              onSelectTask={handleSelectTask}
            />
          </TabsContent>

          <TabsContent value="new" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Nova tarefa</CardTitle>
                <CardDescription>
                  Rode uma tarefa direto com um funcionário, ou peça pro Orquestrador quebrar uma funcionalidade em
                  tarefas pro time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Projeto</Label>
                  <Select value={projectId} onValueChange={setProjectId} disabled={running || runningOrchestrator}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione um projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum projeto conectado ainda — crie um em Projetos.</p>
                )}

                <Tabs value={mode} onValueChange={(value) => setMode(value as 'direct' | 'orchestrator')}>
                  <TabsList className="w-full">
                    <TabsTrigger value="direct">Tarefa direta</TabsTrigger>
                    <TabsTrigger value="orchestrator">Orquestrador</TabsTrigger>
                  </TabsList>

                  <TabsContent value="direct" className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label>Funcionário</Label>
                      <Select value={employeeId} onValueChange={setEmployeeId} disabled={running}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione um funcionário" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.avatar ? `${employee.avatar} ` : ''}
                              {employee.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {employees.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum funcionário ainda — crie um em Funcionários.</p>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="task-description">Descrição da tarefa</Label>
                      <Textarea
                        id="task-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Ex.: adicionar validação de e-mail no formulário de cadastro"
                        className="min-h-28"
                        disabled={running}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button onClick={handleRun} disabled={!canRun}>
                        {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
                        Rodar tarefa
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="orchestrator" className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label>Orquestrador</Label>
                      <Select
                        value={orchestratorEmployeeId}
                        onValueChange={setOrchestratorEmployeeId}
                        disabled={runningOrchestrator}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione um orquestrador" />
                        </SelectTrigger>
                        <SelectContent>
                          {orchestrators.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.avatar ? `${employee.avatar} ` : ''}
                              {employee.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {orchestrators.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum funcionário com papel de Orquestrador ainda — crie um em Funcionários.
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="feature-description">Funcionalidade desejada</Label>
                      <Textarea
                        id="feature-description"
                        value={featureDescription}
                        onChange={(e) => setFeatureDescription(e.target.value)}
                        placeholder="Ex.: sistema de login com e-mail e senha, incluindo recuperação de senha"
                        className="min-h-28"
                        disabled={runningOrchestrator}
                      />
                      <p className="text-xs text-muted-foreground">
                        O Orquestrador decide como quebrar isso em tarefas pro Dev e pro QA — o comportamento vem do
                        prompt de sistema dele, não de regras fixas do app.
                      </p>
                    </div>

                    {orchestratorWarnings.length > 0 && (
                      <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                        {orchestratorWarnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    )}

                    {qaTaskInfo && (
                      <p className="text-xs text-muted-foreground">
                        Tarefa de acompanhamento criada para o QA: <span className="font-medium">{qaTaskInfo.title}</span>
                        {' — '}entra em ação automaticamente quando o PR do Dev abrir (Fluxo 1).
                      </p>
                    )}

                    <div className="flex justify-end">
                      <Button onClick={handleRunOrchestrator} disabled={!canRunOrchestrator}>
                        {runningOrchestrator ? <Loader2 className="animate-spin" /> : <Workflow />}
                        Quebrar em tasks
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                {error && <ErrorMessage message={error} />}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ))}

      <FallbackModal
        fallback={result?.fallback ?? null}
        confirming={confirmingFallback}
        onConfirm={handleConfirmFallback}
        onCancel={handleCancelFallback}
      />

      <LoopPausedModal
        task={loopPausedVisible}
        resuming={resumingLoop}
        onResume={handleResumeLoop}
        onDismiss={handleDismissLoopPaused}
      />

      <AlertDialog open={confirmingOpenPr} onOpenChange={setConfirmingOpenPr}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abrir Pull Request real no GitHub?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai commitar {result?.diffs.filter((diff) => diff.status === 'approved').length ?? 0} arquivo(s)
              aprovado(s), enviar a branch "{result?.task.branch}" pro GitHub e abrir um Pull Request real. Nenhum
              merge é feito automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOpenPullRequest}>Commitar e abrir PR</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
