import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getKPI, type AgentPerf } from '../api/analytics'
import { getAllOrders, type OrderListItem } from '../api/orders'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period  = 'week' | 'month'
type SortKey = 'performance_score' | 'success_rate' | 'area' | 'agent_name'

type OrderFetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; orders: OrderListItem[] }

// ── Helpers ────────────────────────────────────────────────────────────────────

function toPercent(ratio: number): string {
  return `${(Math.round(ratio * 1000) / 10).toFixed(1)}%`
}

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function AgentsSkeleton() {
  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <Sk key={i} className="h-44" />)}
      </div>
    </div>
  )
}

// ── Status + Risk badges ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-slate-100 text-slate-600',
  in_transit: 'bg-blue-50 text-blue-600',
  delivered:  'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-600',
  postponed:  'bg-amber-50 text-amber-600',
}

const RISK_COLORS: Record<string, string> = {
  low:    'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-600',
  high:   'bg-red-50 text-red-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-xs text-slate-400">—</span>
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_COLORS[level] ?? 'bg-slate-100 text-slate-500'}`}>
      {level}
    </span>
  )
}

// ── Agent card ─────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  selected,
  onClick,
}: {
  agent: AgentPerf
  selected: boolean
  onClick: () => void
}) {
  const successColor =
    agent.success_rate >= 0.7 ? 'text-go' :
    agent.success_rate >= 0.4 ? 'text-urgent' : 'text-nogo'

  return (
    <button
      onClick={onClick}
      className={`card text-left w-full transition-all ${
        selected
          ? 'ring-2 ring-blue-500 shadow-md'
          : 'hover:shadow-md hover:border-slate-300'
      }`}
    >
      {/* Name + area */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{agent.agent_name}</p>
          <span className="inline-block mt-0.5 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            {agent.area}
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400">Score</p>
          <p className="text-lg font-bold text-slate-800">
            {Math.round(agent.performance_score * 100)}
          </p>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Orders</p>
          <p className="text-sm font-bold text-slate-700">{agent.order_count}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Delivered</p>
          <p className="text-sm font-bold text-slate-700">{agent.delivered_count}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Success</p>
          <p className={`text-sm font-bold ${successColor}`}>{toPercent(agent.success_rate)}</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(agent.performance_score * 100)}%`,
              backgroundColor: '#2563EB',
            }}
          />
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">
          {Math.round(agent.performance_score * 100)} / 100
        </span>
      </div>

      {/* Click hint */}
      <p className="text-[10px] text-slate-400 mt-2 text-right">
        {selected ? 'Click to hide orders' : 'Click to view orders'}
      </p>
    </button>
  )
}

// ── Agent order detail panel ───────────────────────────────────────────────────

function AgentOrderDetail({ agent, state }: { agent: AgentPerf; state: OrderFetchState }) {
  if (state.status === 'idle') return null

  if (state.status === 'loading') {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-10" />)}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-xs font-semibold text-red-600">Failed to load orders</p>
        <p className="text-xs text-red-500 mt-0.5">{state.message}</p>
      </div>
    )
  }

  const { orders } = state

  if (orders.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-4">
        No orders assigned to {agent.agent_name} in this period.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {['Order', 'Customer', 'Status', 'Deadline', 'Risk', 'Amount'].map(h => (
              <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className="border-b border-slate-50 last:border-0">
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{o.order_number}</td>
              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{o.customer_name}</td>
              <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
              <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{fmtDate(o.deadline)}</td>
              <td className="px-3 py-2"><RiskBadge level={o.risk_level} /></td>
              <td className="px-3 py-2 text-slate-700 text-xs">₹{o.payment_amount.toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Agents() {
  const { user, access_token } = useAuth()

  const [period, setPeriod]               = useState<Period>('week')
  const [sortKey, setSortKey]             = useState<SortKey>('performance_score')
  const [selectedAgent, setSelectedAgent] = useState<AgentPerf | null>(null)

  const [kpiState, setKpiState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; agents: AgentPerf[] }
  >({ status: 'loading' })

  const [orderState, setOrderState] = useState<OrderFetchState>({ status: 'idle' })

  // Fetch KPI when period changes
  useEffect(() => {
    if (user?.role !== 'manager') return
    let cancelled = false
    setKpiState({ status: 'loading' })
    setSelectedAgent(null)

    getKPI(access_token!, period)
      .then(kpi => {
        if (!cancelled) setKpiState({ status: 'success', agents: kpi.agent_performance })
      })
      .catch((err: unknown) => {
        if (!cancelled) setKpiState({ status: 'error', message: extractMsg(err) })
      })

    return () => { cancelled = true }
  }, [access_token, period, user?.role])

  // Fetch orders when selected agent changes
  useEffect(() => {
    if (!selectedAgent) {
      setOrderState({ status: 'idle' })
      return
    }
    let cancelled = false
    setOrderState({ status: 'loading' })

    getAllOrders(access_token!, { agentId: selectedAgent.agent_id, perPage: 50 })
      .then(res => {
        if (!cancelled) setOrderState({ status: 'success', orders: res.data })
      })
      .catch((err: unknown) => {
        if (!cancelled) setOrderState({ status: 'error', message: extractMsg(err) })
      })

    return () => { cancelled = true }
  }, [access_token, selectedAgent])

  if (user?.role !== 'manager') {
    return (
      <div className="p-6">
        <div className="card">
          <p className="text-sm text-slate-500">This page is for managers only.</p>
        </div>
      </div>
    )
  }

  // Client-side sort of the 5-agent array
  const sortedAgents =
    kpiState.status === 'success'
      ? [...kpiState.agents].sort((a, b) => {
          switch (sortKey) {
            case 'performance_score': return b.performance_score - a.performance_score
            case 'success_rate':      return b.success_rate - a.success_rate
            case 'area':              return a.area.localeCompare(b.area)
            case 'agent_name':        return a.agent_name.localeCompare(b.agent_name)
            default:                  return 0
          }
        })
      : []

  return (
    <div>
      {/* Header + controls */}
      <div className="px-4 md:px-6 pt-6 pb-4 flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl font-bold text-slate-900">Agent Management</h1>
        <div className="flex flex-wrap gap-2">
          {/* Period toggle */}
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
          {/* Sort dropdown */}
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="performance_score">Sort: Score</option>
            <option value="success_rate">Sort: Success Rate</option>
            <option value="area">Sort: Area</option>
            <option value="agent_name">Sort: Name</option>
          </select>
        </div>
      </div>

      {kpiState.status === 'loading' && <AgentsSkeleton />}

      {kpiState.status === 'error' && (
        <div className="p-6">
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-600">Failed to load agents</p>
            <p className="text-xs text-red-500 mt-1">{kpiState.message}</p>
          </div>
        </div>
      )}

      {kpiState.status === 'success' && (
        <div className="p-4 md:p-6 space-y-4">
          {/* Agent card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedAgents.map(agent => (
              <AgentCard
                key={agent.agent_id}
                agent={agent}
                selected={selectedAgent?.agent_id === agent.agent_id}
                onClick={() =>
                  setSelectedAgent(
                    selectedAgent?.agent_id === agent.agent_id ? null : agent,
                  )
                }
              />
            ))}
          </div>

          {/* Detail panel — only shown when an agent is selected */}
          {selectedAgent && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {selectedAgent.agent_name}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      · {selectedAgent.area}
                    </span>
                  </p>
                  {orderState.status === 'success' && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {orderState.orders.length} order
                      {orderState.orders.length !== 1 ? 's' : ''} total
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                >
                  Close ×
                </button>
              </div>
              <AgentOrderDetail agent={selectedAgent} state={orderState} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
