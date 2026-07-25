import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getCostSavings, type CostSavingsResponse } from '../api/analytics'
import { getAgentOrders, type OrderListItem } from '../api/orders'
import styles from './Earnings.module.css'

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
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
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
  if (!decision) return <span className={styles.pillNone}>—</span>
  return (
    <span className={`${styles.pill} ${decision === 'GO' ? styles.pillGo : styles.pillNoGo}`}>
      {decision}
    </span>
  )
}

const STATUS_PILL: Record<string, string> = {
  pending:    styles.stPending,
  in_transit: styles.stIn_transit,
  delivered:  styles.stDelivered,
  failed:     styles.stFailed,
  postponed:  styles.stPostponed,
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${styles.pill} ${STATUS_PILL[status] ?? styles.stPostponed}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function EarningsSkeleton() {
  return (
    <>
      <div className={styles.kpiGrid3} style={{ marginBottom: 24 }}>
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 88 }} />)}
      </div>
      <div className={styles.kpiGrid4} style={{ marginBottom: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 88 }} />)}
      </div>
      <div className={styles.kpiGrid3} style={{ marginBottom: 24 }}>
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 88 }} />)}
      </div>
      <div className={styles.skelBlock} style={{ height: 256 }} />
    </>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────

function SL({ children }: { children: string }) {
  return <p className={styles.sectionLabel}>{children}</p>
}

function SubNote({ children }: { children: string }) {
  return <p className={styles.subNote}>{children}</p>
}

// ── KPI tile ───────────────────────────────────────────────────────────────────

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: 'go' | 'nogo' }) {
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={`${styles.kpiValue} ${styles.mono} ${accent ? styles[accent] : ''}`}>{value}</p>
    </div>
  )
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
    <>
      {/* ── Delivery Earnings ──────────────────────────────────────────────── */}
      <div className={styles.section}>
        <SL>{`Delivery Earnings · ${label}`}</SL>
        <SubNote>
          Sum of payment_amount across your delivered orders (simulated — no live payment gateway).
        </SubNote>
        <div className={styles.kpiGrid3}>
          <Kpi
            label="Total Earned"
            value={fmtINR(totalEarned)}
            accent={totalEarned > 0 ? 'go' : undefined}
          />
          <Kpi
            label="Orders Delivered"
            value={deliveredOrders.length}
            accent="go"
          />
          <Kpi
            label="Avg per Delivery"
            value={avgPerDelivery > 0 ? fmtINR(avgPerDelivery) : '—'}
          />
        </div>
      </div>

      {/* ── AI Cost Savings ────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <SL>{`AI Cost Savings · ${label} · ${savings.scope}`}</SL>
        <SubNote>
          Savings generated by the GO/NO-GO system avoiding low-probability deliveries.
        </SubNote>
        <div className={styles.kpiGrid4}>
          <Kpi label="GO Decisions" value={m.go_count} />
          <Kpi
            label="Trips Avoided"
            value={m.deliveries_avoided}
            accent="go"
          />
          <Kpi
            label="Fuel Saved"
            value={`${m.fuel_saved_litres} L`}
            accent="go"
          />
          <Kpi
            label="Total Savings"
            value={fmtINR(m.total_savings_inr)}
            accent="go"
          />
        </div>
      </div>

      {/* ── Performance ────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <SL>{`Performance · ${label}`}</SL>
        <div className={styles.kpiGrid3}>
          <Kpi
            label="Your Success Rate"
            value={toPercent(m.success_rate_with_ai)}
            accent={m.success_rate_with_ai >= m.baseline_success_rate ? 'go' : 'nogo'}
          />
          <Kpi
            label="Area Baseline"
            value={toPercent(m.baseline_success_rate)}
          />
          <Kpi
            label="vs Baseline"
            value={`${m.improvement_pct >= 0 ? '+' : ''}${m.improvement_pct}%`}
            accent={m.improvement_pct >= 0 ? 'go' : 'nogo'}
          />
        </div>
      </div>

      {/* ── Order / Decision History ───────────────────────────────────────── */}
      <div className={styles.section}>
        <SL>{`Order & Decision History · ${label}`}</SL>
        <div style={{ marginTop: 14 }}>
          {orders.length === 0 ? (
            <div className={styles.emptyCard}>
              <p>No orders in this period.</p>
            </div>
          ) : (
            <div className={styles.tableCard}>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {['Order', 'Customer', 'AI Decision', 'Outcome', 'Deadline', 'Amount'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOrders.map(o => (
                      <tr
                        key={o.id}
                        className={o.status === 'delivered' ? styles.delivered : ''}
                      >
                        <td className={styles.orderNo}>
                          {o.order_number}
                        </td>
                        <td>
                          {o.customer_name.length > 18
                            ? o.customer_name.slice(0, 17) + '…'
                            : o.customer_name}
                        </td>
                        <td>
                          <DecisionBadge decision={o.decision} />
                        </td>
                        <td>
                          <StatusBadge status={o.status} />
                        </td>
                        <td className={styles.muted}>
                          {fmtDate(o.deadline)}
                        </td>
                        <td className={o.status === 'delivered' ? styles.amountGo : styles.amount}>
                          ₹{o.payment_amount.toLocaleString('en-IN')}
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
    </>
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
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          <div className={styles.roleGate}>
            <p>This page is for agents only.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        {/* Header + period toggle */}
        <div className={styles.pageHead}>
          <h1>Earnings</h1>
          <div className={styles.periodToggle}>
            {(['week', 'month', 'all'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`${styles.periodBtn} ${period === p ? styles.periodBtnSel : ''}`}
              >
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
              </button>
            ))}
          </div>
        </div>

        {state.status === 'loading' && <EarningsSkeleton />}

        {state.status === 'error' && (
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Failed to load earnings</p>
            <p className={styles.errorMsg}>{state.message}</p>
          </div>
        )}

        {state.status === 'success' && (
          <EarningsContent data={state.data} period={period} />
        )}
      </div>
    </div>
  )
}
