import { GitBranch } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { Employee, Project, Task } from '@/core/db'

interface TaskCardProps {
  task: Task
  employee?: Employee
  project?: Project
  onClick: () => void
}

/** Um card do kanban/fila: funcionário, projeto, rodadas e custo (Progress vs. teto). */
export function TaskCard({ task, employee, project, onClick }: TaskCardProps) {
  const costPct = task.costCapUsd > 0 ? Math.min(100, (task.costUsedUsd / task.costCapUsd) * 100) : 0
  const overCap = task.costUsedUsd >= task.costCapUsd

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
      className="cursor-pointer transition-colors hover:bg-muted/50"
    >
      <CardHeader>
        <CardTitle className="text-xs leading-snug font-medium">{task.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Avatar size="sm">
              <AvatarFallback className="text-[10px]">
                {employee?.avatar ?? employee?.name.charAt(0).toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs text-muted-foreground">{employee?.name ?? 'sem funcionário'}</span>
          </div>
          {task.round > 0 && (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-normal">
              rodada {task.round}/{task.maxRounds}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate">{project?.name ?? '—'}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Custo</span>
            <span>
              ${task.costUsedUsd.toFixed(2)} / ${task.costCapUsd.toFixed(2)}
            </span>
          </div>
          <Progress
            value={costPct}
            className={cn(overCap && '[&_[data-slot=progress-indicator]]:bg-destructive')}
          />
        </div>

        {task.pausedReason && (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-normal">
            pausado · {task.pausedReason}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
