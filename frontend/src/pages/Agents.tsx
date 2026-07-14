import { Fragment, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getKPI, getLeaderboard, type AgentPerf, type LeaderboardAgent } from '../api/analytics'
import { getAllOrders, type OrderListItem } from '../api/orders'
import { createAgentAccount, listAgentAccounts, setAgentActive, type AgentAccount } from '../api/agents'
import { VALID_AREAS } from '../api/analytics'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period  = 'week' | 'month'
type SortKey = 'performance_score' | 'success_rate' | 'area' | 'agent_name'
type View    = 'cards' | 'leaderboard' | 'accounts'

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

// ── Leaderboard row ────────────────────────────────────────────────────────────

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function LeaderboardRow({ agent }: { agent: LeaderboardAgent }) {
  const medal = MEDALS[agent.rank]
  const srColor =
    agent.success_rate >= 0.7 ? 'text-go' :
    agent.success_rate >= 0.4 ? 'text-urgent' : 'text-nogo'

  return (
    <tr className={`border-b border-slate-50 last:border-0 ${agent.rank <= 3 ? 'bg-amber-50/30' : ''}`}>
      <td className="px-4 py-3 text-center w-10">
        {medal
          ? <span className="text-lg">{medal}</span>
          : <span className="text-sm font-bold text-slate-400">#{agent.rank}</span>
        }
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-800 text-sm">{agent.agent_name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {agent.area && (
            <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">{agent.area}</span>
          )}
          {agent.avg_rating != null && (
            <span className="text-xs font-semibold text-amber-500" title={`${agent.rating_count} rating${agent.rating_count !== 1 ? 's' : ''}`}>
              ★ {agent.avg_rating.toFixed(1)}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <p className="text-sm font-bold text-slate-700">{agent.order_count}</p>
        <p className="text-[10px] text-slate-400">{agent.delivered_count} delivered</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round(agent.success_rate * 100)}%`, backgroundColor: agent.success_rate >= 0.7 ? '#10B981' : agent.success_rate >= 0.4 ? '#F59E0B' : '#EF4444' }}
            />
          </div>
          <span className={`text-xs font-bold ${srColor} w-10 text-right shrink-0`}>
            {toPercent(agent.success_rate)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="text-sm font-bold text-slate-800">₹{agent.earnings_inr.toLocaleString('en-IN')}</p>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-bold text-blue-600">{Math.round(agent.performance_score * 100)}</span>
      </td>
    </tr>
  )
}

function Leaderboard({ period, accessToken }: { period: Period; accessToken: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; agents: LeaderboardAgent[] }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getLeaderboard(accessToken, period)
      .then(res => { if (!cancelled) setState({ status: 'success', agents: res.agents }) })
      .catch((err: unknown) => { if (!cancelled) setState({ status: 'error', message: extractMsg(err) }) })
    return () => { cancelled = true }
  }, [accessToken, period])

  if (state.status === 'loading') return <AgentsSkeleton />
  if (state.status === 'error') return (
    <div className="p-6"><div className="card border-red-200 bg-red-50">
      <p className="text-sm font-semibold text-red-600">{state.message}</p>
    </div></div>
  )

  const { agents } = state
  const top = agents[0]

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Top performer highlight */}
      {top && (
        <div className="card bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🏆</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-0.5">Top Performer · {period === 'week' ? 'This Week' : 'This Month'}</p>
              <p className="text-lg font-bold text-slate-900">{top.agent_name}</p>
              <p className="text-sm text-slate-500">{top.area} · {toPercent(top.success_rate)} success · ₹{top.earnings_inr.toLocaleString('en-IN')} earned</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-black text-blue-600">{Math.round(top.performance_score * 100)}</p>
              <p className="text-[10px] text-slate-400">score</p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 w-10">#</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Agent</th>
              <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Orders</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 min-w-[140px]">Success Rate</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Earnings</th>
              <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => <LeaderboardRow key={a.agent_id} agent={a} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Accounts view (full roster — includes zero-order agents; deactivate/reactivate) ──

function AccountsView({ accessToken }: { accessToken: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; agents: AgentAccount[] }
  >({ status: 'loading' })
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null)

  function load() {
    setState({ status: 'loading' })
    listAgentAccounts(accessToken)
      .then(agents => setState({ status: 'success', agents }))
      .catch((err: unknown) => setState({ status: 'error', message: extractMsg(err) }))
  }

  useEffect(() => { load() }, [])

  async function toggle(agent: AgentAccount) {
    setBusyId(agent.id)
    setRowError(null)
    try {
      await setAgentActive(accessToken, agent.id, !agent.is_active)
      load()
    } catch (err) {
      setRowError({ id: agent.id, message: extractMsg(err) })
    } finally {
      setBusyId(null)
    }
  }

  if (state.status === 'loading') return <AgentsSkeleton />
  if (state.status === 'error') {
    return (
      <div className="p-6">
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-600">Failed to load agent accounts</p>
          <p className="text-xs text-red-500 mt-1">{state.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Agent', 'Username', 'Area', 'Phone', 'Status', 'Created', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.agents.map(a => (
                <Fragment key={a.id}>
                  <tr className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{a.name}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-xs">{a.username}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{a.area}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{a.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        a.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {a.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggle(a)}
                        disabled={busyId === a.id}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                          a.is_active
                            ? 'text-red-600 bg-red-50 hover:bg-red-100'
                            : 'text-green-700 bg-green-50 hover:bg-green-100'
                        }`}
                      >
                        {busyId === a.id ? '…' : a.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                  {rowError?.id === a.id && (
                    <tr>
                      <td colSpan={7} className="px-4 pb-3 -mt-2">
                        <p className="text-xs font-semibold text-red-600">{rowError.message}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Deactivating blocks login but preserves the agent's full order/decision history.
        Agents with pending or in-transit orders must be reassigned before deactivating.
      </p>
    </div>
  )
}

// ── Add Agent modal ───────────────────────────────────────────────────────────

function AddAgentModal({
  accessToken,
  onClose,
  onCreated,
}: {
  accessToken: string
  onClose: () => void
  onCreated: (username: string) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [area, setArea]         = useState<string>(VALID_AREAS[0])
  const [phone, setPhone]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createAgentAccount(accessToken, {
        username: username.trim(),
        password,
        name: name.trim(),
        area,
        phone: phone.trim() || undefined,
      })
      onCreated(created.username)
    } catch (err) {
      setError(extractMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Add Agent</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              placeholder="e.g. priya.lakshmi"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Full name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Area</label>
            <select
              value={area}
              onChange={e => setArea(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {VALID_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Phone (optional)</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="10-digit number"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Initial password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">The agent can change this later from their own Settings.</p>
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Creating…' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Agents() {
  const { user, access_token } = useAuth()

  const [view, setView]                   = useState<View>('leaderboard')
  const [period, setPeriod]               = useState<Period>('week')
  const [sortKey, setSortKey]             = useState<SortKey>('performance_score')
  const [selectedAgent, setSelectedAgent] = useState<AgentPerf | null>(null)
  const [showAddAgent, setShowAddAgent]   = useState(false)
  const [addedUsername, setAddedUsername] = useState<string | null>(null)

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
          <button
            onClick={() => setShowAddAgent(true)}
            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            + Add Agent
          </button>
          {/* View toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(['leaderboard', 'cards', 'accounts'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {v === 'leaderboard' ? '🏆 Leaderboard' : v === 'cards' ? 'Cards' : 'Accounts'}
              </button>
            ))}
          </div>
          {/* Period toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(['week', 'month'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  period === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
          {/* Sort dropdown — only in cards view */}
          {view === 'cards' && (
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
          )}
        </div>
      </div>

      {/* Add-agent success confirmation */}
      {addedUsername && (
        <div className="mx-4 md:mx-6 mb-4 card border-green-200 bg-green-50 flex items-center justify-between">
          <p className="text-sm font-semibold text-green-700">
            ✓ Agent "{addedUsername}" created — they can log in now. They'll appear on the
            Leaderboard/Cards views once they have order activity; this Accounts tab shows them right away.
          </p>
          <button onClick={() => setAddedUsername(null)} className="text-green-600 hover:text-green-800 text-lg leading-none">✕</button>
        </div>
      )}

      {showAddAgent && (
        <AddAgentModal
          accessToken={access_token!}
          onClose={() => setShowAddAgent(false)}
          onCreated={(username) => {
            setShowAddAgent(false)
            setAddedUsername(username)
            setView('accounts')
          }}
        />
      )}

      {/* Leaderboard view */}
      {view === 'leaderboard' && (
        <Leaderboard period={period} accessToken={access_token!} />
      )}

      {/* Accounts view — full roster, deactivate/reactivate */}
      {view === 'accounts' && (
        <AccountsView accessToken={access_token!} />
      )}

      {/* Cards view */}
      {view === 'cards' && (
        <>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedAgents.map(agent => (
                  <AgentCard
                    key={agent.agent_id}
                    agent={agent}
                    selected={selectedAgent?.agent_id === agent.agent_id}
                    onClick={() =>
                      setSelectedAgent(selectedAgent?.agent_id === agent.agent_id ? null : agent)
                    }
                  />
                ))}
              </div>

              {selectedAgent && (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        {selectedAgent.agent_name}
                        <span className="ml-2 text-xs font-normal text-slate-400">· {selectedAgent.area}</span>
                      </p>
                      {orderState.status === 'success' && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {orderState.orders.length} order{orderState.orders.length !== 1 ? 's' : ''} total
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
        </>
      )}
    </div>
  )
}
