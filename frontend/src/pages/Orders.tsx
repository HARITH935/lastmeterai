import { Fragment, useEffect, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getAllOrders, getAgentOrders, updateOrderStatus,
  type OrderListItem, type OrderListResponse,
} from '../api/orders'

// ── Constants ──────────────────────────────────────────────────────────────────

const AREAS      = ['Anna Nagar', 'T Nagar', 'Velachery', 'Adyar', 'Porur']
const STATUSES   = ['pending', 'in_transit', 'delivered', 'failed', 'postponed']
const RISK_LEVELS = ['low', 'medium', 'high']

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-amber-50 text-amber-700',
  in_transit: 'bg-blue-50 text-blue-700',
  delivered:  'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-700',
  postponed:  'bg-slate-100 text-slate-600',
}

const RISK_BADGE: Record<string, string> = {
  low:    'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  high:   'bg-red-50 text-red-700',
}

// Mirrors backend _AGENT_TRANSITIONS
const AGENT_TRANSITIONS: Record<string, ('delivered' | 'failed' | 'postponed')[]> = {
  pending:    ['postponed'],
  in_transit: ['delivered', 'failed', 'postponed'],
  postponed:  [],
  delivered:  [],
  failed:     [],
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtWindow(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1)
}

function extractMsg(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return fallback
}

