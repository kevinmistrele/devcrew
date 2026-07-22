import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Employee, Project, Task } from '@/core/db'
import { TaskCard } from './TaskCard'
import { KANBAN_COLUMNS } from './taskStatus'

interface TaskBoardProps {
  tasks: Task[]
  employeesById: Record<string, Employee>
  projectsById: Record<string, Project>
  onSelectTask: (taskId: string) => void
}

/** Kanban de tarefas com uma coluna por status (ver taskStatus.ts pra ordem/rótulos). */
export function TaskBoard({ tasks, employeesById, projectsById, onSelectTask }: TaskBoardProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status)
        return (
          <div key={column.status} className="flex w-64 shrink-0 flex-col rounded-lg bg-muted/30">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">{column.label}</span>
              <Badge variant="secondary" className="h-5 px-1.5 font-normal">
                {columnTasks.length}
              </Badge>
            </div>

            <ScrollArea className="h-[calc(100vh-22rem)] min-h-48 px-2">
              <div className="flex flex-col gap-2 pb-3">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    employee={employeesById[task.employeeId]}
                    project={projectsById[task.projectId]}
                    onClick={() => onSelectTask(task.id)}
                  />
                ))}
                {columnTasks.length === 0 && (
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground">Nada aqui</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )
      })}
    </div>
  )
}
