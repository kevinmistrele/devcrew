import { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  listUsageByDay,
  listUsageByProject,
  listUsageByProvider,
  type DailyUsageSummary,
  type ProjectUsageSummary,
  type ProviderUsageSummary,
  type ProviderId,
} from '@/core/db'
import { providerLabel } from '@/core/employee-manager'
import { EmptyState, PageLoader } from '@/ui/feedback'

// Cores categóricas fixas por provedor (nunca cicladas) — validadas com o script do skill
// de dataviz: passam CVD/contraste em claro e escuro. Anthropic = roxo (mesmo acento
// primário do app); OpenAI = verde-azulado, uma identidade só dele.
const PROVIDER_COLOR: Record<ProviderId, string> = {
  anthropic: '#8b5cf6',
  openai: '#0d9488',
}

// Ranking de um único agrupamento (projeto) — magnitude, não identidade cross-chart, então
// uma cor só (o acento primário) em vez de uma cor por barra.
const RANK_COLOR = '#8b5cf6'

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--popover-foreground)',
  fontSize: '12px',
}

function formatUsd(value: number): string {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function CostDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [byProvider, setByProvider] = useState<ProviderUsageSummary[]>([])
  const [byProject, setByProject] = useState<ProjectUsageSummary[]>([])
  const [byDay, setByDay] = useState<DailyUsageSummary[]>([])
  const [periodDays, setPeriodDays] = useState('30')

  useEffect(() => {
    Promise.all([listUsageByProvider(), listUsageByProject()]).then(([providerRows, projectRows]) => {
      setByProvider(providerRows)
      setByProject(projectRows)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    listUsageByDay(Number(periodDays)).then(setByDay)
  }, [periodDays])

  const totals = useMemo(
    () =>
      byProvider.reduce(
        (acc, row) => ({
          costUsd: acc.costUsd + row.costUsd,
          tokens: acc.tokens + row.tokensIn + row.tokensOut,
          calls: acc.calls + row.calls,
        }),
        { costUsd: 0, tokens: 0, calls: 0 },
      ),
    [byProvider],
  )

  if (loading) {
    return <PageLoader />
  }

  const hasUsage = totals.calls > 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-medium">Custos</h1>
        <p className="text-sm text-muted-foreground">
          Gasto de IA lido direto da tabela <code className="rounded bg-muted px-1 py-0.5">usage</code> — por
          provedor, por projeto e ao longo do tempo.
        </p>
      </div>

      {!hasUsage ? (
        <EmptyState
          icon={CircleDollarSign}
          title="Nenhum gasto registrado ainda"
          description="Assim que um funcionário chamar uma IA, o gasto aparece aqui — por provedor, projeto e dia."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <CardDescription>Custo total</CardDescription>
                <CardTitle className="text-2xl">{formatUsd(totals.costUsd)}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>Tokens (in + out)</CardDescription>
                <CardTitle className="text-2xl">{formatTokens(totals.tokens)}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>Chamadas de IA</CardDescription>
                <CardTitle className="text-2xl">{totals.calls}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Gasto por provedor</CardTitle>
              <CardDescription>Soma de tudo já gasto, sem recorte de período.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 pb-3">
                {byProvider.map((row) => (
                  <span key={row.provider} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: PROVIDER_COLOR[row.provider] }}
                      aria-hidden
                    />
                    {providerLabel(row.provider)}: {formatUsd(row.costUsd)} · {formatTokens(row.tokensIn + row.tokensOut)}{' '}
                    tokens · {row.calls} chamada(s)
                  </span>
                ))}
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byProvider} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatUsd} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis
                      type="category"
                      dataKey="provider"
                      tickFormatter={(value: ProviderId) => providerLabel(value)}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => formatUsd(Number(value))}
                      labelFormatter={(value) => providerLabel(value as ProviderId)}
                    />
                    <Bar dataKey="costUsd" radius={[0, 4, 4, 0]} barSize={28}>
                      {byProvider.map((row) => (
                        <Cell key={row.provider} fill={PROVIDER_COLOR[row.provider]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gasto por projeto</CardTitle>
              <CardDescription>
                Via <code className="rounded bg-muted px-1 py-0.5">usage.task_id → tasks.project_id</code>; chamadas
                sem tarefa (ex.: leitura inicial do Orquestrador) entram em "Sem projeto".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byProject} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatUsd} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis
                      type="category"
                      dataKey="projectName"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      width={110}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatUsd(Number(value))} />
                    <Bar dataKey="costUsd" radius={[0, 4, 4, 0]} barSize={20} fill={RANK_COLOR} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Gasto por período</CardTitle>
                <CardDescription>Custo diário — ajuda a antecipar quando um teto vai bater.</CardDescription>
              </div>
              <Select value={periodDays} onValueChange={setPeriodDays}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {byDay.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sem gasto neste período.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={byDay} margin={{ left: 8, right: 16 }}>
                      <defs>
                        <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={RANK_COLOR} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={RANK_COLOR} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                      <YAxis tickFormatter={formatUsd} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={64} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatUsd(Number(value))} />
                      <Area
                        type="monotone"
                        dataKey="costUsd"
                        stroke={RANK_COLOR}
                        strokeWidth={2}
                        fill="url(#costGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
