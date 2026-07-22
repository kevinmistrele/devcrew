import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { listRepos, type Permission, type ProviderId, type Repo, type Role } from '@/core/db'
import {
  PERMISSION_OPTIONS,
  PROVIDER_OPTIONS,
  ROLE_OPTIONS,
  deleteEmployee,
  getEmployee,
  saveEmployee,
} from '@/core/employee-manager'
import { ErrorMessage, PageLoader } from '@/ui/feedback'

const NO_FALLBACK = 'none'

export function EmployeeEditor({ employeeId }: { employeeId?: string }) {
  const navigate = useNavigate()
  const isEdit = Boolean(employeeId)

  const [loading, setLoading] = useState(isEdit)
  const [repos, setRepos] = useState<Repo[]>([])
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [role, setRole] = useState<Role>('dev')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [preferredProvider, setPreferredProvider] = useState<ProviderId>('anthropic')
  const [fallbackProvider, setFallbackProvider] = useState<ProviderId | typeof NO_FALLBACK>(NO_FALLBACK)
  const [permission, setPermission] = useState<Permission>('read')
  const [scopesByRepo, setScopesByRepo] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRepos().then(setRepos).catch(() => setRepos([]))
  }, [])

  useEffect(() => {
    if (!employeeId) return
    let cancelled = false
    setLoading(true)
    getEmployee(employeeId)
      .then((employee) => {
        if (cancelled || !employee) return
        setName(employee.name)
        setAvatar(employee.avatar ?? '')
        setRole(employee.role)
        setSystemPrompt(employee.systemPrompt)
        setPreferredProvider(employee.preferredProvider)
        setFallbackProvider(employee.fallbackProvider ?? NO_FALLBACK)
        setPermission(employee.permission)
        setScopesByRepo(
          Object.fromEntries(employee.scopes.map((scope) => [scope.repoId, scope.pathGlob])),
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [employeeId])

  function toggleScope(repoId: string, checked: boolean) {
    setScopesByRepo((prev) => {
      const next = { ...prev }
      if (checked) {
        next[repoId] = prev[repoId] ?? '**'
      } else {
        delete next[repoId]
      }
      return next
    })
  }

  async function handleSubmit() {
    if (!name.trim() || !systemPrompt.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await saveEmployee({
        id: employeeId,
        name: name.trim(),
        role,
        avatar: avatar.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
        preferredProvider,
        fallbackProvider: fallbackProvider === NO_FALLBACK ? undefined : fallbackProvider,
        permission,
        scopes: Object.entries(scopesByRepo).map(([repoId, pathGlob]) => ({ repoId, pathGlob })),
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!employeeId) return
    setDeleting(true)
    try {
      await deleteEmployee(employeeId)
      navigate('/')
    } finally {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  if (loading) {
    return <PageLoader />
  }

  const canSubmit = name.trim().length > 0 && systemPrompt.trim().length > 0

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-lg font-medium">{isEdit ? 'Editar funcionário' : 'Novo funcionário'}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Um funcionário é um agente de IA com uma função, um prompt de sistema e permissões sobre
        os repositórios que ele pode tocar.
      </p>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Identidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                <AvatarFallback>{avatar || name.charAt(0).toUpperCase() || '?'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="avatar">Avatar (emoji)</Label>
                <Input
                  id="avatar"
                  placeholder="🤖"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  maxLength={4}
                  className="w-24"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana" />
            </div>

            <div className="space-y-1.5">
              <Label>Função</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prompt de sistema</CardTitle>
            <CardDescription>Como esse funcionário deve pensar e agir nas tarefas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Você é a Dev do time. Implementa as tarefas descritas com código limpo e testado."
              className="min-h-32"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provedor de IA</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Preferido</Label>
              <Select value={preferredProvider} onValueChange={(v) => setPreferredProvider(v as ProviderId)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Fallback</Label>
              <Select
                value={fallbackProvider}
                onValueChange={(v) => setFallbackProvider(v as ProviderId | typeof NO_FALLBACK)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FALLBACK}>Sem fallback</SelectItem>
                  {PROVIDER_OPTIONS.filter((option) => option.value !== preferredProvider).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissão</CardTitle>
            <CardDescription>O que esse funcionário pode fazer nos repos do escopo dele.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={permission} onValueChange={(v) => setPermission(v as Permission)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Escopo de repositórios</CardTitle>
            <CardDescription>Em quais repos, e em quais pastas, ele pode atuar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {repos.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum repositório conectado ainda — conecte um em Projetos.
              </p>
            )}
            {repos.map((repo) => {
              const checked = repo.id in scopesByRepo
              return (
                <div key={repo.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                  <Checkbox
                    id={`repo-${repo.id}`}
                    checked={checked}
                    onCheckedChange={(value) => toggleScope(repo.id, value === true)}
                  />
                  <Label htmlFor={`repo-${repo.id}`} className="flex-1 font-normal">
                    {repo.name}
                  </Label>
                  <Input
                    disabled={!checked}
                    value={scopesByRepo[repo.id] ?? '**'}
                    onChange={(e) =>
                      setScopesByRepo((prev) => ({ ...prev, [repo.id]: e.target.value }))
                    }
                    placeholder="**"
                    className="w-40"
                  />
                </div>
              )
            })}
          </CardContent>
        </Card>

        {error && <ErrorMessage message={error} />}

        <div className="flex items-center justify-between">
          <div>
            {isEdit && (
              <Button variant="destructive" onClick={() => setConfirmingDelete(true)} disabled={deleting}>
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 />}
                Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/')}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {name || 'este funcionário'}?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
