import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getCostSavings, type CostSavingsResponse } from '../api/analytics'
import { getAgentOrders, getOptimizedRoute, type OrderListItem, type OrderListResponse, type OptimizedRoute } from '../api/orders'

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayLocalMidnight(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function AgentSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-3 w-full" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-50 text-amber-700 border border-amber-200',
  in_transit: 'bg-blue-50 text-blue-700 border border-blue-200',
  delivered:  'bg-green-50 text-green-700 border border-green-200',
  failed:     'bg-red-50 text-red-700 border border-red-200',
  postponed:  'bg-slate-100 text-slate-500 border border-slate-200',
}

const RISK_DOT: Record<string, string> = {
  low:    'bg-go',
  medium: 'bg-urgent',
  high:   'bg-nogo',
}

function OrderRow({ order }: { order: OrderListItem }) {
  const colorClass = STATUS_COLORS[order.status] ?? 'bg-slate-100 text-slate-600'
  const deadline = new Date(order.deadline).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0 gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${RISK_DOT[order.risk_level ?? ''] ?? 'bg-slate-300'}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-800">{order.order_number}</span>
            {order.is_urgent && (
              <span className="text-[10px] font-bold text-nogo bg-red-50 border border-nogo/20 px-1 rounded leading-tight">
                URGENT
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate">{order.customer_name} · by {deadline}</p>
        </div>
      </div>
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${colorClass}`}>
        {order.status.replace('_', ' ')}
      </span>
    </div>
  )
}

// ── Quick link button ──────────────────────────────────────────────────────────

function QuickLink({ to, label, icon, color }: { to: string; label: string; icon: string; color: string }) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border font-medium text-xs transition-colors ${color}`}
    >
      <span className="text-xl">{icon}</span>
      {label}
    </Link>
  )
}

// ── Next stop card ─────────────────────────────────────────────────────────────

