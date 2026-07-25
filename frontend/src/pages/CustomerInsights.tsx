import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getCustomerInsights,
  type CustomerInsightResponse,
} from '../api/analytics'
import styles from './CustomerInsights.module.css'

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

const RISK_PILL: Record<string, string> = {
  low:    styles.pillLow,
  medium: styles.pillMedium,
  high:   styles.pillHigh,
}

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={`${styles.pill} ${RISK_PILL[level] ?? styles.pillMedium}`}>
      {level}
    </span>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  pending:    styles.stPending,
  in_transit: styles.stIn_transit,
  delivered:  styles.stDelivered,
  failed:     styles.stFailed,
  postponed:  styles.stPostponed,
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${styles.statusPill} ${STATUS_PILL[status] ?? styles.stPostponed}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function InsightSkeleton() {
  return (
    <>
      <div className={styles.skelGrid}>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 96 }} />)}
      </div>
      <div className={styles.skelBlock} style={{ height: 192 }} />
    </>
  )
}

// ── Metric card ────────────────────────────────────────────────────────────────

const ACCENT_CLASS = { go: styles.mGo, nogo: styles.mNogo }

function MetricCard({
  label,
  value,
  accent,
  sub,
}: {
  label:   string
  value:   React.ReactNode
  accent?: 'go' | 'nogo'
  sub?:    string
}) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      <p className={`${styles.metricValue} ${accent ? ACCENT_CLASS[accent] : ''}`}>{value}</p>
      {sub && <p className={styles.metricSub}>{sub}</p>}
    </div>
  )
}

// ── Results panel ──────────────────────────────────────────────────────────────

function InsightPanel({ data }: { data: CustomerInsightResponse }) {
  const { summary, preferred_delivery_time } = data
  const recent_orders = data.recent_orders ?? []

  const srAccent: 'go' | 'nogo' | undefined =
    summary.success_rate >= 0.7 ? 'go' :
    summary.success_rate >= 0.4 ? undefined : 'nogo'

  return (
    <>
      {/* Address display */}
      <div className={styles.addrChip}>
        <span className={styles.addrLabel}>Result for</span>
        <span className={styles.addrVal}>{data.address}</span>
      </div>

      {/* Summary cards */}
      <div className={styles.metricGrid}>
        <MetricCard
          label="Success Rate"
          value={toPercent(summary.success_rate)}
          accent={srAccent}
          sub={`${summary.delivered} of ${summary.total_orders} delivered`}
        />
        <MetricCard
          label="Failed Deliveries"
          value={summary.failed}
          accent={summary.failed > 0 ? 'nogo' : undefined}
          sub={summary.postponed > 0 ? `${summary.postponed} postponed` : undefined}
        />
        <MetricCard
          label="Preferred Time"
          value={capitalize(preferred_delivery_time)}
        />
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Risk Level</p>
          <div>
            <RiskBadge level={summary.risk_level} />
          </div>
          <p className={styles.metricSub}>
            {summary.total_orders} order{summary.total_orders !== 1 ? 's' : ''} total
          </p>
        </div>
      </div>

      {/* Recent orders */}
      <div className={styles.tableCard}>
        <div className={styles.tableHead}>
          <span className={styles.tableHeadTitle}>
            Recent Orders
            <span className={styles.note}>(showing up to 5 most recent)</span>
          </span>
        </div>
        {recent_orders.length === 0 ? (
          <p className={styles.emptyNote}>
            No order records available.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {['Order', 'Date', 'Time Window', 'Status'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent_orders.map(o => (
                  <tr key={o.order_number}>
                    <td className={styles.orderNo}>{o.order_number}</td>
                    <td className={styles.muted}>{fmtDate(o.date)}</td>
                    <td className={styles.muted} style={{ textTransform: 'capitalize' }}>{o.time_window}</td>
                    <td><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
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
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        {/* Header */}
        <div className={styles.pageHead}>
          <h1>Customer Insights</h1>
          <p className={styles.sub}>
            Search by exact customer address to view delivery history and risk profile.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. 99 Test Lane, Adyar, Chennai"
            className={styles.searchInput}
          />
          <button
            type="submit"
            disabled={searchState.status === 'loading' || !query.trim()}
            className={styles.searchBtn}
          >
            {searchState.status === 'loading' ? 'Looking up…' : 'Look up'}
          </button>
        </form>

        {/* States */}

        {searchState.status === 'idle' && (
          <div className={styles.hintCard}>
            <p className={styles.hintTitle}>
              Search by customer address
            </p>
            <p className={styles.hintBody}>
              Enter a customer's delivery address exactly as recorded in the order system
              (e.g. <b>"99 Test Lane, Adyar, Chennai"</b>). The lookup is case-sensitive and
              must match the stored address precisely.
            </p>
          </div>
        )}

        {searchState.status === 'loading' && <InsightSkeleton />}

        {searchState.status === 'not_found' && (
          <div className={`${styles.stateCard} ${styles.stateCardWarn}`}>
            <p className={styles.stateTitleWarn}>No history found</p>
            <p className={styles.stateBodyWarn}>
              No order history found for{' '}
              <b>"{searchState.address}"</b>.
              Check that the address matches the stored format exactly.
            </p>
          </div>
        )}

        {searchState.status === 'error' && (
          <div className={`${styles.stateCard} ${styles.stateCardErr}`}>
            <p className={styles.stateTitleErr}>Lookup failed</p>
            <p className={styles.stateBodyErr}>{searchState.message}</p>
          </div>
        )}

        {searchState.status === 'success' && (
          <InsightPanel data={searchState.data} />
        )}

      </div>
    </div>
  )
}
