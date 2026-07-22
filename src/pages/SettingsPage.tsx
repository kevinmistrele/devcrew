import { useEffect, useState } from 'react'
import { GitBranch, Loader2, Save, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { checkGithubConnection, connectGithub, disconnectGithub, type GithubUser } from '@/core/github-service'
import {
  anthropicProvider,
  checkAnthropicConnection,
  checkOpenAIConnection,
  connectAnthropic,
  connectOpenAI,
  disconnectAnthropic,
  disconnectOpenAI,
  testAnthropicConnection,
  testOpenAIConnection,
  type AnthropicConnection,
  type OpenAIConnection,
} from '@/core/provider'
import { getAppSettings, updateAppSettings, type AIResponse } from '@/core/db'
import { useTheme } from '@/ui/theme-toggle'
import { ErrorMessage } from '@/ui/feedback'

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-medium">Configurações</h1>
        <p className="text-sm text-muted-foreground">Conexões e preferências do app.</p>
      </div>

      <GithubCard />
      <AnthropicCard />
      <OpenAICard />
      <DefaultCapsCard />
      <ThemeCard />
    </div>
  )
}

function ThemeCard() {
  const [preference, setPreference] = useTheme()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tema</CardTitle>
        <CardDescription>Claro, escuro, ou seguir o tema do sistema operacional.</CardDescription>
      </CardHeader>
      <CardContent>
        <Select value={preference} onValueChange={(value) => setPreference(value as typeof preference)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Claro</SelectItem>
            <SelectItem value="dark">Escuro</SelectItem>
            <SelectItem value="system">Sistema</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}

type GithubStatus = 'checking' | 'disconnected' | 'connecting' | 'connected'

function GithubCard() {
  const [status, setStatus] = useState<GithubStatus>('checking')
  const [user, setUser] = useState<GithubUser | null>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    checkGithubConnection()
      .then((result) => {
        if (cancelled) return
        setUser(result)
        setStatus(result ? 'connected' : 'disconnected')
      })
      .catch(() => {
        if (!cancelled) setStatus('disconnected')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleConnect() {
    if (!token.trim()) return
    setStatus('connecting')
    setError(null)
    try {
      const connectedUser = await connectGithub(token.trim())
      setUser(connectedUser)
      setToken('')
      setStatus('connected')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('disconnected')
    }
  }

  async function handleDisconnect() {
    await disconnectGithub()
    setUser(null)
    setStatus('disconnected')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="size-4" />
          GitHub
        </CardTitle>
        <CardDescription>
          Cole um Personal Access Token para clonar repositórios privados e, mais adiante, abrir
          PRs e ler reviews. O token fica só no keychain do sistema operacional — nunca é salvo
          no banco local do app.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {status === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Verificando conexão…
          </div>
        )}

        {status === 'connected' && user && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={user.avatarUrl} alt={user.login} />
                <AvatarFallback>{user.login.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{user.name ?? user.login}</p>
                <p className="text-xs text-muted-foreground">@{user.login}</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-3" />
              Conectado
            </Badge>
          </div>
        )}

        {(status === 'disconnected' || status === 'connecting') && (
          <div className="space-y-2">
            <Label htmlFor="github-token">Personal Access Token</Label>
            <Input
              id="github-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="ghp_••••••••••••••••••••••••••••••••••••"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConnect()
              }}
              disabled={status === 'connecting'}
            />
            {error && <ErrorMessage message={error} className="text-xs" />}
            <p className="text-xs text-muted-foreground">
              Crie um token em GitHub → Settings → Developer settings → Personal access tokens,
              com escopo <code className="rounded bg-muted px-1 py-0.5">repo</code>.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        {status === 'connected' ? (
          <Button variant="outline" onClick={handleDisconnect}>
            Desconectar
          </Button>
        ) : (
          <Button onClick={handleConnect} disabled={!token.trim() || status === 'connecting'}>
            {status === 'connecting' && <Loader2 className="size-4 animate-spin" />}
            Conectar
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

type AnthropicStatus = 'checking' | 'disconnected' | 'connecting' | 'connected'

function AnthropicCard() {
  const [status, setStatus] = useState<AnthropicStatus>('checking')
  const [connection, setConnection] = useState<AnthropicConnection | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [prompt, setPrompt] = useState('Diga oi em uma frase.')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<AIResponse | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    checkAnthropicConnection()
      .then((result) => {
        if (cancelled) return
        setConnection(result)
        setStatus(result ? 'connected' : 'disconnected')
      })
      .catch(() => {
        if (!cancelled) setStatus('disconnected')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleConnect() {
    if (!apiKey.trim()) return
    setStatus('connecting')
    setError(null)
    try {
      const result = await connectAnthropic(apiKey.trim())
      setConnection(result)
      setApiKey('')
      setStatus('connected')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('disconnected')
    }
  }

  async function handleDisconnect() {
    await disconnectAnthropic()
    setConnection(null)
    setTestResult(null)
    setSendResult(null)
    setStatus('disconnected')
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testAnthropicConnection()
      setTestResult({ ok: true, message: `Conexão OK — ${result.displayName}` })
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSend() {
    if (!prompt.trim()) return
    setSending(true)
    setSendError(null)
    setSendResult(null)
    try {
      const result = await anthropicProvider.send(
        [{ id: 'test', role: 'user', content: prompt.trim() }],
        'Você é um assistente conciso.',
      )
      setSendResult(result)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          Anthropic
        </CardTitle>
        <CardDescription>
          Conecte sua API key da Anthropic para os funcionários usarem Claude. A chave fica só no
          keychain do sistema operacional — nunca é salva no banco local do app.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {status === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Verificando conexão…
          </div>
        )}

        {status === 'connected' && connection && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{connection.displayName}</p>
                <p className="text-xs text-muted-foreground">{connection.model}</p>
              </div>
              <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-3" />
                Conectado
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing && <Loader2 className="size-3.5 animate-spin" />}
                Testar conexão
              </Button>
              {testResult && (
                <p className={`text-xs ${testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                  {testResult.message}
                </p>
              )}
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <Label htmlFor="anthropic-prompt">Testar uma chamada direta</Label>
              <div className="flex gap-2">
                <Input
                  id="anthropic-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSend()
                  }}
                  disabled={sending}
                />
                <Button size="icon" variant="outline" onClick={handleSend} disabled={!prompt.trim() || sending}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send />}
                  <span className="sr-only">Enviar</span>
                </Button>
              </div>
              {sendError && <ErrorMessage message={sendError} className="text-xs" />}
              {sendResult && (
                <div className="space-y-1 rounded-lg border border-border bg-muted/50 p-2.5">
                  <p className="text-sm">{sendResult.content}</p>
                  <p className="text-xs text-muted-foreground">
                    {sendResult.tokensIn} tokens in · {sendResult.tokensOut} tokens out · $
                    {sendResult.costUsd.toFixed(5)}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {(status === 'disconnected' || status === 'connecting') && (
          <div className="space-y-2">
            <Label htmlFor="anthropic-key">API key</Label>
            <Input
              id="anthropic-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-••••••••••••••••••••••••••••••••••••"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConnect()
              }}
              disabled={status === 'connecting'}
            />
            {error && <ErrorMessage message={error} className="text-xs" />}
            <p className="text-xs text-muted-foreground">
              Crie uma chave em{' '}
              <code className="rounded bg-muted px-1 py-0.5">console.anthropic.com</code> →
              Settings → API Keys.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        {status === 'connected' ? (
          <Button variant="outline" onClick={handleDisconnect}>
            Desconectar
          </Button>
        ) : (
          <Button onClick={handleConnect} disabled={!apiKey.trim() || status === 'connecting'}>
            {status === 'connecting' && <Loader2 className="size-4 animate-spin" />}
            Conectar
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

type OpenAIStatus = 'checking' | 'disconnected' | 'connecting' | 'connected'

function OpenAICard() {
  const [status, setStatus] = useState<OpenAIStatus>('checking')
  const [connection, setConnection] = useState<OpenAIConnection | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    checkOpenAIConnection()
      .then((result) => {
        if (cancelled) return
        setConnection(result)
        setStatus(result ? 'connected' : 'disconnected')
      })
      .catch(() => {
        if (!cancelled) setStatus('disconnected')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleConnect() {
    if (!apiKey.trim()) return
    setStatus('connecting')
    setError(null)
    try {
      const result = await connectOpenAI(apiKey.trim())
      setConnection(result)
      setApiKey('')
      setStatus('connected')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('disconnected')
    }
  }

  async function handleDisconnect() {
    await disconnectOpenAI()
    setConnection(null)
    setTestResult(null)
    setStatus('disconnected')
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testOpenAIConnection()
      setTestResult({ ok: true, message: `Conexão OK — ${result.displayName}` })
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          OpenAI
        </CardTitle>
        <CardDescription>
          Conecte sua API key da OpenAI para os funcionários usarem ChatGPT como fallback quando o
          Claude esgotar a quota. A chave fica só no keychain do sistema operacional.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {status === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Verificando conexão…
          </div>
        )}

        {status === 'connected' && connection && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{connection.displayName}</p>
                <p className="text-xs text-muted-foreground">{connection.model}</p>
              </div>
              <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-3" />
                Conectado
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing && <Loader2 className="size-3.5 animate-spin" />}
                Testar conexão
              </Button>
              {testResult && (
                <p className={`text-xs ${testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                  {testResult.message}
                </p>
              )}
            </div>
          </>
        )}

        {(status === 'disconnected' || status === 'connecting') && (
          <div className="space-y-2">
            <Label htmlFor="openai-key">API key</Label>
            <Input
              id="openai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-••••••••••••••••••••••••••••••••••••"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConnect()
              }}
              disabled={status === 'connecting'}
            />
            {error && <ErrorMessage message={error} className="text-xs" />}
            <p className="text-xs text-muted-foreground">
              Crie uma chave em <code className="rounded bg-muted px-1 py-0.5">platform.openai.com</code> →
              API keys.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        {status === 'connected' ? (
          <Button variant="outline" onClick={handleDisconnect}>
            Desconectar
          </Button>
        ) : (
          <Button onClick={handleConnect} disabled={!apiKey.trim() || status === 'connecting'}>
            {status === 'connecting' && <Loader2 className="size-4 animate-spin" />}
            Conectar
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function DefaultCapsCard() {
  const [loading, setLoading] = useState(true)
  const [maxRounds, setMaxRounds] = useState('5')
  const [costCapUsd, setCostCapUsd] = useState('2.00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAppSettings()
      .then((settings) => {
        setMaxRounds(String(settings.defaultMaxRounds))
        setCostCapUsd(settings.defaultCostCapUsd.toFixed(2))
      })
      .finally(() => setLoading(false))
  }, [])

  const parsedMaxRounds = Number.parseInt(maxRounds, 10)
  const parsedCostCapUsd = Number.parseFloat(costCapUsd)
  const canSave =
    Number.isInteger(parsedMaxRounds) && parsedMaxRounds > 0 && Number.isFinite(parsedCostCapUsd) && parsedCostCapUsd > 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await updateAppSettings({ defaultMaxRounds: parsedMaxRounds, defaultCostCapUsd: parsedCostCapUsd })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tetos padrão de novas tarefas</CardTitle>
        <CardDescription>
          Toda tarefa nova nasce com estes tetos de rodadas e de custo — é o que trava o loop Dev↔QA (Fluxo 1) até
          você decidir se continua. Só valem pra tarefas criadas depois de salvar; as existentes não mudam.
        </CardDescription>
      </CardHeader>

      {loading ? (
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando…
          </div>
        </CardContent>
      ) : (
        <>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="default-max-rounds">Teto de rodadas</Label>
              <Input
                id="default-max-rounds"
                type="number"
                min={1}
                step={1}
                value={maxRounds}
                onChange={(e) => {
                  setMaxRounds(e.target.value)
                  setSaved(false)
                }}
              />
              <p className="text-xs text-muted-foreground">Quantas vezes o QA pode revisar antes de pausar.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="default-cost-cap">Teto de custo (USD)</Label>
              <Input
                id="default-cost-cap"
                type="number"
                min={0.01}
                step={0.01}
                value={costCapUsd}
                onChange={(e) => {
                  setCostCapUsd(e.target.value)
                  setSaved(false)
                }}
              />
              <p className="text-xs text-muted-foreground">Gasto de IA acumulado que pausa a tarefa.</p>
            </div>
          </CardContent>

          {error && (
            <CardContent className="pt-0">
              <ErrorMessage message={error} className="text-xs" />
            </CardContent>
          )}

          <CardFooter className="justify-end gap-2">
            {saved && <span className="text-xs text-muted-foreground">Salvo.</span>}
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save />}
              Salvar
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
