import type { ReactNode } from 'react'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AppSidebar } from '@/ui/sidebar'
import { CostBar } from '@/ui/cost-bar'
import { ThemeToggle } from '@/ui/theme-toggle'
import { OnboardingModal } from '@/ui/onboarding'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-screen overflow-hidden">
        <div className="flex h-full flex-col">
          <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4" />
            </div>
            <ThemeToggle />
          </header>
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
          <CostBar />
        </div>
      </SidebarInset>
      <OnboardingModal />
    </SidebarProvider>
  )
}
