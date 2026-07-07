import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import {
  getDashboard,
  getDailySummary,
  getCurrentWeather,
  type DashboardResponse,
  type DailySummaryResponse,
  type WeatherCurrent,
} from '../api/analytics'
import { MetricCard } from '../components/ui/MetricCard'
import { AtRiskBoard } from '../components/AtRiskBoard'
import { AgentDashboard } from './AgentDashboard'
import { Placeholder } from './Placeholder'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string): string {
  // "2026-06-24" → "Jun 24"
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function toPercent(ratio: number): number {
  return Math.round(ratio * 1000) / 10  // 0.8762 → 87.6
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
      <Skeleton className="h-60" />
    </div>
  )
}

// ── Chart section header ───────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <p className="text-sm font-semibold text-slate-700 mb-3">{title}</p>
      {children}
    </div>
  )
}

// ── Weather widget ─────────────────────────────────────────────────────────────

const RISK_BG: Record<string, string> = {
  low:    'bg-green-50 border-green-200 text-green-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  high:   'bg-red-50 border-red-200 text-red-600',
}

function WeatherWidget({ accessToken }: { accessToken: string }) {
  const [weather, setWeather] = useState<WeatherCurrent | null>(null)

  useEffect(() => {
    getCurrentWeather(accessToken).then(setWeather).catch(() => {})
  }, [accessToken])

  if (!weather) return null

  const riskClass = RISK_BG[weather.risk_level] ?? RISK_BG.low

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${riskClass}`}>
      <img
        src={`https://openweathermap.org/img/wn/${weather.icon_code}.png`}
        alt={weather.description}
        className="w-8 h-8"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold capitalize">{weather.description}</p>
        <p className="text-xs opacity-75">
          {weather.temp_c}°C · Wind {weather.wind_kmh} km/h · Humidity {weather.humidity_pct}%
        </p>
      </div>
      <span className="text-xs font-bold uppercase tracking-wide shrink-0">
        {weather.risk_level} risk
      </span>
    </div>
  )
}

// ── AI Daily Summary Card ──────────────────────────────────────────────────────

function AISummaryCard({ accessToken }: { accessToken: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'success'; data: DailySummaryResponse }
  >({ status: 'loading' })

  const load = () => {
    setState({ status: 'loading' })
    getDailySummary(accessToken)
      .then(data => setState({ status: 'success', data }))
      .catch(() => setState({ status: 'error' }))
  }

  useEffect(() => { load() }, [accessToken])

  if (state.status === 'loading') {
    return <div className="animate-pulse h-24 bg-slate-200 rounded-2xl" />
  }

  if (state.status === 'error') return null

  const { data } = state
  const time = new Date(data.generated_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl mt-0.5">🤖</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
              AI Morning Briefing
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{data.summary}</p>
            <p className="text-[10px] text-slate-400 mt-1.5">Generated at {time}</p>
          </div>
        </div>
        <button
          onClick={load}
          title="Refresh briefing"
          className="text-blue-400 hover:text-blue-600 shrink-0 mt-0.5 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Dashboard content ──────────────────────────────────────────────────────────

function DashboardContent({ data, accessToken }: { data: DashboardResponse; accessToken: string }) {
  const { cards, trends } = data

  const srData = trends.success_rate_over_time.map(d => ({
    date: fmtDate(d.date),
    value: toPercent(d.success_rate),
  }))

  const revData = trends.revenue_by_day.map(d => ({
    date: fmtDate(d.date),
    value: d.revenue,
  }))

  const areaData = trends.failure_rate_by_area.map(d => ({
    area: d.area,
    value: toPercent(d.failure_rate),
  }))

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <div className="px-4 md:px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-slate-900">Executive Dashboard</h1>
        <p className="text-xs text-slate-400 mt-0.5">Today: {today}</p>
      </div>

      <div className="px-4 md:px-6 pb-8 space-y-6">

      {/* AI Summary + Weather row */}
      <div className="space-y-3">
        <AISummaryCard accessToken={accessToken} />
        <WeatherWidget accessToken={accessToken} />
      </div>

      {/* Deadline countdown board */}
      <AtRiskBoard accessToken={accessToken} />

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard label="Total Orders Today" value={cards.total_orders_today} />
        <MetricCard
          label="Deliveries Completed"
          value={cards.deliveries_completed}
          accent="text-go"
        />
        <MetricCard
          label="High Risk Orders"
          value={cards.high_risk_orders}
          accent={cards.high_risk_orders > 0 ? 'text-nogo' : undefined}
        />
        <MetricCard label="Revenue Today" value={formatINR(cards.revenue_today)} />
        <MetricCard
          label="Estimated Savings"
          value={formatINR(cards.estimated_savings)}
          accent="text-go"
        />
        <MetricCard label="Active Agents" value={cards.active_agents} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Delivery Success Rate (last 7 days)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={srData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                width={40}
              />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Success Rate']} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563EB"
                strokeWidth={2}
                dot={{ r: 3, fill: '#2563EB' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Day (₹, last 7 days)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis
                tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                width={48}
              />
              <Tooltip formatter={(v: number) => [formatINR(v), 'Revenue']} />
              <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 — full width */}
      <ChartCard title="Failure Rate by Area (all-time)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={areaData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="area" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis
              domain={[0, 100]}
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              width={40}
            />
            <Tooltip formatter={(v: number) => [`${v}%`, 'Failure Rate']} />
            <Bar dataKey="value" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={64} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user, access_token } = useAuth()

  if (user?.role === 'agent') return <AgentDashboard />
  if (user?.role !== 'manager') return <Placeholder name="Dashboard" />

  return <DashboardFetcher accessToken={access_token!} />
}

function DashboardFetcher({ accessToken }: { accessToken: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; data: DashboardResponse }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getDashboard(accessToken)
      .then(data => { if (!cancelled) setState({ status: 'success', data }) })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Unable to load dashboard data.'
          setState({ status: 'error', message: msg })
        }
      })
    return () => { cancelled = true }
  }, [accessToken])

  if (state.status === 'loading') return <DashboardSkeleton />

  if (state.status === 'error') {
    return (
      <div className="p-6">
        <div className="card border-nogo/30 bg-red-50">
          <p className="text-sm font-semibold text-nogo">Failed to load dashboard</p>
          <p className="text-xs text-nogo/80 mt-1">{state.message}</p>
        </div>
      </div>
    )
  }

  return <DashboardContent data={state.data} accessToken={accessToken} />
}
