import { useEffect, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listEmployees, listTasks, type Employee } from '@/core/db'
import { seedTerminalHistory } from '@/core/terminal-service'
import { TerminalPanel } from '@/ui/terminal'
import { EmptyState, ErrorMessage, PageLoader } from '@/ui/feedback'

export function TerminalPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    listEmployees()
      .then((rows) => {
        setEmployees(rows)
        setActiveId((current) => current || rows[0]?.id || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (employees.length === 0) return
    // Preenche o histórico de cada aba com respostas de IA já persistidas — nenhuma
    // chamada nova, só reaproveita o que cada funcionário já respondeu em tarefas passadas.
    listTasks().then((tasks) => {
      for (const employee of employees) {
        const entries = tasks
          .filter((task) => task.employeeId === employee.id)
          .flatMap((task) =>
            task.messages
              .filter((message) => message.role === 'assistant' && message.createdAt)
              .map((message) => ({ text: message.content, timestamp: message.createdAt! })),
          )
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        seedTerminalHistory(employee.id, entries)
      }
    })
  }, [employees])

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4">
        <h1 className="text-lg font-medium">Terminal</h1>
        <p className="text-sm text-muted-foreground">
          Espelho de I/O real de cada funcionário — comandos git e respostas de IA que já aconteceram. Nenhuma
          chamada de IA existe só para alimentar esta tela.
        </p>
      </div>

      {loading && <PageLoader />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && employees.length === 0 && (
        <EmptyState
          icon={TerminalSquare}
          title="Nenhum funcionário ainda"
          description="Crie um funcionário em Funcionários — o terminal ganha uma aba pra ele automaticamente."
        />
      )}

      {!loading && !error && employees.length > 0 && (
        <Tabs value={activeId} onValueChange={setActiveId} className="min-h-0 flex-1">
          <TabsList>
            {employees.map((employee) => (
              <TabsTrigger key={employee.id} value={employee.id} className="gap-1.5">
                <Avatar size="sm" className="size-4">
                  <AvatarFallback className="text-[9px]">
                    {employee.avatar ?? employee.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {employee.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {employees.map((employee) => (
            <TabsContent key={employee.id} value={employee.id}>
              <TerminalPanel channelId={employee.id} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
