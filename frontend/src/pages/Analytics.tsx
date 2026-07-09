import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import {
  getCostSavings, getKPI, getHeatmap, getWeatherImpact, getLeaderboard,
  type CostSavingsResponse, type KPIResponse, type HeatmapResponse,
  type WeatherImpactResponse, type LeaderboardResponse,
} from '../api/analytics'

// ── Palette (validated: status trio green/amber/red passes CVD; single-hue elsewhere) ──
const BLUE  = '#2563EB'
const MUTED = '#94A3B8'
const RISK_COLOR: Record<string, string> = { low: '#16A34A', medium: '#F59E0B', high: '#DC2626' }
const GRID = '#e2e8f0'
const TICK = '#94a3b8'

type Period = 'week' | 'month'

// ── Small helpers ────────────────────────────────────────────────────────────────
function pct(ratio: number, dp = 0): number {
  return Math.round(ratio * 100 * 10 ** dp) / 10 ** dp
}
function fmtINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function firstWord(s: string): string {
  return s.split(' ')[0]
}
function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Unable to load analytics.'
}

// ── CSV export (tidy tables → Tableau / Power BI) ────────────────────────────────
function toCSV(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = cols.join(',')
  const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n')
  return `${head}\n${body}`
}
function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── UI atoms ──────────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
      {children}
    </p>
  )
}

function ChartCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="card dark:bg-slate-900 dark:border-slate-800">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mb-3 mt-0.5">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
    </div>
  )
}

function StatTile({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="card dark:bg-slate-900 dark:border-slate-800">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// A minimal, theme-consistent tooltip.
function TT({ active, payload, label, unit }: {
  active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string; unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg px-3 py-2 text-xs">
      {label != null && <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-slate-600 dark:text-slate-300">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: p.color ?? BLUE }} />
          {p.name}: <span className="font-semibold">{p.value}{unit ?? ''}</span>
        </p>
      ))}
    </div>
  )
}

// ── Data bundle ──────────────────────────────────────────────────────────────────
interface Bundle {
  savings: CostSavingsResponse
  kpi: KPIResponse
  heatmap: HeatmapResponse
  weather: WeatherImpactResponse
  leaderboard: LeaderboardResponse
}

