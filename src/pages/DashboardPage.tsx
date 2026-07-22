import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, UsersRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listEmployees, type Employee } from '@/core/db'
import { roleLabel } from '@/core/employee-manager'
import { EmptyState, ErrorMessage, PageLoader } from '@/ui/feedback'

export function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listEmployees()
      .then(setEmployees)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium">Dashboard</h1>
      <p className="mb-4 text-sm text-muted-foreground">Sua equipe de funcionários de IA.</p>

      {loading && <PageLoader />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && employees.length === 0 && (
        <EmptyState
          icon={UsersRound}
          title="Nenhum funcionário ainda"
          description="Crie o primeiro funcionário de IA da sua equipe — dê um papel, um prompt de sistema e escolha o provedor."
          action={
            <Button asChild size="sm">
              <Link to="/funcionarios/editor">
                <Plus />
                Novo funcionário
              </Link>
            </Button>
          }
        />
      )}

      {!loading && !error && employees.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {employees.map((employee) => (
            <Link key={employee.id} to={`/funcionarios/editor/${employee.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Avatar size="lg">
                      <AvatarFallback>
                        {employee.avatar || employee.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="truncate">{employee.name}</CardTitle>
                      <Badge variant="secondary" className="mt-1 font-normal">
                        {roleLabel(employee.role)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{employee.systemPrompt}</p>
                </CardContent>
              </Card>
            </Link>
          ))}

          <Link to="/funcionarios/editor">
            <Card className="flex h-full min-h-32 items-center justify-center border-dashed text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
              <CardContent className="flex flex-col items-center gap-1.5 p-0">
                <Plus className="size-5" />
                <span className="text-sm">Novo funcionário</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}
    </div>
  )
}
