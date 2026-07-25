import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  getCostSavings, getKPI, getHeatmap, getWeatherImpact, getLeaderboard,
  type CostSavingsResponse, type KPIResponse, type HeatmapResponse,
  type WeatherImpactResponse, type LeaderboardResponse,
} from '../api/analytics'
import styles from './Analytics.module.css'

// ── Chart palette ──────────────────────────────────────────────────────────────
// Recharts renders literal SVG attribute colors, not CSS custom properties, so
// the theme is resolved once in JS rather than via var(--go) etc.

const CHART_COLORS = {
  light: { go: '#10B981', nogo: '#EF4444', urgent: '#F59E0B', accent: '#A9772A', muted: '#A39C8C', grid: '#E8E2D3', tick: '#A39C8C', tooltipBg: '#FFFFFF', tooltipBorder: '#E8E2D3', tooltipText: '#1E2A22' },
  dark:  { go: '#1FA971', nogo: '#E35B52', urgent: '#C1841A', accent: '#D9A54B', muted: '#8290A3', grid: 'rgba(243,236,218,0.14)', tick: '#8290A3', tooltipBg: '#16304F', tooltipBorder: 'rgba(243,236,218,0.14)', tooltipText: '#F3ECDA' },
} as const

const RISK_KEY: Record<string, 'go' | 'urgent' | 'nogo'> = { low: 'go', medium: 'urgent', high: 'nogo' }

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
  return <p className={styles.sectionLabel}>{children}</p>
}

function ChartCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className={styles.chartCard}>
      <p className={styles.chartTitle}>{title}</p>
      {subtitle && <p className={styles.chartSub}>{subtitle}</p>}
      {!subtitle && <div style={{ marginTop: 12 }} />}
      {children}
    </div>
  )
}

function StatTile({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: 'go' | 'accent'
}) {
  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>{label}</p>
      <p className={`${styles.statValue} ${styles.mono} ${accent ? styles[accent] : ''}`}>{value}</p>
      {sub && <p className={styles.statSub}>{sub}</p>}
    </div>
  )
}

