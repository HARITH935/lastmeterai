import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getCostSavings, type CostSavingsResponse } from '../api/analytics'
import { getAgentOrders, type OrderListItem } from '../api/orders'
import { MetricCard } from '../components/ui/MetricCard'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'all'

interface PageData {
  savings: CostSavingsResponse
  orders: OrderListItem[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function periodToDateFrom(period: Period): string | undefined {
  if (period === 'all') return undefined
  const d = new Date()
  if (period === 'week')  d.setDate(d.getDate() - 7)
  if (period === 'month') d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function periodLabel(p: Period): string {
  return p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toPercent(ratio: number): string {
  return `${(Math.round(ratio * 1000) / 10).toFixed(1)}%`
}

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

// ── Badges ─────────────────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-xs text-slate-400">—</span>
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
      decision === 'GO'
        ? 'bg-green-50 text-green-700'
        : 'bg-red-50 text-red-600'
    }`}>
      {decision}
    </span>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-slate-100 text-slate-600',
  in_transit: 'bg-blue-50 text-blue-600',
  delivered:  'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-600',
  postponed:  'bg-amber-50 text-amber-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function EarningsSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Sk key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-24" />)}
      </div>
      <Sk className="h-64" />
    </div>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────

function SL({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
      {children}
    </p>
  )
}

function SubNote({ children }: { children: string }) {
  return <p className="text-[11px] text-slate-400 mb-3 -mt-2">{children}</p>
}

// ── Content ────────────────────────────────────────────────────────────────────

function EarningsContent({ data, period }: { data: PageData; period: Period }) {
  const { savings, orders } = data
  const m = savings.metrics
  const label = periodLabel(period)

  // Client-side aggregation: sum payment_amount for delivered orders only.
  // No backend endpoint pre-computes this figure; payment_amount is a
  // simulated field (spec §2.13: "No real payment gateway").
  const deliveredOrders = orders.filter(o => o.status === 'delivered')
  const totalEarned     = deliveredOrders.reduce((s, o) => s + o.payment_amount, 0)
  const avgPerDelivery  = deliveredOrders.length > 0
    ? Math.round(totalEarned / deliveredOrders.length * 100) / 100
    : 0

  // Delivered rows floated to top, then newest-first by created_at.
  const sortedOrders = [...orders].sort((a, b) => {
    if (a.status === 'delivered' && b.status !== 'delivered') return -1
    if (b.status === 'delivered' && a.status !== 'delivered') return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ── Delivery Earnings ──────────────────────────────────────────────── */}
      <div>
        <SL>Delivery Earnings · {label}</SL>
        <SubNote>
          Sum of payment_amount across your delivered orders (simulated — no live payment gateway).
        </SubNote>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            label="Total Earned"
            value={fmtINR(totalEarned)}
            accent={totalEarned > 0 ? 'text-go' : undefined}
          />
          <MetricCard
            label="Orders Delivered"
            value={deliveredOrders.length}
            accent="text-go"
          />
          <MetricCard
            label="Avg per Delivery"
            value={avgPerDelivery > 0 ? fmtINR(avgPerDelivery) : '—'}
          />
        </div>
      </div>

      {/* ── AI Cost Savings ────────────────────────────────────────────────── */}
      <div>
        <SL>AI Cost Savings · {label} · {savings.scope}</SL>
        <SubNote>
          Savings generated by the GO/NO-GO system avoiding low-probability deliveries.
        </SubNote>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="GO Decisions"         value={m.go_count} />
          <MetricCard
            label="Trips Avoided"
            value={m.deliveries_avoided}
            accent="text-go"
          />
          <MetricCard
            label="Fuel Saved"
            value={`${m.fuel_saved_litres} L`}
            accent="text-go"
          />
          <MetricCard
            label="Total Savings"
            value={fmtINR(m.total_savings_inr)}
            accent="text-go"
          />
        </div>
      </div>

      {/* ── Performance ────────────────────────────────────────────────────── */}
      <div>
        <SL>Performance · {label}</SL>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            label="Your Success Rate"
            value={toPercent(m.success_rate_with_ai)}
            accent={m.success_rate_with_ai >= m.baseline_success_rate ? 'text-go' : 'text-nogo'}
          />
          <MetricCard
            label="Area Baseline"
            value={toPercent(m.baseline_success_rate)}
          />
          <MetricCard
            label="vs Baseline"
            value={`${m.improvement_pct >= 0 ? '+' : ''}${m.improvement_pct}%`}
            accent={m.improvement_pct >= 0 ? 'text-go' : 'text-nogo'}
          />
        </div>
      </div>

      {/* ── Order / Decision History ───────────────────────────────────────── */}
      <div>
        <SL>Order & Decision History · {label}</SL>
        {orders.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-400 text-center py-4">
              No orders in this period.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Order', 'Customer', 'AI Decision', 'Outcome', 'Deadline', 'Amount'].map(h => (
                      <th
                        key={h}
                        className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedOrders.map(o => (
                    <tr
                      key={o.id}
                      className={`border-b border-slate-50 last:border-0 ${
                        o.status === 'delivered' ? 'bg-green-50/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {o.order_number}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {o.customer_name.length > 18
                          ? o.customer_name.slice(0, 17) + '…'
                          : o.customer_name}
                      </td>
                      <td className="px-4 py-3">
                        <DecisionBadge decision={o.decision} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {fmtDate(o.deadline)}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                        <span className={o.status === 'delivered' ? 'text-go font-semibold' : 'text-slate-700'}>
                          ₹{o.payment_amount.toLocaleString('en-IN')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Earnings() {
  const { user, access_token } = useAuth()
  const [period, setPeriod] = useState<Period>('week')

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; data: PageData }
  >({ status: 'loading' })

  useEffect(() => {
    if (user?.role !== 'agent') return
    let cancelled = false
    setState({ status: 'loading' })

    const dateFrom = periodToDateFrom(period)

    Promise.all([
      getCostSavings(access_token!, period),
      getAgentOrders(access_token!, { dateFrom, perPage: 100 }),
    ])
      .then(([savings, ordersResp]) => {
        if (!cancelled)
          setState({ status: 'success', data: { savings, orders: ordersResp.data } })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: extractMsg(err) })
      })

    return () => { cancelled = true }
  }, [access_token, period, user?.role])

  if (user?.role !== 'agent') {
    return (
      <div className="p-6">
        <div className="card">
          <p className="text-sm text-slate-500">This page is for agents only.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header + period toggle */}
      <div className="px-4 md:px-6 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Earnings</h1>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(['week', 'month', 'all'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                period === p
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && <EarningsSkeleton />}

      {state.status === 'error' && (
        <div className="p-6">
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-600">Failed to load earnings</p>
            <p className="text-xs text-red-500 mt-1">{state.message}</p>
          </div>
        </div>
      )}

      {state.status === 'success' && (
        <EarningsContent data={state.data} period={period} />
      )}
    </div>
  )
}