// ── Main ────────────────────────────────────────────────────────────────────────
export function Analytics() {
  const { access_token } = useAuth()
  const [period, setPeriod] = useState<Period>('week')
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; data: Bundle }
  >({ status: 'loading' })

  useEffect(() => {
    if (!access_token) return
    let cancelled = false
    setState({ status: 'loading' })
    Promise.all([
      getCostSavings(access_token, period),
      getKPI(access_token, period),
      getHeatmap(access_token),
      getWeatherImpact(access_token, period),
      getLeaderboard(access_token, period),
    ])
      .then(([savings, kpi, heatmap, weather, leaderboard]) => {
        if (!cancelled) setState({ status: 'success', data: { savings, kpi, heatmap, weather, leaderboard } })
      })
      .catch(err => { if (!cancelled) setState({ status: 'error', message: extractMsg(err) }) })
    return () => { cancelled = true }
  }, [access_token, period])

  const periodLabel = period === 'week' ? 'Last 7 days' : 'Last 30 days'

  if (state.status === 'loading') {
    return (
      <div className="p-4 md:p-6 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse bg-slate-200 dark:bg-slate-800 rounded-2xl h-40" />
        ))}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="p-4 md:p-6">
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-600">{state.message}</p>
        </div>
      </div>
    )
  }

  const { savings, kpi, heatmap, weather, leaderboard } = state.data
  const m = savings.metrics

  // ── Derived chart data ──────────────────────────────────────────────────────
  // Cost savings — AI vs baseline (two categories: highlight vs muted context).
  const aiVsBaseline = [
    { label: 'Baseline', rate: pct(m.baseline_success_rate, 1), color: MUTED },
    { label: 'With AI',  rate: pct(m.success_rate_with_ai, 1), color: BLUE },
  ]

  // Agent performance — success rate per agent, sorted desc, single hue.
  const agentChart = [...leaderboard.agents]
    .sort((a, b) => b.success_rate - a.success_rate)
    .map(a => ({ name: firstWord(a.agent_name), rate: pct(a.success_rate, 1) }))

  // Area / zone risk — failure rate by area, colored by risk band (status).
  const areaChart = [...heatmap.zones]
    .sort((a, b) => b.failure_rate - a.failure_rate)
    .map(z => ({ area: firstWord(z.area), fail: pct(z.failure_rate, 1), band: z.risk_band }))

  // Weather — daily success rate line + per-condition average bars.
  const weatherLine = weather.daily_correlation.map(d => ({
    date: shortDate(d.date), rate: pct(d.success_rate, 1),
  }))
  const ws = weather.summary
  const weatherBars = [
    { label: 'Clear',      rate: pct(ws.clear_avg_success, 1),      color: RISK_COLOR.low },
    { label: 'Light rain', rate: pct(ws.light_rain_avg_success, 1), color: RISK_COLOR.medium },
    { label: 'Heavy rain', rate: pct(ws.heavy_rain_avg_success, 1), color: RISK_COLOR.high },
  ]

  // ── CSV exports ─────────────────────────────────────────────────────────────
  const suffix = `${period}`
  const exportAgents = () => downloadCSV(`agents_${suffix}.csv`, toCSV(
    leaderboard.agents.map(a => ({
      rank: a.rank, agent_name: a.agent_name, area: a.area ?? '',
      orders: a.order_count, delivered: a.delivered_count, failed: a.failed_count,
      success_rate_pct: pct(a.success_rate, 1), performance_score: Math.round(a.performance_score * 100),
      earnings_inr: Math.round(a.earnings_inr),
      avg_rating: a.avg_rating ?? '', rating_count: a.rating_count,
    })),
  ))
  const exportAreas = () => downloadCSV(`areas.csv`, toCSV(
    heatmap.zones.map(z => ({
      area: z.area, order_count: z.order_count,
      failure_rate_pct: pct(z.failure_rate, 1),
      predicted_failure_rate_pct: pct(z.predicted_failure_rate, 1),
      live_failure_rate_pct: pct(z.live_failure_rate, 1),
      risk_band: z.risk_band,
    })),
  ))
  const exportWeather = () => downloadCSV(`weather_daily_${suffix}.csv`, toCSV(
    weather.daily_correlation.map(d => ({
      date: d.date, weather_condition: d.weather_condition,
      success_rate_pct: pct(d.success_rate, 1), order_count: d.order_count,
    })),
  ))
  const exportSavings = () => downloadCSV(`savings_${suffix}.csv`, toCSV([{
    period, total_orders: m.total_orders, go_count: m.go_count, no_go_count: m.no_go_count,
    deliveries_avoided: m.deliveries_avoided, fuel_saved_litres: m.fuel_saved_litres,
    fuel_saved_inr: Math.round(m.fuel_saved_inr), failed_cost_avoided_inr: Math.round(m.failed_cost_avoided_inr),
    total_savings_inr: Math.round(m.total_savings_inr),
    success_rate_with_ai_pct: pct(m.success_rate_with_ai, 1),
    baseline_success_rate_pct: pct(m.baseline_success_rate, 1),
    improvement_pct: m.improvement_pct,
  }]))
  const exportAll = () => {
    exportAgents()
    setTimeout(exportAreas, 250)
    setTimeout(exportWeather, 500)
    setTimeout(exportSavings, 750)
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      {/* Header + controls */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Analytics</h1>
          <p className="text-xs text-slate-400 mt-0.5">{periodLabel} · live from operations data</p>
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {(['week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                period === p
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              {p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {/* ── ROI stat tiles ──────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Cost Savings &amp; ROI · {periodLabel}</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="AI Savings" value={fmtINR(m.total_savings_inr)} sub={`${m.deliveries_avoided} failed deliveries avoided`} accent="text-green-600" />
          <StatTile label="Success with AI" value={`${pct(m.success_rate_with_ai, 1)}%`} sub={`${m.improvement_pct >= 0 ? '+' : ''}${m.improvement_pct}% vs baseline`} accent="text-blue-600" />
          <StatTile label="NO-GO Decisions" value={String(m.no_go_count)} sub={`of ${m.total_orders} orders`} />
          <StatTile label="Fuel Saved" value={`${Math.round(m.fuel_saved_litres)} L`} sub={fmtINR(m.fuel_saved_inr)} />
        </div>
      </div>

      {/* ── AI vs baseline + Agent performance ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="AI vs Baseline Success Rate" subtitle="Delivery success with AI decisions vs the historical baseline">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={aiVsBaseline} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: TICK }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: TICK }} width={34} />
              <Tooltip content={<TT unit="%" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
              <Bar dataKey="rate" name="Success rate" radius={[4, 4, 0, 0]} maxBarSize={90} label={{ position: 'top', fontSize: 12, fill: TICK, formatter: (v: number) => `${v}%` }}>
                {aiVsBaseline.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Agent Performance" subtitle="Success rate by agent (highest first)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={agentChart} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: TICK }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: TICK }} width={64} />
              <Tooltip content={<TT unit="%" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
              <Bar dataKey="rate" name="Success rate" fill={BLUE} radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: 'right', fontSize: 11, fill: TICK, formatter: (v: number) => `${v}%` }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Area risk ───────────────────────────────────────────────────────── */}
      <ChartCard title="Area / Zone Risk" subtitle="Failure rate by Chennai area, coloured by risk band">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={areaChart} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="area" tick={{ fontSize: 12, fill: TICK }} />
            <YAxis unit="%" tick={{ fontSize: 11, fill: TICK }} width={34} />
            <Tooltip content={<TT unit="%" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="fail" name="Failure rate" radius={[4, 4, 0, 0]} maxBarSize={64}
              label={{ position: 'top', fontSize: 11, fill: TICK, formatter: (v: number) => `${v}%` }}>
              {areaChart.map((d, i) => <Cell key={i} fill={RISK_COLOR[d.band] ?? MUTED} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Status legend — identity is never colour-alone */}
        <div className="flex gap-4 mt-2 flex-wrap">
          {(['low', 'medium', 'high'] as const).map(b => (
            <span key={b} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 capitalize">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_COLOR[b] }} />
              {b} risk
            </span>
          ))}
        </div>
      </ChartCard>

      {/* ── Weather impact ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Daily Success Rate" subtitle={`Delivery success over ${periodLabel.toLowerCase()}`}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={weatherLine} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: TICK }} minTickGap={16} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: TICK }} width={34} />
              <Tooltip content={<TT unit="%" />} />
              <Line type="monotone" dataKey="rate" name="Success rate" stroke={BLUE} strokeWidth={2} dot={{ r: 2.5, fill: BLUE }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Success by Weather" subtitle={`Avg success by condition · ${fmtINR(ws.estimated_revenue_lost_to_weather_inr)} revenue lost to weather`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weatherBars} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: TICK }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: TICK }} width={34} />
              <Tooltip content={<TT unit="%" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
              <Bar dataKey="rate" name="Success rate" radius={[4, 4, 0, 0]} maxBarSize={72}
                label={{ position: 'top', fontSize: 11, fill: TICK, formatter: (v: number) => `${v}%` }}>
                {weatherBars.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── BI export ───────────────────────────────────────────────────────── */}
      <div className="card dark:bg-slate-900 dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Export for Power BI / Tableau</p>
        <p className="text-xs text-slate-400 mb-3 mt-0.5">
          Tidy CSV tables ready to import into a BI tool — one table per dataset.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportAll} className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors">
            ⬇ Download all (4 CSVs)
          </button>
          {([
            ['Agents', exportAgents], ['Areas', exportAreas],
            ['Weather', exportWeather], ['Savings', exportSavings],
          ] as const).map(([label, fn]) => (
            <button key={label} onClick={fn}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors">
              {label}.csv
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