// ── Shared UI atoms ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return <span className="text-slate-300 text-xs">—</span>
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_BADGE[risk] ?? 'bg-slate-100 text-slate-600'}`}>
      {risk}
    </span>
  )
}

function FilterSelect({
  value, onChange, children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
    >
      {children}
    </select>
  )
}

function PageSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="animate-pulse bg-slate-200 rounded-xl h-10 w-48" />
      <div className="animate-pulse bg-slate-200 rounded-xl h-12" />
      <div className="animate-pulse bg-slate-200 rounded-xl h-72" />
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm font-semibold text-red-600">Failed to load orders</p>
        <p className="text-xs text-red-500 mt-1">{message}</p>
      </div>
    </div>
  )
}

// ── MANAGER ORDERS ─────────────────────────────────────────────────────────────

type SortBy = 'created_at' | 'deadline' | 'risk_score' | 'payment_amount'

function ManagerOrders({ accessToken }: { accessToken: string }) {
  // Filter state
  const [searchInput, setSearchInput] = useState('')
  const [search,      setSearch]      = useState('')
  const [area,        setArea]        = useState('')
  const [status,      setStatus]      = useState('')
  const [riskLevel,   setRiskLevel]   = useState('')
  const [sortBy,      setSortBy]      = useState<SortBy>('created_at')
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [page,        setPage]        = useState(1)

  // Data state
  const [dataState, setDataState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; result: OrderListResponse }
  >({ status: 'loading' })

  // Expanded row for inline detail view
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setDataState({ status: 'loading' })

    getAllOrders(accessToken, {
      search:    search || undefined,
      area:      area || undefined,
      status:    status || undefined,
      riskLevel: riskLevel || undefined,
      sortBy, sortDir, page,
      perPage: 20,
    })
      .then(result => { if (!cancelled) setDataState({ status: 'success', result }) })
      .catch((err: unknown) => {
        if (!cancelled) setDataState({ status: 'error', message: extractMsg(err, 'Unable to load orders.') })
      })

    return () => { cancelled = true }
  }, [accessToken, search, area, status, riskLevel, sortBy, sortDir, page])

  function commitSearch() {
    setSearch(searchInput.trim())
    setPage(1)
  }

  function handleSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitSearch()
  }

  function changeFilter(setter: (v: string) => void, v: string) {
    setter(v)
    setPage(1)
  }

  function toggleSort(field: SortBy) {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  function sortIcon(field: SortBy) {
    if (sortBy !== field) return null
    return <span className="ml-1 text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (dataState.status === 'loading') return <PageSkeleton />
  if (dataState.status === 'error')   return <ErrorCard message={dataState.message} />

  const { data, pagination } = dataState.result

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-bold text-slate-900">
        All Orders
        <span className="ml-2 text-sm font-normal text-slate-400">({pagination.total})</span>
      </h1>

      {/* Filter bar */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Order # or customer…"
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-40 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          <button
            onClick={commitSearch}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            Search
          </button>
        </div>

        <FilterSelect value={area} onChange={v => changeFilter(setArea, v)}>
          <option value="">All Areas</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </FilterSelect>

        <FilterSelect value={status} onChange={v => changeFilter(setStatus, v)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </FilterSelect>

        <FilterSelect value={riskLevel} onChange={v => changeFilter(setRiskLevel, v)}>
          <option value="">All Risk Levels</option>
          {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
        </FilterSelect>

        {(search || area || status || riskLevel) && (
          <button
            onClick={() => {
              setSearchInput(''); setSearch(''); setArea('')
              setStatus(''); setRiskLevel(''); setPage(1)
            }}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Mobile card list (< md) */}
      <div className="md:hidden space-y-3">
        {data.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-sm text-slate-400">No orders match the current filters.</p>
          </div>
        ) : data.map(order => (
          <Fragment key={`m-${order.id}`} >
            <div className="card p-0 overflow-hidden">
              <div
                onClick={() => setExpandedId(id => id === order.id ? null : order.id)}
                className="p-4 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800">{order.order_number}</span>
                      {order.is_urgent && (
                        <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1 rounded">URGENT</span>
                      )}
                      <StatusBadge status={order.status} />
                      <RiskBadge risk={order.risk_level} />
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5 truncate">{order.customer_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {order.area} · {order.agent_name ?? 'Unassigned'} · {fmtWindow(order.time_window)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Deadline: {fmtDate(order.deadline)}</p>
                  </div>
                  <span className="text-slate-300 text-xs shrink-0 pt-1">
                    {expandedId === order.id ? '▲' : '▼'}
                  </span>
                </div>
              </div>
              {expandedId === order.id && (
                <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Address</p>
                      <p className="text-slate-700">{order.customer_address}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Phone</p>
                      <p className="text-slate-700">{order.customer_phone ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Package</p>
                      <p className="text-slate-700">{fmtWindow(order.package_size)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Payment</p>
                      <p className="text-slate-700">₹{order.payment_amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Decision</p>
                      <p className="text-slate-700">{order.decision ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Risk Score</p>
                      <p className="text-slate-700">{order.risk_score ?? '—'}</p>
                    </div>
                    {order.failure_reason && (
                      <div className="col-span-2">
                        <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Failure Reason</p>
                        <p className="text-red-600">{order.failure_reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Fragment>
        ))}
      </div>

      {/* Desktop table (≥ md) */}
      <div className="card overflow-hidden p-0 hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Order #</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Customer</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Area</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Agent</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                <th
                  className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                  onClick={() => toggleSort('risk_score')}
                >
                  Risk {sortIcon('risk_score')}
                </th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Window</th>
                <th
                  className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                  onClick={() => toggleSort('deadline')}
                >
                  Deadline {sortIcon('deadline')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-slate-400 py-12">
                    No orders match the current filters.
                  </td>
                </tr>
              ) : data.map(order => (
                <Fragment key={order.id}>
                  {/* Main row */}
                  <tr
                    onClick={() => setExpandedId(id => id === order.id ? null : order.id)}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{order.order_number}</span>
                      {order.is_urgent && (
                        <span className="ml-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1 rounded">
                          URGENT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[150px] truncate">{order.customer_name}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{order.area}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{order.agent_name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3"><RiskBadge risk={order.risk_level} /></td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtWindow(order.time_window)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(order.deadline)}</td>
                  </tr>

                  {/* Expanded inline detail */}
                  {expandedId === order.id && (
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Address</p>
                            <p className="text-slate-700">{order.customer_address}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Phone</p>
                            <p className="text-slate-700">{order.customer_phone ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Package</p>
                            <p className="text-slate-700">{fmtWindow(order.package_size)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Payment</p>
                            <p className="text-slate-700">₹{order.payment_amount.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Decision</p>
                            <p className="text-slate-700">{order.decision ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Risk Score</p>
                            <p className="text-slate-700">{order.risk_score ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Created</p>
                            <p className="text-slate-700">{fmtDate(order.created_at)}</p>
                          </div>
                          {order.failure_reason && (
                            <div className="col-span-2">
                              <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Failure Reason</p>
                              <p className="text-red-600">{order.failure_reason}</p>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-3 italic">
                          Full SHAP breakdown and decision history available in the Order Detail page (upcoming milestone).
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing {data.length} of {pagination.total} orders
          {pagination.pages > 1 && ` · Page ${pagination.page} of ${pagination.pages}`}
        </span>
        {pagination.pages > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={pagination.page >= pagination.pages}
              className="px-3 py-1.5 font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── AGENT ORDERS ───────────────────────────────────────────────────────────────

function AgentOrders({ accessToken }: { accessToken: string }) {
  const { user } = useAuth()

  // Filter state
  const [status,   setStatus]   = useState('')
  const [dateFrom, setDateFrom] = useState('')

  // Data state — orders held in state so status updates can patch them in place
  const [dataState, setDataState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; orders: OrderListItem[] }
  >({ status: 'loading' })

  // Per-order action panel state
  const [actionId,      setActionId]      = useState<number | null>(null)
  const [actionStatus,  setActionStatus]  = useState<'delivered' | 'failed' | 'postponed' | ''>('')
  const [failureReason, setFailureReason] = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [actionError,   setActionError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDataState({ status: 'loading' })

    getAgentOrders(accessToken, {
      status:   status || undefined,
      dateFrom: dateFrom ? new Date(dateFrom + 'T00:00:00').toISOString() : undefined,
      perPage:  100,
    })
      .then(res => { if (!cancelled) setDataState({ status: 'success', orders: res.data }) })
      .catch((err: unknown) => {
        if (!cancelled) setDataState({ status: 'error', message: extractMsg(err, 'Unable to load orders.') })
      })

    return () => { cancelled = true }
  }, [accessToken, status, dateFrom])

  function openAction(orderId: number) {
    setActionId(orderId)
    setActionStatus('')
    setFailureReason('')
    setActionError(null)
  }

  function closeAction() {
    setActionId(null)
    setActionStatus('')
    setFailureReason('')
    setActionError(null)
  }

  async function submitAction() {
    if (!actionId || !actionStatus) return

    const needsReason = actionStatus === 'failed' || actionStatus === 'postponed'
    if (needsReason && !failureReason.trim()) {
      setActionError('A reason is required for this status.')
      return
    }

    setSubmitting(true)
    setActionError(null)

    try {
      const updated = await updateOrderStatus(accessToken, actionId, {
        status: actionStatus,
        failure_reason: needsReason ? failureReason.trim() : null,
      })

      if (dataState.status === 'success') {
        setDataState({
          status: 'success',
          orders: dataState.orders.map(o =>
            o.id === actionId
              ? { ...o, status: updated.status as OrderListItem['status'], failure_reason: updated.failure_reason }
              : o
          ),
        })
      }
      closeAction()
    } catch (err: unknown) {
      setActionError(extractMsg(err, 'Status update failed. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (dataState.status === 'loading') return <PageSkeleton />
  if (dataState.status === 'error')   return <ErrorCard message={dataState.message} />

  const orders = dataState.orders

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Order History</h1>
        <p className="text-xs text-slate-400 mt-0.5">{user?.area}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <FilterSelect value={status} onChange={v => setStatus(v)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </FilterSelect>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400"
          />
          {dateFrom && (
            <button
              onClick={() => setDateFrom('')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        {orders.length} order{orders.length !== 1 ? 's' : ''}
      </p>

      {orders.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sm text-slate-400">No orders match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const transitions = AGENT_TRANSITIONS[order.status] ?? []
            const isExpanded  = actionId === order.id
            const needsReason = actionStatus === 'failed' || actionStatus === 'postponed'

            return (
              <div key={order.id} className="card p-0 overflow-hidden">
                {/* Main row */}
                <div className="flex items-start justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{order.order_number}</span>
                      {order.is_urgent && (
                        <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded">
                          URGENT
                        </span>
                      )}
                      <StatusBadge status={order.status} />
                      <RiskBadge risk={order.risk_level} />
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{order.customer_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fmtWindow(order.time_window)} · Deadline {fmtDate(order.deadline)}
                    </p>
                    {order.failure_reason && (
                      <p className="text-xs text-red-500 mt-0.5">Reason: {order.failure_reason}</p>
                    )}
                  </div>

                  {transitions.length > 0 && (
                    <button
                      onClick={() => isExpanded ? closeAction() : openAction(order.id)}
                      className="shrink-0 ml-3 text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      {isExpanded ? 'Cancel' : 'Update'}
                    </button>
                  )}
                </div>

                {/* Action panel */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mark as</p>

                    <div className="flex gap-2 flex-wrap">
                      {transitions.map(t => (
                        <button
                          key={t}
                          onClick={() => setActionStatus(t)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                            actionStatus === t
                              ? 'border-blue-500 text-blue-600 bg-blue-50'
                              : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                          }`}
                        >
                          {fmtWindow(t)}
                        </button>
                      ))}
                    </div>

                    {actionStatus && needsReason && (
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          Reason <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={failureReason}
                          onChange={e => setFailureReason(e.target.value)}
                          placeholder={
                            actionStatus === 'failed'
                              ? 'Why did this delivery fail?'
                              : 'Why is this being postponed?'
                          }
                          rows={2}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 resize-none"
                        />
                      </div>
                    )}

                    {actionError && (
                      <p className="text-xs text-red-600">{actionError}</p>
                    )}

                    {actionStatus && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => void submitAction()}
                          disabled={submitting || (needsReason && !failureReason.trim())}
                          className="text-xs font-semibold px-4 py-1.5 text-white rounded-lg disabled:opacity-40 transition-opacity"
                          style={{ backgroundColor: '#2563EB' }}
                        >
                          {submitting ? 'Updating…' : 'Confirm'}
                        </button>
                        <button
                          onClick={closeAction}
                          disabled={submitting}
                          className="text-xs font-semibold px-4 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Orders() {
  const { user, access_token } = useAuth()

  if (user?.role === 'agent') return <AgentOrders accessToken={access_token!} />
  return <ManagerOrders accessToken={access_token!} />
}
