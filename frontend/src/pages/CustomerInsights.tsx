import { useEffect, useRef, useState } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  getCustomerInsights,
  searchCustomerAddresses,
  type CustomerInsightResponse,
  type CustomerAddressMatch,
} from '../api/analytics'
import styles from './CustomerInsights.module.css'

// ── Chart palette (matches Analytics.tsx — recharts needs literal colors) ──────

const CHART_COLORS = {
  light: { go: '#10B981', nogo: '#EF4444', muted: '#A39C8C', tooltipBg: '#FFFFFF', tooltipBorder: '#E8E2D3', tooltipText: '#1E2A22' },
  dark:  { go: '#1FA971', nogo: '#E35B52', muted: '#8290A3', tooltipBg: '#16304F', tooltipBorder: 'rgba(243,236,218,0.14)', tooltipText: '#F3ECDA' },
} as const

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

function fmtINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
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

// ── Donut tooltip ──────────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }: {
  active?: boolean
  payload?: { name: string; value: number; payload: { color: string } }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipRow}>
        <span className={styles.tooltipDot} style={{ backgroundColor: p.payload.color }} />
        {p.name}: <span className={styles.tooltipVal}>{p.value}</span>
      </p>
    </div>
  )
}

// ── Outcome donut ──────────────────────────────────────────────────────────────