function NextStopCard({ route }: { route: OptimizedRoute | null }) {
  if (!route || route.stops.length === 0) {
    return (
      <div className="card flex flex-col justify-center items-center py-6 text-center">
        <span className="text-2xl mb-2">✅</span>
        <p className="text-sm font-semibold text-slate-700">All deliveries done</p>
        <p className="text-xs text-slate-400 mt-1">No pending stops in your route</p>
      </div>
    )
  }

  const stop = route.stops[0]
  const riskBg: Record<string, string> = { low: 'bg-go/10 text-go', medium: 'bg-urgent/10 text-urgent', high: 'bg-nogo/10 text-nogo' }
  const riskClass = riskBg[stop.risk_level ?? ''] ?? 'bg-slate-100 text-slate-500'

  return (
    <div className="card border-l-4 border-l-primary">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Next Stop</p>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${riskClass}`}>
          {stop.risk_level ?? 'unassessed'} risk
        </span>
      </div>
      <p className="text-base font-bold text-slate-900 leading-snug">{stop.customer_name}</p>
      <p className="text-xs text-slate-500 mt-0.5 truncate">{stop.customer_address}</p>
      <div className="flex items-center gap-3 mt-3 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span>🕐</span>
          <span className="font-medium">ETA {fmtTime(stop.eta)}</span>
        </span>
        <span>·</span>
        <span>{stop.distance_from_prev_km} km away</span>
        <span>·</span>
        <span>{stop.duration_from_prev_min} min</span>
      </div>
      {stop.is_urgent && (
        <p className="mt-2 text-xs font-bold text-nogo">⚠ Urgent delivery</p>
      )}
    </div>
  )
}

// ── AI performance card ────────────────────────────────────────────────────────

function AICard({ savings }: { savings: CostSavingsResponse }) {
  const { metrics } = savings
  const aiPct   = Math.round(metrics.success_rate_with_ai    * 100)
  const basePct = Math.round(metrics.baseline_success_rate   * 100)
  const lift    = aiPct - basePct

  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">AI Performance · This Week</p>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-3xl font-bold text-slate-900">{aiPct}%</span>
        <span className={`text-sm font-semibold mb-0.5 ${lift >= 0 ? 'text-go' : 'text-nogo'}`}>
          {lift >= 0 ? '+' : ''}{lift}% vs baseline
        </span>
      </div>

      {/* AI bar */}
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>AI-assisted</span><span>{aiPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-go rounded-full" style={{ width: `${aiPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>Baseline</span><span>{basePct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-400 rounded-full" style={{ width: `${basePct}%` }} />
          </div>
        </div>
      </div>

      <p className="text-xs text-go font-semibold mt-3">
        Saved {formatINR(metrics.total_savings_inr)} this week
      </p>
    </div>
  )
}

// ── Dashboard content ──────────────────────────────────────────────────────────

interface AgentContentProps {
  orders:  OrderListResponse
  savings: CostSavingsResponse
  route:   OptimizedRoute | null
}

function AgentContent({ orders, savings, route }: AgentContentProps) {
  const { user } = useAuth()
  const allOrders = orders.data

  const countOf   = (s: string) => allOrders.filter(o => o.status === s).length
  const total     = orders.pagination.total
  const delivered = countOf('delivered')
  const active    = countOf('pending') + countOf('in_transit')
  const failed    = countOf('failed') + countOf('postponed')
  const progress  = total > 0 ? Math.round((delivered / total) * 100) : 0

  const earningsToday = allOrders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + o.payment_amount, 0)

  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  })

  // Build a sorted display list: active first, then done/failed
  const activeOrders = allOrders.filter(o => o.status === 'pending' || o.status === 'in_transit')
  const doneOrders   = allOrders.filter(o => o.status !== 'pending' && o.status !== 'in_transit')

  return (
    <div className="pb-8">

      {/* ── Welcome banner ── */}
      <div className="mx-4 md:mx-6 mt-5 mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary-light p-5 text-white shadow-md">
        <p className="text-sm font-medium opacity-80">{greeting()},</p>
        <h1 className="text-2xl font-bold mt-0.5">{user?.name}</h1>
        <p className="text-xs opacity-70 mt-1">{user?.area} Area · {todayStr}</p>
        <p className="text-sm font-semibold mt-3 opacity-90">
          {active > 0
            ? `${active} stop${active !== 1 ? 's' : ''} remaining · ${delivered} delivered today`
            : delivered > 0
              ? `All ${delivered} deliveries done — great work!`
              : 'No orders today'}
        </p>
      </div>

      {/* ── Progress bar ── */}
      <div className="px-4 md:px-6 mb-5">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>Delivery progress</span>
          <span className="font-semibold">{delivered}/{total} ({progress}%)</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-go rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="px-4 md:px-6 space-y-4">

        {/* ── Metric cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{total}</p>
            <p className="text-xs text-slate-400 mt-0.5">orders today</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Delivered</p>
            <p className={`text-2xl font-bold mt-1 ${delivered > 0 ? 'text-go' : 'text-slate-900'}`}>{delivered}</p>
            <p className="text-xs text-slate-400 mt-0.5">completed</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Pending</p>
            <p className={`text-2xl font-bold mt-1 ${active > 0 ? 'text-urgent' : 'text-slate-900'}`}>{active}</p>
            <p className="text-xs text-slate-400 mt-0.5">in queue</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Earnings</p>
            <p className="text-2xl font-bold text-go mt-1">{formatINR(earningsToday)}</p>
            <p className="text-xs text-slate-400 mt-0.5">today</p>
          </div>
        </div>

        {/* ── Next stop + AI performance ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NextStopCard route={route} />
          <AICard savings={savings} />
        </div>

        {/* ── Quick links ── */}
        <div className="grid grid-cols-4 gap-2">
          <QuickLink to="/map"      label="My Route"    icon="🗺️"  color="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" />
          <QuickLink to="/orders"   label="Orders"      icon="📦"  color="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" />
          <QuickLink to="/chat"     label="AI Chat"     icon="🤖"  color="bg-green-50 text-green-700 border-green-200 hover:bg-green-100" />
          <QuickLink to="/earnings" label="Earnings"    icon="💰"  color="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" />
        </div>

        {/* ── Today's order list ── */}
        <div className="card">
          <p className="text-sm font-semibold text-slate-700 mb-1">Today's Orders</p>
          <p className="text-xs text-slate-400 mb-3">Active first, then completed</p>

          {allOrders.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No orders assigned today.</p>
          ) : (
            <>
              {activeOrders.map(o => <OrderRow key={o.id} order={o} />)}
              {doneOrders.length > 0 && activeOrders.length > 0 && (
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide pt-3 pb-1">
                  Completed / Skipped
                </p>
              )}
              {doneOrders.map(o => <OrderRow key={o.id} order={o} />)}
            </>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function AgentDashboard() {
  const { access_token } = useAuth()

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; orders: OrderListResponse; savings: CostSavingsResponse; route: OptimizedRoute | null }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const today = todayLocalMidnight()

    Promise.all([
      getAgentOrders(access_token!, { dateFrom: today }),
      getCostSavings(access_token!, 'week'),
      getOptimizedRoute(access_token!).catch(() => null),
    ])
      .then(([orders, savings, route]) => {
        if (!cancelled) setState({ status: 'success', orders, savings, route })
      })
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
  }, [access_token])

  if (state.status === 'loading') return <AgentSkeleton />

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

  return <AgentContent orders={state.orders} savings={state.savings} route={state.route} />
}
