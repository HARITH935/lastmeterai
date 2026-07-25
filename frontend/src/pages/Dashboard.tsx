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
import { useTheme } from '../contexts/ThemeContext'
import {
  getDashboard,
  getDailySummary,
  getCurrentWeather,
  type DashboardResponse,
  type DailySummaryResponse,
  type WeatherCurrent,
} from '../api/analytics'
import { AtRiskBoard } from '../components/AtRiskBoard'
import { AgentDashboard } from './AgentDashboard'
import { Placeholder } from './Placeholder'
import styles from './Dashboard.module.css'

// ── Chart palette ──────────────────────────────────────────────────────────────
// Recharts renders literal SVG attribute colors, not CSS custom properties, so
// the theme is resolved once in JS rather than via var(--go) etc.

const CHART_COLORS = {
  light: { go: '#10B981', nogo: '#EF4444', accent: '#A9772A', accentSoft: '#D9A54B', grid: '#E8E2D3', tick: '#A39C8C', tooltipBg: '#FFFFFF', tooltipBorder: '#E8E2D3', tooltipText: '#1E2A22' },
  dark:  { go: '#1FA971', nogo: '#E35B52', accent: '#D9A54B', accentSoft: '#E8BE73', grid: 'rgba(243,236,218,0.14)', tick: '#8290A3', tooltipBg: '#16304F', tooltipBorder: 'rgba(243,236,218,0.14)', tooltipText: '#F3ECDA' },
} as const

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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

function DashboardSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.aiSkeleton} style={{ marginBottom: 20 }} />
        <div className={styles.kpiGrid}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.aiSkeleton} style={{ height: 76 }} />)}
        </div>
        <div className={styles.chartsGrid}>
          <div className={styles.aiSkeleton} style={{ height: 240 }} />
          <div className={styles.aiSkeleton} style={{ height: 240 }} />
        </div>
      </div>
    </div>
  )
}

// ── KPI tile (Dashboard-local — MetricCard.tsx is shared with Reports/Earnings) ──

function KpiTile({ label, value, accent }: { label: string; value: string | number; accent?: 'go' | 'nogo' }) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={`${styles.kpiValue} ${styles.mono} ${accent ? styles[accent] : ''}`}>{value}</div>
    </div>
  )
}

// ── Chart section header ───────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <p className={styles.chartTitle}>{title}</p>
      {children}
    </div>
  )
}

// ── Weather widget ─────────────────────────────────────────────────────────────

const RISK_CLASS: Record<string, string> = {
  low: styles.riskLow,
  medium: styles.riskMedium,
  high: styles.riskHigh,
}

function WeatherWidget({ accessToken }: { accessToken: string }) {
  const [weather, setWeather] = useState<WeatherCurrent | null>(null)

  useEffect(() => {
    getCurrentWeather(accessToken).then(setWeather).catch(() => {})
  }, [accessToken])

  if (!weather) return null

  return (
    <div className={styles.weatherRow}>
      <img
        src={`https://openweathermap.org/img/wn/${weather.icon_code}.png`}
        alt={weather.description}
        className={styles.weatherIcon}
      />
      <div className={styles.weatherBody}>
        <p className={styles.weatherDesc}>{weather.description}</p>
        <p className={styles.weatherMeta}>
          {weather.temp_c}°C · Wind {weather.wind_kmh} km/h · Humidity {weather.humidity_pct}%
        </p>
      </div>
      <span className={`${styles.weatherRisk} ${RISK_CLASS[weather.risk_level] ?? styles.riskLow}`}>
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
    return <div className={styles.aiSkeleton} />
  }

  if (state.status === 'error') return null

  const { data } = state
  const time = new Date(data.generated_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className={styles.aiCard}>
      <div className={styles.aiMark}>AI</div>
      <div className={styles.aiBody}>
        <p className={styles.aiLabel}>Morning Briefing</p>
        <p className={styles.aiText}>{data.summary}</p>
        <p className={styles.aiTime}>Generated at {time}</p>
      </div>
      <button onClick={load} title="Refresh briefing" className={styles.aiRefresh}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>
    </div>
  )
}

// ── Dashboard content ──────────────────────────────────────────────────────────

function DashboardContent({ data, accessToken }: { data: DashboardResponse; accessToken: string }) {
  const { cards, trends } = data
  const { theme } = useTheme()
  const c = CHART_COLORS[theme]

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
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  const tooltipStyle = {
    background: c.tooltipBg,
    border: `1px solid ${c.tooltipBorder}`,
    borderRadius: 6,
    fontSize: 12,
    color: c.tooltipText,
  }

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        <div className={styles.pageHead}>
          <div>
            <h1>Executive Dashboard</h1>
            <p className={styles.sub}>{today.toUpperCase()}</p>
          </div>
        </div>

        {/* AI Summary + Weather */}
        <div className={styles.topRow}>
          <AISummaryCard accessToken={accessToken} />
          <WeatherWidget accessToken={accessToken} />
        </div>

        {/* Deadline countdown board */}
        <div style={{ marginBottom: 20 }}>
          <AtRiskBoard accessToken={accessToken} />
        </div>

        {/* KPI tiles */}
        <div className={styles.kpiGrid}>
          <KpiTile label="Total orders today" value={cards.total_orders_today} />
          <KpiTile label="Deliveries completed" value={cards.deliveries_completed} accent="go" />
          <KpiTile
            label="High risk orders"
            value={cards.high_risk_orders}
            accent={cards.high_risk_orders > 0 ? 'nogo' : undefined}
          />
          <KpiTile label="Revenue today" value={formatINR(cards.revenue_today)} />
          <KpiTile label="Estimated savings" value={formatINR(cards.estimated_savings)} accent="go" />
          <KpiTile label="Active agents" value={cards.active_agents} />
        </div>

        {/* Charts row 1 */}
        <div className={styles.chartsGrid}>
          <ChartCard title="Delivery Success Rate (last 7 days)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={srData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: c.tick }} axisLine={{ stroke: c.grid }} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 11, fill: c.tick }}
                  width={40}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Success Rate']} contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={c.go}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: c.go, stroke: c.tooltipBg, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Revenue by Day (₹, last 7 days)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: c.tick }} axisLine={{ stroke: c.grid }} tickLine={false} />
                <YAxis
                  tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: c.tick }}
                  width={48}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={(v: number) => [formatINR(v), 'Revenue']} contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill={c.accent} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Charts row 2 — full width */}
        <ChartCard title="Failure Rate by Area (all-time)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={areaData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke={c.grid} vertical={false} />
              <XAxis dataKey="area" tick={{ fontSize: 11, fill: c.tick }} axisLine={{ stroke: c.grid }} tickLine={false} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 11, fill: c.tick }}
                width={40}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Failure Rate']} contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill={c.nogo} radius={[4, 4, 0, 0]} maxBarSize={40} />
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
      <div className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.card} style={{ borderColor: 'var(--nogo)' }}>
            <p style={{ color: 'var(--nogo)', fontWeight: 600, fontSize: '0.9rem' }}>Failed to load dashboard</p>
            <p style={{ color: 'var(--nogo)', opacity: 0.85, fontSize: '0.8rem', marginTop: 4 }}>{state.message}</p>
          </div>
        </div>
      </div>
    )
  }

  return <DashboardContent data={state.data} accessToken={accessToken} />
}
