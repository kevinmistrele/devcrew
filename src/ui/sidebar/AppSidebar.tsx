import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  CircleDollarSign,
  FolderGit2,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  TerminalSquare,
  UserRoundCog,
  Users,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { listEmployees, listProjects, listTeams } from '@/core/db'
import type { Employee, Project, Team } from '@/core/db'

const primaryNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/board', label: 'Board', icon: KanbanSquare },
  { to: '/terminal', label: 'Terminal', icon: TerminalSquare },
  { to: '/custos', label: 'Custos', icon: CircleDollarSign },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function AppSidebar() {
  const location = useLocation()
  const [projects, setProjects] = useState<Project[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setProjects([]))
    listTeams().then(setTeams).catch(() => setTeams([]))
  }, [])

  // Refaz a busca a cada navegação: funcionários podem ser criados/editados/excluídos
  // no editor sem este componente desmontar, então um mount único ficaria desatualizado.
  useEffect(() => {
    listEmployees().then(setEmployees).catch(() => setEmployees([]))
  }, [location.pathname])

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1.5 text-sm font-semibold tracking-tight">DevCrew</div>
        <SidebarMenu>
          {primaryNav.map(({ to, label, icon: Icon }) => (
            <SidebarMenuItem key={to}>
              <SidebarMenuButton asChild isActive={location.pathname === to}>
                <Link to={to}>
                  <Icon />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <Link to="/projetos" className="flex items-center gap-1.5">
              <FolderGit2 className="size-3.5" />
              Projetos
            </Link>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton asChild size="sm">
                    <Link to="/projetos">{project.name}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {projects.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum projeto ainda.</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <Link to="/equipes" className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              Equipes
            </Link>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {teams.map((team) => (
                <SidebarMenuItem key={team.id}>
                  <SidebarMenuButton asChild size="sm">
                    <Link to="/equipes">
                      <span className="flex-1">{team.name}</span>
                      <Badge variant="secondary" className="ml-auto h-5 px-1.5 font-normal">
                        {team.memberIds.length}
                      </Badge>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {teams.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Nenhuma equipe ainda.</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <Link to="/funcionarios/editor" className="flex items-center gap-1.5">
              <UserRoundCog className="size-3.5" />
              Funcionários
            </Link>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {employees.map((employee) => (
                <SidebarMenuItem key={employee.id}>
                  <SidebarMenuButton
                    asChild
                    size="sm"
                    isActive={location.pathname === `/funcionarios/editor/${employee.id}`}
                  >
                    <Link to={`/funcionarios/editor/${employee.id}`}>
                      <Avatar className="size-5">
                        <AvatarFallback className="text-[10px]">
                          {employee.avatar ?? employee.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {employee.name}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {employees.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum funcionário ainda.</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
