import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { checkGithubConnection } from '@/core/github-service'
import { checkAnthropicConnection, checkOpenAIConnection } from '@/core/provider'

// Só nega de novo dentro da mesma sessão do app — reaparece no próximo `npm run tauri dev`/
// abertura do app se ainda faltar algo, sem incomodar a cada troca de tela.
const DISMISSED_KEY = 'devcrew-onboarding-dismissed'

/**
 * Fluxo de onboarding: no primeiro uso (ou enquanto faltar GitHub e/ou um provedor de IA
 * conectado), mostra um checklist e leva pra Configurações. Nunca bloqueia o app — dá pra
 * fechar e explorar sem conectar nada ainda.
 */
export function OnboardingModal() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [githubConnected, setGithubConnected] = useState(false)
  const [providerConnected, setProviderConnected] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY)) {
      setChecking(false)
      return
    }

    let cancelled = false
    Promise.all([checkGithubConnection(), checkAnthropicConnection(), checkOpenAIConnection()])
      .then(([github, anthropic, openai]) => {
        if (cancelled) return
        const hasGithub = Boolean(github)
        const hasProvider = Boolean(anthropic || openai)
        setGithubConnected(hasGithub)
        setProviderConnected(hasProvider)
        setOpen(!hasGithub || !hasProvider)
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setOpen(false)
  }

  function goToSettings() {
    dismiss()
    navigate('/configuracoes')
  }

  if (checking) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bem-vindo ao DevCrew</DialogTitle>
          <DialogDescription>
            Antes de montar sua equipe de funcionários de IA, conecte estas duas coisas — dá pra fazer depois em
            Configurações também.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <ChecklistItem
            done={githubConnected}
            label="Conectar o GitHub"
            description="Pra clonar repositórios e abrir Pull Requests reais."
          />
          <ChecklistItem
            done={providerConnected}
            label="Conectar um provedor de IA"
            description="Anthropic (Claude) ou OpenAI (ChatGPT) — pelo menos um dos dois."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>
            Pular por agora
          </Button>
          <Button onClick={goToSettings}>Ir para Configurações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChecklistItem({ done, label, description }: { done: boolean; label: string; description: string }) {
  const Icon = done ? CheckCircle2 : CircleDashed
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border p-3">
      <Icon
        className={
          done
            ? 'mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400'
            : 'mt-0.5 size-4 shrink-0 text-muted-foreground'
        }
      />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
