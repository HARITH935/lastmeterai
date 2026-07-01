import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getCostSavings, type CostSavingsResponse } from '../api/analytics'
import { getAgentOrders, type OrderListItem, type OrderListResponse } from '../api/orders'
import { MetricCard } from '../components/ui/MetricCard'

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayLocalMidnight(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function AgentSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}

// ── Order row ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-50 text-amber-700',
  in_transit: 'bg-blue-50 text-blue-700',
  delivered:  'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-700',
  postponed:  'bg-slate-100 text-slate-600',
}

const WINDOW_LABELS: Record<string, string> = {
  morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening',
}

function OrderRow({ order }: { order: OrderListItem }) {
  const colorClass = STATUS_COLORS[order.status] ?? 'bg-slate-100 text-slate-600'
  const windowLabel = WINDOW_LABELS[order.time_window] ?? order.time_window

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{order.order_number}</span>
          {order.is_urgent && (
            <span className="text-xs font-bold text-nogo bg-red-50 border border-nogo/20 px-1.5 rounded leading-tight">
              URGENT
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {order.customer_name} · {windowLabel}
        </p>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-4 shrink-0 ${colorClass}`}>
        {order.status.replace('_', ' ')}
      </span>
    </div>
  )
}

// ── Dashboard content ──────────────────────────────────────────────────────────

interface AgentContentProps {
  orders: OrderListResponse
  savings: CostSavingsResponse
}

function AgentContent({ orders, savings }: AgentContentProps) {
  const { user } = useAuth()
  const allOrders = orders.data

  const countOf = (s: string) => allOrders.filter(o => o.status === s).length
  const total      = orders.pagination.total
  const delivered  = countOf('delivered')
  const pending    = countOf('pending') + countOf('in_transit')
  const failed     = countOf('failed') + countOf('postponed')

  const { metrics } = savings
  const successPct  = Math.round(metrics.success_rate_with_ai * 100)
  const baselinePct = Math.round(metrics.baseline_success_rate * 100)

  const pendingList = allOrders.filter(
    o => o.status === 'pending' || o.status === 'in_transit',
  )

  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <div className="px-4 md:px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-slate-900">{user?.name}'s Dashboard</h1>
        <p className="text-xs text-slate-400 mt-0.5">{user?.area} · Today: {todayStr}</p>
      </div>

      <div className="px-4 md:px-6 pb-8 space-y-6">
      {/* Today's orders */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Today's Orders
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total" value={total} />
          <MetricCard label="Delivered" value={delivered} accent="text-go" />
          <MetricCard
            label="Pending / In Transit"
            value={pending}
            accent={pending > 0 ? 'text-urgent' : undefined}
          />
          <MetricCard
            label="Failed / Postponed"
            value={failed}
            accent={failed > 0 ? 'text-nogo' : undefined}
          />
        </div>
      </div>

      {/* This week's performance */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          This Week · {user?.area}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            label="Success Rate (AI-assisted)"
            value={`${successPct}%`}
            accent={successPct >= baselinePct ? 'text-go' : 'text-nogo'}
          />
          <MetricCard
            label="Estimated Savings"
            value={formatINR(metrics.total_savings_inr)}
            accent="text-go"
          />
        </div>
      </div>

      {/* Pending orders list */}
      <div className="card">
        <p className="text-sm font-semibold text-slate-700 mb-2">
          Pending &amp; In-Transit Orders
        </p>
        {pendingList.length > 0 ? (
          pendingList.map(o => <OrderRow key={o.id} order={o} />)
        ) : (
          <p className="text-sm text-slate-400 py-6 text-center">
            All caught up — no pending orders today.
          </p>
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
    | { status: 'success'; orders: OrderListResponse; savings: CostSavingsResponse }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const today = todayLocalMidnight()

    Promise.all([
      getAgentOrders(access_token!, { dateFrom: today }),
      getCostSavings(access_token!, 'week'),
    ])
      .then(([orders, savings]) => {
        if (!cancelled) setState({ status: 'success', orders, savings })
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

  return <AgentContent orders={state.orders} savings={state.savings} />
}