function OutcomeDonut({ summary }: { summary: CustomerInsightResponse['summary'] }) {
  const { theme } = useTheme()
  const c = CHART_COLORS[theme]

  const data = [
    { name: 'Delivered', value: summary.delivered, color: c.go },
    { name: 'Failed', value: summary.failed, color: c.nogo },
    { name: 'Postponed', value: summary.postponed, color: c.muted },
  ].filter(d => d.value > 0)

  if (data.length === 0) return null

  return (
    <div className={styles.chartCard}>
      <p className={styles.chartTitle}>Delivery Outcome Breakdown</p>
      <p className={styles.chartSub}>{summary.total_orders} order{summary.total_orders !== 1 ? 's' : ''} total</p>
      <div className={styles.donutRow}>
        <div className={styles.donutBox}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2} stroke="none">
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className={styles.legendCol}>
          {data.map(d => (
            <div key={d.name} className={styles.legendItem2}>
              <span className={styles.legendDot} style={{ backgroundColor: d.color }} />
              {d.name}
              <span className={styles.legendVal}>{d.value} ({toPercent(d.value / summary.total_orders, 0)})</span>
            </div>
          ))}
        </div>
      </div>
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
      {/* Customer identity */}
      <div className={styles.addrChip}>
        <span className={styles.custName}>{data.customer_name}</span>
        {data.customer_phone && <span className={styles.custPhone}>{data.customer_phone}</span>}
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
        <MetricCard
          label="Lifetime Value"
          value={fmtINR(summary.total_value_inr)}
          sub={`across ${summary.total_orders} order${summary.total_orders !== 1 ? 's' : ''}`}
        />
        <MetricCard
          label="Avg Rating"
          value={summary.avg_rating != null ? `${summary.avg_rating.toFixed(1)} ★` : '—'}
          sub={summary.rating_count > 0 ? `from ${summary.rating_count} rating${summary.rating_count !== 1 ? 's' : ''}` : 'no ratings yet'}
        />
      </div>

      {/* Outcome donut */}
      <OutcomeDonut summary={summary} />

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
                  {['Order', 'Date', 'Time Window', 'Value', 'Status'].map(h => (
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
                    <td className={styles.muted}>{fmtINR(o.payment_amount)}</td>
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
  | { status: 'multiple'; query: string; matches: CustomerAddressMatch[] }
  | { status: 'error'; message: string }
  | { status: 'success'; data: CustomerInsightResponse }

// ── Main export ────────────────────────────────────────────────────────────────

export function CustomerInsights() {
  const { user, access_token } = useAuth()

  const [query,       setQuery]       = useState('')
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })

  const [suggestions,  setSuggestions]  = useState<CustomerAddressMatch[]>([])
  const [showSuggest,  setShowSuggest]  = useState(false)
  const [activeIdx,    setActiveIdx]    = useState(-1)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const results = await searchCustomerAddresses(access_token!, q)
        setSuggestions(results)
        setActiveIdx(-1)
      } catch {
        setSuggestions([])
      }
    }, 250)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
  }, [query, access_token])

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

  async function lookupExact(address: string) {
    const trimmed = address.trim()
    if (!trimmed) return
    setShowSuggest(false)
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

  // Submitting the search bar (as opposed to picking a dropdown suggestion)
  // may be a partial address or a customer name — resolve it against the
  // same fuzzy search that powers autocomplete, then only fetch the full
  // insight once it's narrowed to exactly one customer.
  async function resolveAndSearch(raw: string) {
    const trimmed = raw.trim()
    if (trimmed.length < 2) {
      setSearchState({ status: 'error', message: 'Enter at least 2 characters to search.' })
      return
    }
    setShowSuggest(false)
    setSearchState({ status: 'loading' })
    try {
      const matches = await searchCustomerAddresses(access_token!, trimmed)
      if (matches.length === 0) {
        setSearchState({ status: 'not_found', address: trimmed })
      } else if (matches.length === 1) {
        await lookupExact(matches[0].address)
      } else {
        setSearchState({ status: 'multiple', query: trimmed, matches })
      }
    } catch (err: unknown) {
      setSearchState({ status: 'error', message: extractMsg(err) })
    }
  }

  function handleSelectSuggestion(s: CustomerAddressMatch) {
    setQuery(s.address)
    void lookupExact(s.address)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggest || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelectSuggestion(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setShowSuggest(false)
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    await resolveAndSearch(query)
  }

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        {/* Header */}
        <div className={styles.pageHead}>
          <h1>Customer Insights</h1>
          <p className={styles.sub}>
            Search by customer address to view delivery history and risk profile.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className={styles.searchForm} autoComplete="off">
          <div className={styles.searchWrap}>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggest(true) }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggest(true) }}
              onBlur={() => window.setTimeout(() => setShowSuggest(false), 120)}
              onKeyDown={handleKeyDown}
              placeholder="Start typing an address or customer name…"
              className={styles.searchInput}
            />
            {showSuggest && suggestions.length > 0 && (
              <div className={styles.suggestList}>
                {suggestions.map((s, i) => (
                  <div
                    key={s.address}
                    className={`${styles.suggestItem} ${i === activeIdx ? styles.suggestItemActive : ''}`}
                    onMouseDown={e => { e.preventDefault(); handleSelectSuggestion(s) }}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <span>
                      <span className={styles.suggestAddr}>{s.address}</span>
                      <span className={styles.suggestName}>{s.customer_name}</span>
                    </span>
                    <span className={styles.suggestMeta}>{s.order_count} order{s.order_count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
              Start typing a customer's delivery address or name — matching addresses
              appear as you type (e.g. <b>"Adyar"</b> or <b>"Main Road"</b>). Pick a
              suggestion or press enter to look up the full delivery history.
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
              Try searching a shorter fragment of the address.
            </p>
          </div>
        )}

        {searchState.status === 'multiple' && (
          <div className={styles.matchCard}>
            <p className={styles.matchTitle}>
              {searchState.matches.length} customers match "{searchState.query}"
            </p>
            <p className={styles.matchSub}>Pick one to view their delivery history.</p>
            <div className={styles.matchList}>
              {searchState.matches.map(m => (
                <div
                  key={m.address}
                  className={styles.suggestItem}
                  onClick={() => { setQuery(m.address); void lookupExact(m.address) }}
                >
                  <span>
                    <span className={styles.suggestAddr}>{m.address}</span>
                    <span className={styles.suggestName}>{m.customer_name}</span>
                  </span>
                  <span className={styles.suggestMeta}>{m.order_count} order{m.order_count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
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
