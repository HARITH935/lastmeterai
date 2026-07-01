import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import {
  getKPI, getWeatherImpact, getCostSavings,
  type KPIResponse, type WeatherImpactResponse, type CostSavingsResponse,
} from '../api/analytics'
import { MetricCard } from '../components/ui/MetricCard'

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

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function ReportsSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Sk key={i} className="h-24" />)}
      </div>
      <Sk className="h-52" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Sk className="h-64" />
        <Sk className="h-64" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Sk key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <Sk key={i} className="h-24" />)}
      </div>
    </div>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
      {children}
    </p>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <p className="text-sm font-semibold text-slate-700 mb-3">{title}</p>
      {children}
    </div>
  )
}

// ── Report content ─────────────────────────────────────────────────────────────

function ReportsContent({ data, period }: { data: ReportData; period: Period }) {
  const { kpi, weather, savings } = data
  const { summary, agent_performance, area_performance } = kpi

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

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Summary · {periodLabel}</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Orders" value={summary.total_orders} />
          <MetricCard label="Delivered" value={summary.total_delivered} accent="text-go" />
          <MetricCard
            label="Failed Delivery"
            value={`${summary.failed_delivery_pct}%`}
            accent={summary.failed_delivery_pct > 30 ? 'text-nogo' : 'text-urgent'}
          />
          <MetricCard
            label="Avg Delivery Time"
            value={summary.avg_delivery_time_minutes > 0
              ? `${summary.avg_delivery_time_minutes} min`
              : '—'}
          />
        </div>
      </div>

      {/* ── Agent performance table ───────────────────────────────────────── */}
      <div>
        <SectionLabel>Agent Performance · {periodLabel}</SectionLabel>
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#', 'Agent', 'Area', 'Orders', 'Delivered', 'Success Rate', 'Score'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agent_performance.map((a, i) => (
                  <tr key={a.agent_id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {i === 0 ? '★' : i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{a.agent_name}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{a.area}</td>
                    <td className="px-4 py-3 text-slate-700">{a.order_count}</td>
                    <td className="px-4 py-3 text-slate-700">{a.delivered_count}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${
                        a.success_rate >= 0.7 ? 'text-go' :
                        a.success_rate >= 0.4 ? 'text-urgent' : 'text-nogo'
                      }`}>
                        {toPercent(a.success_rate)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round(a.performance_score * 100)}%`,
                              backgroundColor: '#2563EB',
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {Math.round(a.performance_score * 100)}
                        </span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title={`Area Performance — Deliveries vs Failures (${periodLabel})`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={areaChart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="area" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={28} />
              <Tooltip />
              <Bar dataKey="success" name="Delivered" stackId="a"
                fill="#10B981" radius={[0, 0, 0, 0]} maxBarSize={40} />
              <Bar dataKey="failure" name="Failed/Postponed" stackId="a"
                fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Weather — Daily Success Rate (${periodLabel})`}>
          {weatherChart.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weatherChart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  width={40}
                />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Success Rate']} />
                <Line
                  type="monotone" dataKey="rate" stroke="#2563EB"
                  strokeWidth={2} dot={{ r: 3, fill: '#2563EB' }} activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center">
              <p className="text-sm text-slate-400 text-center">
                {weatherChart.length === 0
                  ? 'No decision data in selected period.'
                  : 'Only one day of data — select a longer period for trend view.'}
              </p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Weather summary ───────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Weather Impact Summary · {periodLabel}</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Clear Day Success"
            value={toPercent(weather.summary.clear_avg_success)}
            accent="text-go"
          />
          <MetricCard
            label="Light Rain Success"
            value={toPercent(weather.summary.light_rain_avg_success)}
            accent="text-urgent"
          />
          <MetricCard
            label="Heavy Rain Success"
            value={toPercent(weather.summary.heavy_rain_avg_success)}
            accent="text-nogo"
          />
          <MetricCard
            label="Revenue Lost to Weather"
            value={formatINR(weather.summary.estimated_revenue_lost_to_weather_inr)}
            accent={weather.summary.estimated_revenue_lost_to_weather_inr > 0 ? 'text-nogo' : undefined}
          />
        </div>
      </div>

      {/* ── Cost savings (all-time manager scope) ────────────────────────── */}
      <div>
        <SectionLabel>Cost Savings · All Time</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard
            label="Deliveries Avoided"
            value={savings.metrics.deliveries_avoided}
          />
          <MetricCard
            label="Fuel Saved"
            value={`${savings.metrics.fuel_saved_litres} L`}
            accent="text-go"
          />
          <MetricCard
            label="Total Savings"
            value={formatINR(savings.metrics.total_savings_inr)}
            accent="text-go"
          />
          <MetricCard
            label="AI Success Rate"
            value={toPercent(savings.metrics.success_rate_with_ai)}
            accent={savings.metrics.success_rate_with_ai >= 0.73 ? 'text-go' : 'text-nogo'}
          />
          <MetricCard
            label="vs Baseline (73%)"
            value={`${savings.metrics.improvement_pct >= 0 ? '+' : ''}${savings.metrics.improvement_pct}%`}
            accent={savings.metrics.improvement_pct >= 0 ? 'text-go' : 'text-nogo'}
          />
        </div>
      </div>
    </div>
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
      <div className="p-6">
        <div className="card">
          <p className="text-sm text-slate-500">This page is for managers only.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header + period selector */}
      <div className="px-4 md:px-6 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Reports &amp; Analytics</h1>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(['week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                period === p
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && <ReportsSkeleton />}

      {state.status === 'error' && (
        <div className="p-6">
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-600">Failed to load reports</p>
            <p className="text-xs text-red-500 mt-1">{state.message}</p>
          </div>
        </div>
      )}

      {state.status === 'success' && (
        <ReportsContent data={state.data} period={period} />
      )}
    </div>
  )
}
