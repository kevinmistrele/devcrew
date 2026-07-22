import { GitBranch } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { Employee, Project, Task } from '@/core/db'
import { QUEUE_STATUSES, TASK_STATUS_LABELS } from './taskStatus'

interface EmployeeQueueProps {
  employees: Employee[]
  tasks: Task[]
  projectsById: Record<string, Project>
  onSelectTask: (taskId: string) => void
}

/** Uma coluna por funcionário, com a fila de tarefas em andamento/aguardando dele. */
export function EmployeeQueue({ employees, tasks, projectsById, onSelectTask }: EmployeeQueueProps) {
  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum funcionário ainda — crie um em Funcionários.</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {employees.map((employee) => {
        const queue = tasks
          .filter((task) => task.employeeId === employee.id && QUEUE_STATUSES.includes(task.status))
          .sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running'))

        return (
          <Card key={employee.id} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Avatar size="sm">
                  <AvatarFallback className="text-xs">
                    {employee.avatar ?? employee.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 truncate">{employee.name}</span>
                <Badge variant="outline" className="ml-auto h-5 shrink-0 px-1.5 font-normal">
                  {queue.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {queue.length === 0 && <p className="text-xs text-muted-foreground">Fila vazia.</p>}
              {queue.map((task) => {
                const costPct = task.costCapUsd > 0 ? Math.min(100, (task.costUsedUsd / task.costCapUsd) * 100) : 0
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onSelectTask(task.id)}
                    className="flex w-full flex-col gap-1.5 rounded-lg border border-border p-2 text-left hover:bg-muted"
                  >
                    <span className="truncate text-xs font-medium">{task.title}</span>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <GitBranch className="size-3 shrink-0" />
                        {projectsById[task.projectId]?.name ?? '—'}
                      </span>
                      <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px] font-normal">
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                    </div>
                    <Progress value={costPct} />
                  </button>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
