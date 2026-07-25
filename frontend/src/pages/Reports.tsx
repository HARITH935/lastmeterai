import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  getKPI, getWeatherImpact, getCostSavings,
  type KPIResponse, type WeatherImpactResponse, type CostSavingsResponse,
} from '../api/analytics'
import styles from './Reports.module.css'

// ── Chart palette ──────────────────────────────────────────────────────────────
// Recharts renders literal SVG attribute colors, not CSS custom properties, so
// the theme is resolved once in JS rather than via var(--go) etc.

const CHART_COLORS = {
  light: { go: '#10B981', nogo: '#EF4444', accent: '#A9772A', accentSoft: '#D9A54B', grid: '#E8E2D3', tick: '#A39C8C', tooltipBg: '#FFFFFF', tooltipBorder: '#E8E2D3', tooltipText: '#1E2A22' },
  dark:  { go: '#1FA971', nogo: '#E35B52', accent: '#D9A54B', accentSoft: '#E8BE73', grid: 'rgba(243,236,218,0.14)', tick: '#8290A3', tooltipBg: '#16304F', tooltipBorder: 'rgba(243,236,218,0.14)', tooltipText: '#F3ECDA' },
} as const

// ── CSV export ─────────────────────────────────────────────────────────────────

function buildCSV(data: ReportData, period: string): string {
  const rows: string[][] = []
  const ts = new Date().toLocaleString('en-IN')
  const label = period === 'week' ? 'Last 7 Days' : 'Last 30 Days'

  rows.push([`LastMeter AI — Report Export (${label})`, '', `Generated: ${ts}`])
  rows.push([])

  // Summary
  const s = data.kpi.summary
  rows.push(['SUMMARY'])
  rows.push(['Metric', 'Value'])
  rows.push(['Total Orders', String(s.total_orders)])
  rows.push(['Delivered', String(s.total_delivered)])
  rows.push(['Failed Delivery %', `${(s.failed_delivery_pct * 100).toFixed(1)}%`])
  rows.push(['Avg Delivery Time (min)', String(s.avg_delivery_time_minutes)])
  rows.push([])

  // Agent performance
  rows.push(['AGENT PERFORMANCE'])
  rows.push(['Agent', 'Area', 'Orders', 'Delivered', 'Success Rate', 'Performance Score'])
  for (const a of data.kpi.agent_performance) {
    rows.push([
      a.agent_name,
      a.area,
      String(a.order_count),
      String(a.delivered_count),
      `${(a.success_rate * 100).toFixed(1)}%`,
      String(a.performance_score),
    ])
  }
  rows.push([])

  // Area performance
  rows.push(['AREA PERFORMANCE'])
  rows.push(['Area', 'Total Orders', 'Successful', 'Failed', 'Avg Risk Score'])
  for (const a of data.kpi.area_performance) {
    rows.push([
      a.area,
      String(a.total_orders),
      String(a.success_count),
      String(a.failure_count),
      String(a.avg_risk_score),
    ])
  }
  rows.push([])

  // Cost savings
  const m = data.savings.metrics
  rows.push(['COST SAVINGS (ALL TIME)'])
  rows.push(['Metric', 'Value'])
  rows.push(['Total Orders', String(m.total_orders)])
  rows.push(['GO Decisions', String(m.go_count)])
  rows.push(['NO-GO Decisions', String(m.no_go_count)])
  rows.push(['Deliveries Avoided', String(m.deliveries_avoided)])
  rows.push(['Fuel Saved (litres)', String(m.fuel_saved_litres)])
  rows.push(['Fuel Saved (INR)', `₹${m.fuel_saved_inr.toFixed(2)}`])
  rows.push(['Failed Cost Avoided (INR)', `₹${m.failed_cost_avoided_inr.toFixed(2)}`])
  rows.push(['Total Savings (INR)', `₹${m.total_savings_inr.toFixed(2)}`])
  rows.push(['Success Rate with AI', `${(m.success_rate_with_ai * 100).toFixed(1)}%`])
  rows.push(['Baseline Success Rate', `${(m.baseline_success_rate * 100).toFixed(1)}%`])
  rows.push(['Improvement', `+${m.improvement_pct.toFixed(1)}%`])

  return rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month'

interface ReportData {
  kpi:     KPIResponse
  weather: WeatherImpactResponse
  savings: CostSavingsResponse
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toPercent(ratio: number, dp = 1): string {
  return (Math.round(ratio * 1000) / 10).toFixed(dp) + '%'
}

function formatINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Unable to load reports.'
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function ReportsSkeleton() {
  return (
    <>
      <div className={styles.kpiGrid} style={{ marginBottom: 22 }}>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 76 }} />)}
      </div>
      <div className={styles.skelBlock} style={{ height: 208, marginBottom: 22 }} />
      <div className={styles.chartsGrid} style={{ marginBottom: 22 }}>
        <div className={styles.skelBlock} style={{ height: 256 }} />
        <div className={styles.skelBlock} style={{ height: 256 }} />
      </div>
      <div className={styles.kpiGrid} style={{ marginBottom: 22 }}>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 76 }} />)}
      </div>
      <div className={styles.kpiGrid5}>
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 76 }} />)}
      </div>
    </>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <p className={styles.sectionLabel}>{children}</p>
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.chartCard}>
      <p className={styles.chartTitle}>{title}</p>
      {children}
    </div>
  )
}