// A minimal, theme-consistent tooltip.
function TT({ active, payload, label, unit }: {
  active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string; unit?: string
}) {
  const { theme } = useTheme()
  const c = CHART_COLORS[theme]
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      {label != null && <p className={styles.tooltipLabel}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ backgroundColor: p.color ?? c.accent }} />
          {p.name}: <span className={styles.tooltipVal}>{p.value}{unit ?? ''}</span>
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
  const { theme } = useTheme()
  const c = CHART_COLORS[theme]
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
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          {[1, 2, 3].map(i => (
            <div key={i} className={styles.skelBlock} style={{ height: 160, marginBottom: 16 }} />
          ))}
        </div>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          <div className={styles.errorCard}>
            <p className={styles.errorMsg}>{state.message}</p>
          </div>
        </div>
      </div>
    )
  }

  const { savings, heatmap, weather, leaderboard } = state.data
  const m = savings.metrics

  // ── Derived chart data ──────────────────────────────────────────────────────
  // Cost savings — AI vs baseline (two categories: highlight vs muted context).
  const aiVsBaseline = [
    { label: 'Baseline', rate: pct(m.baseline_success_rate, 1), color: c.muted },
    { label: 'With AI',  rate: pct(m.success_rate_with_ai, 1), color: c.accent },
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
    { label: 'Clear',      rate: pct(ws.clear_avg_success, 1),      color: c.go },
    { label: 'Light rain', rate: pct(ws.light_rain_avg_success, 1), color: c.urgent },
    { label: 'Heavy rain', rate: pct(ws.heavy_rain_avg_success, 1), color: c.nogo },
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
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>

        {/* Header + controls */}
        <div className={styles.pageHead}>
          <div>
            <h1>Analytics</h1>
            <p className={styles.sub}>{periodLabel.toUpperCase()} · LIVE FROM OPERATIONS DATA</p>
          </div>
          <div className={styles.periodToggle}>
            {(['week', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`${styles.periodBtn} ${period === p ? styles.periodBtnSel : ''}`}
              >
                {p === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </div>

        {/* ── ROI stat tiles ──────────────────────────────────────────────────── */}
        <div className={styles.section}>
          <SectionLabel>Cost Savings &amp; ROI · {periodLabel}</SectionLabel>
          <div className={styles.statGrid}>
            <StatTile label="AI Savings" value={fmtINR(m.total_savings_inr)} sub={`${m.deliveries_avoided} failed deliveries avoided`} accent="go" />
            <StatTile label="Success with AI" value={`${pct(m.success_rate_with_ai, 1)}%`} sub={`${m.improvement_pct >= 0 ? '+' : ''}${m.improvement_pct}% vs baseline`} accent="accent" />
            <StatTile label="NO-GO Decisions" value={String(m.no_go_count)} sub={`of ${m.total_orders} orders`} />
            <StatTile label="Fuel Saved" value={`${Math.round(m.fuel_saved_litres)} L`} sub={fmtINR(m.fuel_saved_inr)} />
          </div>
        </div>

        {/* ── AI vs baseline + Agent performance ──────────────────────────────── */}
        <div className={`${styles.section} ${styles.chartsGrid}`}>
          <ChartCard title="AI vs Baseline Success Rate" subtitle="Delivery success with AI decisions vs the historical baseline">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={aiVsBaseline} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: c.tick }} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: c.tick }} width={34} />
                <Tooltip content={<TT unit="%" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey="rate" name="Success rate" radius={[4, 4, 0, 0]} maxBarSize={90} label={{ position: 'top', fontSize: 12, fill: c.tick, formatter: (v: number) => `${v}%` }}>
                  {aiVsBaseline.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Agent Performance" subtitle="Success rate by agent (highest first)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={agentChart} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                <XAxis type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: c.tick }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: c.tick }} width={64} />
                <Tooltip content={<TT unit="%" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey="rate" name="Success rate" fill={c.accent} radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: 'right', fontSize: 11, fill: c.tick, formatter: (v: number) => `${v}%` }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Area risk ───────────────────────────────────────────────────────── */}
        <div className={styles.section}>
          <ChartCard title="Area / Zone Risk" subtitle="Failure rate by Chennai area, coloured by risk band">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={areaChart} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="area" tick={{ fontSize: 12, fill: c.tick }} />
                <YAxis unit="%" tick={{ fontSize: 11, fill: c.tick }} width={34} />
                <Tooltip content={<TT unit="%" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey="fail" name="Failure rate" radius={[4, 4, 0, 0]} maxBarSize={64}
                  label={{ position: 'top', fontSize: 11, fill: c.tick, formatter: (v: number) => `${v}%` }}>
                  {areaChart.map((d, i) => <Cell key={i} fill={c[RISK_KEY[d.band] ?? 'urgent']} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Status legend — identity is never colour-alone */}
            <div className={styles.legendRow}>
              {(['low', 'medium', 'high'] as const).map(b => (
                <span key={b} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ backgroundColor: c[RISK_KEY[b]] }} />
                  {b} risk
                </span>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* ── Weather impact ──────────────────────────────────────────────────── */}
        <div className={`${styles.section} ${styles.chartsGrid}`}>
          <ChartCard title="Daily Success Rate" subtitle={`Delivery success over ${periodLabel.toLowerCase()}`}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={weatherLine} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: c.tick }} minTickGap={16} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: c.tick }} width={34} />
                <Tooltip content={<TT unit="%" />} />
                <Line type="monotone" dataKey="rate" name="Success rate" stroke={c.accent} strokeWidth={2} dot={{ r: 2.5, fill: c.accent }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Success by Weather" subtitle={`Avg success by condition · ${fmtINR(ws.estimated_revenue_lost_to_weather_inr)} revenue lost to weather`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weatherBars} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: c.tick }} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: c.tick }} width={34} />
                <Tooltip content={<TT unit="%" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey="rate" name="Success rate" radius={[4, 4, 0, 0]} maxBarSize={72}
                  label={{ position: 'top', fontSize: 11, fill: c.tick, formatter: (v: number) => `${v}%` }}>
                  {weatherBars.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── BI export ───────────────────────────────────────────────────────── */}
        <div className={styles.biCard}>
          <p className={styles.biTitle}>Export for Power BI / Tableau</p>
          <p className={styles.biSub}>
            Tidy CSV tables ready to import into a BI tool — one table per dataset.
          </p>
          <div className={styles.biBtns}>
            <button onClick={exportAll} className={styles.biPrimary}>
              ⬇ Download all (4 CSVs)
            </button>
            {([
              ['Agents', exportAgents], ['Areas', exportAreas],
              ['Weather', exportWeather], ['Savings', exportSavings],
            ] as const).map(([label, fn]) => (
              <button key={label} onClick={fn} className={styles.biGhost}>
                {label}.csv
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
