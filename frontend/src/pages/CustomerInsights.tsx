import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getCustomerInsights,
  type CustomerInsightResponse,
} from '../api/analytics'

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

function isNoHistory(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'error' in err &&
    (err as { error: unknown }).error === 'NO_HISTORY_FOUND'
  )
}

function toPercent(ratio: number, dp = 1): string {
  return (Math.round(ratio * 1000) / 10).toFixed(dp) + '%'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Risk badge ─────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  low:    'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-600',
  high:   'bg-red-50 text-red-600',
}

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${RISK_COLORS[level] ?? 'bg-slate-100 text-slate-500'}`}>
      {level}
    </span>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────

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

function InsightSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Sk key={i} className="h-24" />)}
      </div>
      <Sk className="h-48" />
    </div>
  )
}

// ── Metric card ────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  accent,
  sub,
}: {
  label:   string
  value:   React.ReactNode
  accent?: string
  sub?:    string
}) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Results panel ──────────────────────────────────────────────────────────────

function InsightPanel({ data }: { data: CustomerInsightResponse }) {
  const { summary, preferred_delivery_time } = data
  const recent_orders = data.recent_orders ?? []

  const srColor =
    summary.success_rate >= 0.7 ? 'text-go' :
    summary.success_rate >= 0.4 ? 'text-urgent' : 'text-nogo'

  return (
    <div className="space-y-4">
      {/* Address display */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">Result for</span>
        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
          {data.address}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Success Rate"
          value={toPercent(summary.success_rate)}
          accent={srColor}
          sub={`${summary.delivered} of ${summary.total_orders} delivered`}
        />
        <MetricCard
          label="Failed Deliveries"
          value={summary.failed}
          accent={summary.failed > 0 ? 'text-nogo' : undefined}
          sub={summary.postponed > 0 ? `${summary.postponed} postponed` : undefined}
        />
        <MetricCard
          label="Preferred Time"
          value={capitalize(preferred_delivery_time)}
        />
        <div className="card">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Risk Level
          </p>
          <div className="mt-2">
            <RiskBadge level={summary.risk_level} />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {summary.total_orders} order{summary.total_orders !== 1 ? 's' : ''} total
          </p>
        </div>
      </div>

      {/* Recent orders */}
      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Recent Orders
            <span className="ml-2 font-normal text-slate-400 normal-case">
              (showing up to 5 most recent)
            </span>
          </p>
        </div>
        {recent_orders.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6 px-4">
            No order records available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Order', 'Date', 'Time Window', 'Status'].map(h => (
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
                {recent_orders.map(o => (
                  <tr key={o.order_number} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {o.order_number}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {fmtDate(o.date)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap capitalize">
                      {o.time_window}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── State types ────────────────────────────────────────────────────────────────

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_found'; address: string }
  | { status: 'error'; message: string }
  | { status: 'success'; data: CustomerInsightResponse }

// ── Main export ────────────────────────────────────────────────────────────────

export function CustomerInsights() {
  const { user, access_token } = useAuth()

  const [query,       setQuery]       = useState('')
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })

  if (user?.role !== 'manager') {
    return (
      <div className="p-6">
        <div className="card">
          <p className="text-sm text-slate-500">This page is for managers only.</p>
        </div>
      </div>
    )
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setSearchState({ status: 'loading' })

    try {
      const data = await getCustomerInsights(access_token!, trimmed)
      setSearchState({ status: 'success', data })
    } catch (err: unknown) {
      if (isNoHistory(err)) {
        setSearchState({ status: 'not_found', address: trimmed })
      } else {
        setSearchState({ status: 'error', message: extractMsg(err) })
      }
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 md:px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-slate-900">Customer Insights</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Search by exact customer address to view delivery history and risk profile.
        </p>
      </div>

      <div className="px-4 md:px-6 pb-8 space-y-4">

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. 99 Test Lane, Adyar, Chennai"
            className="flex-1 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
          />
          <button
            type="submit"
            disabled={searchState.status === 'loading' || !query.trim()}
            className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {searchState.status === 'loading' ? 'Looking up…' : 'Look up'}
          </button>
        </form>

        {/* States */}

        {searchState.status === 'idle' && (
          <div className="card bg-slate-50 border-slate-100">
            <p className="text-sm font-semibold text-slate-600 mb-1">
              Search by customer address
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Enter a customer's delivery address exactly as recorded in the order system
              (e.g. "99 Test Lane, Adyar, Chennai"). The lookup is case-sensitive and
              must match the stored address precisely.
            </p>
          </div>
        )}

        {searchState.status === 'loading' && <InsightSkeleton />}

        {searchState.status === 'not_found' && (
          <div className="card border-amber-200 bg-amber-50">
            <p className="text-sm font-semibold text-amber-700">No history found</p>
            <p className="text-xs text-amber-600 mt-1">
              No order history found for{' '}
              <span className="font-semibold">"{searchState.address}"</span>.
              Check that the address matches the stored format exactly.
            </p>
          </div>
        )}

        {searchState.status === 'error' && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-600">Lookup failed</p>
            <p className="text-xs text-red-500 mt-1">{searchState.message}</p>
          </div>
        )}

        {searchState.status === 'success' && (
          <InsightPanel data={searchState.data} />
        )}

      </div>
    </div>
  )
}
