import { Users } from 'lucide-react'
import { EmptyState } from '@/ui/feedback'

export function TeamsPage() {
  return (
    <div className="p-6">
      <h1 className="text-lg font-medium">Equipes</h1>
      <p className="mb-4 text-sm text-muted-foreground">Agrupamentos de funcionários direcionados a um projeto.</p>

      <EmptyState
        icon={Users}
        title="Edição de equipes chegando em breve"
        description="Por enquanto, o vínculo entre funcionário e equipe é feito direto no banco (os dados de exemplo já vêm com uma equipe). A tela de criar/editar equipes ainda não foi construída."
      />
    </div>
  )
}
