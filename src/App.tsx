import { HashRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/app-shell'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { TeamsPage } from '@/pages/TeamsPage'
import { EmployeeEditorPage } from '@/pages/EmployeeEditorPage'
import { BoardPage } from '@/pages/BoardPage'
import { TerminalPage } from '@/pages/TerminalPage'
import { CostDashboardPage } from '@/pages/CostDashboardPage'
import { SettingsPage } from '@/pages/SettingsPage'

function App() {
  return (
    <TooltipProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projetos" element={<ProjectsPage />} />
            <Route path="/equipes" element={<TeamsPage />} />
            <Route path="/funcionarios/editor" element={<EmployeeEditorPage />} />
            <Route path="/funcionarios/editor/:id" element={<EmployeeEditorPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="/custos" element={<CostDashboardPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Routes>
        </AppShell>
      </HashRouter>
    </TooltipProvider>
  )
}

export default App