// ── KPI tile ───────────────────────────────────────────────────────────────────

function ReportKpi({ label, value, accent }: { label: string; value: string | number; accent?: 'go' | 'nogo' | 'urgent' }) {
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={`${styles.kpiValue} ${styles.mono} ${accent ? styles[accent] : ''}`}>{value}</p>
    </div>
  )
}

// ── Report content ─────────────────────────────────────────────────────────────

function ReportsContent({ data, period }: { data: ReportData; period: Period }) {
  const { kpi, weather, savings } = data
  const { summary, agent_performance, area_performance } = kpi
  const { theme } = useTheme()
  const c = CHART_COLORS[theme]

  const periodLabel = period === 'week' ? 'Last 7 Days' : 'Last 30 Days'

  // Area bar chart — stacked success vs failure
  const areaChart = area_performance.map(a => ({
    area: a.area.split(' ')[0],   // "Anna", "T", "Velachery", "Adyar", "Porur"
    success: a.success_count,
    failure: a.failure_count,
  }))

  // Weather daily LineChart
  const weatherChart = weather.daily_correlation.map(d => ({
    date: fmtShortDate(d.date),
    rate: parseFloat(toPercent(d.success_rate, 0)),
  }))

  const tooltipStyle = {
    background: c.tooltipBg,
    border: `1px solid ${c.tooltipBorder}`,
    borderRadius: 6,
    fontSize: 12,
    color: c.tooltipText,
  }

  return (
    <>
      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <SectionLabel>Summary · {periodLabel}</SectionLabel>
        <div className={styles.kpiGrid}>
          <ReportKpi label="Total Orders" value={summary.total_orders} />
          <ReportKpi label="Delivered" value={summary.total_delivered} accent="go" />
          <ReportKpi
            label="Failed Delivery"
            value={`${summary.failed_delivery_pct}%`}
            accent={summary.failed_delivery_pct > 30 ? 'nogo' : 'urgent'}
          />
          <ReportKpi
            label="Avg Delivery Time"
            value={summary.avg_delivery_time_minutes > 0
              ? `${summary.avg_delivery_time_minutes} min`
              : '—'}
          />
        </div>
      </div>

      {/* ── Agent performance table ───────────────────────────────────────── */}
      <div className={styles.section}>
        <SectionLabel>Agent Performance · {periodLabel}</SectionLabel>
        <div className={styles.tableCard}>
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {['#', 'Agent', 'Area', 'Orders', 'Delivered', 'Success Rate', 'Score'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agent_performance.map((a, i) => (
                  <tr key={a.agent_id}>
                    <td>{i === 0 ? <span className={styles.rankStar}>★</span> : <span className={styles.rankNum}>{i + 1}</span>}</td>
                    <td className={styles.agentName}>{a.agent_name}</td>
                    <td className={styles.muted}>{a.area}</td>
                    <td>{a.order_count}</td>
                    <td>{a.delivered_count}</td>
                    <td>
                      <span className={
                        a.success_rate >= 0.7 ? styles.rateGo :
                        a.success_rate >= 0.4 ? styles.rateUrgent : styles.rateNogo
                      }>
                        {toPercent(a.success_rate)}
                      </span>
                    </td>
                    <td>
                      <div className={styles.scoreRow}>
                        <div className={styles.scoreBar}>
                          <div className={styles.scoreBarFill} style={{ width: `${Math.round(a.performance_score * 100)}%` }} />
                        </div>
                        <span className={styles.scoreNum}>{Math.round(a.performance_score * 100)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Area chart + Weather daily chart ──────────────────────────────── */}
      <div className={`${styles.section} ${styles.chartsGrid}`}>
        <ChartCard title={`Area Performance — Deliveries vs Failures (${periodLabel})`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={areaChart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke={c.grid} vertical={false} />
              <XAxis dataKey="area" tick={{ fontSize: 11, fill: c.tick }} axisLine={{ stroke: c.grid }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: c.tick }} width={28} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="success" name="Delivered" stackId="a"
                fill={c.go} radius={[0, 0, 0, 0]} maxBarSize={40} />
              <Bar dataKey="failure" name="Failed/Postponed" stackId="a"
                fill={c.nogo} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Weather — Daily Success Rate (${periodLabel})`}>
          {weatherChart.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weatherChart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: c.tick }} axisLine={{ stroke: c.grid }} tickLine={false} />
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
                  type="monotone" dataKey="rate" stroke={c.accent}
                  strokeWidth={2} dot={{ r: 3, fill: c.accent }} activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>
              <p>
                {weatherChart.length === 0
                  ? 'No decision data in selected period.'
                  : 'Only one day of data — select a longer period for trend view.'}
              </p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Weather summary ───────────────────────────────────────────────── */}
      <div className={styles.section}>
        <SectionLabel>Weather Impact Summary · {periodLabel}</SectionLabel>
        <div className={styles.kpiGrid}>
          <ReportKpi
            label="Clear Day Success"
            value={toPercent(weather.summary.clear_avg_success)}
            accent="go"
          />
          <ReportKpi
            label="Light Rain Success"
            value={toPercent(weather.summary.light_rain_avg_success)}
            accent="urgent"
          />
          <ReportKpi
            label="Heavy Rain Success"
            value={toPercent(weather.summary.heavy_rain_avg_success)}
            accent="nogo"
          />
          <ReportKpi
            label="Revenue Lost to Weather"
            value={formatINR(weather.summary.estimated_revenue_lost_to_weather_inr)}
            accent={weather.summary.estimated_revenue_lost_to_weather_inr > 0 ? 'nogo' : undefined}
          />
        </div>
      </div>

      {/* ── Cost savings (all-time manager scope) ────────────────────────── */}
      <div className={styles.section}>
        <SectionLabel>Cost Savings · All Time</SectionLabel>
        <div className={styles.kpiGrid5}>
          <ReportKpi
            label="Deliveries Avoided"
            value={savings.metrics.deliveries_avoided}
          />
          <ReportKpi
            label="Fuel Saved"
            value={`${savings.metrics.fuel_saved_litres} L`}
            accent="go"
          />
          <ReportKpi
            label="Total Savings"
            value={formatINR(savings.metrics.total_savings_inr)}
            accent="go"
          />
          <ReportKpi
            label="AI Success Rate"
            value={toPercent(savings.metrics.success_rate_with_ai)}
            accent={savings.metrics.success_rate_with_ai >= 0.73 ? 'go' : 'nogo'}
          />
          <ReportKpi
            label="vs Baseline (73%)"
            value={`${savings.metrics.improvement_pct >= 0 ? '+' : ''}${savings.metrics.improvement_pct}%`}
            accent={savings.metrics.improvement_pct >= 0 ? 'go' : 'nogo'}
          />
        </div>
      </div>
    </>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Reports() {
  const { user, access_token } = useAuth()
  const [period, setPeriod] = useState<Period>('week')

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; data: ReportData }
  >({ status: 'loading' })

  useEffect(() => {
    if (user?.role !== 'manager') return
    let cancelled = false
    setState({ status: 'loading' })

    Promise.all([
      getKPI(access_token!, period),
      getWeatherImpact(access_token!, period),
      getCostSavings(access_token!, 'all'),
    ])
      .then(([kpi, weather, savings]) => {
        if (!cancelled) setState({ status: 'success', data: { kpi, weather, savings } })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: extractMsg(err) })
      })

    return () => { cancelled = true }
  }, [access_token, period, user?.role])

  if (user?.role !== 'manager') {
    return (
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          <div className={styles.roleGate}>
            <p>This page is for managers only.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>

        {/* Header + period selector */}
        <div className={styles.pageHead}>
          <h1>Reports &amp; Analytics</h1>
          <div className={styles.headRight}>
            <div className={styles.periodToggle}>
              {(['week', 'month'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`${styles.periodBtn} ${period === p ? styles.periodBtnSel : ''}`}
                >
                  {p === 'week' ? 'This Week' : 'This Month'}
                </button>
              ))}
            </div>
            {state.status === 'success' && (
              <button
                onClick={() => {
                  const csv = buildCSV(state.data, period)
                  const label = period === 'week' ? '7d' : '30d'
                  downloadCSV(csv, `lastmeter-report-${label}-${new Date().toISOString().slice(0, 10)}.csv`)
                }}
                className={styles.exportBtn}
              >
                ↓ Export CSV
              </button>
            )}
          </div>
        </div>

        {state.status === 'loading' && <ReportsSkeleton />}

        {state.status === 'error' && (
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Failed to load reports</p>
            <p className={styles.errorMsg}>{state.message}</p>
          </div>
        )}

        {state.status === 'success' && (
          <ReportsContent data={state.data} period={period} />
        )}
      </div>
    </div>
  )
}
