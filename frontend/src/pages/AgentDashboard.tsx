import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getCostSavings, type CostSavingsResponse } from '../api/analytics'
import { getAgentOrders, getOptimizedRoute, type OrderListItem, type OrderListResponse, type OptimizedRoute } from '../api/orders'
import styles from './AgentDashboard.module.css'

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

function AgentSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.section}>
          <div className={styles.kpi} style={{ height: 96 }} />
          <div className={styles.kpiGrid}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.kpi} style={{ height: 70 }} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const STATUS_TOKEN: Record<string, { bg: string; fg: string }> = {
  pending:    { bg: 'var(--urgent-wash)', fg: 'var(--urgent)' },
  in_transit: { bg: 'var(--accent-wash)', fg: 'var(--accent)' },
  delivered:  { bg: 'var(--go-wash)',     fg: 'var(--go)' },
  failed:     { bg: 'var(--nogo-wash)',   fg: 'var(--nogo)' },
  postponed:  { bg: 'var(--surface-2)',   fg: 'var(--ink-dim)' },
}

const RISK_VAR: Record<string, string> = {
  low: 'var(--go)', medium: 'var(--urgent)', high: 'var(--nogo)',
}

function OrderRow({ order }: { order: OrderListItem }) {
  const navigate = useNavigate()
  const token = STATUS_TOKEN[order.status] ?? { bg: 'var(--surface-2)', fg: 'var(--ink-muted)' }
  const deadline = new Date(order.deadline).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

  return (
    <div onClick={() => navigate(`/orders/${order.id}`)} className={styles.orderRow}>
      <div className={styles.orderLeft}>
        <div className={styles.riskDot} style={{ background: RISK_VAR[order.risk_level ?? ''] ?? 'var(--ink-dim)' }} />
        <div className="min-w-0">
          <div>
            <span className={styles.orderId}>{order.order_number}</span>
            {order.is_urgent && <span className={styles.orderUrgentTag}>URGENT</span>}
          </div>
          <p className={styles.orderMeta}>{order.customer_name} · by {deadline}</p>
        </div>
      </div>
      <div className={styles.orderRight}>
        <span className={styles.statusBadge} style={{ background: token.bg, color: token.fg }}>
          {order.status.replace('_', ' ')}
        </span>
        <span className={styles.chevron}>›</span>
      </div>
    </div>
  )
}

// ── Quick link button ──────────────────────────────────────────────────────────

function QuickLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <Link to={to} className={styles.quickLink}>
      <span className={styles.quickIcon}>{icon}</span>
      {label}
    </Link>
  )
}

// ── Next stop card ─────────────────────────────────────────────────────────────

function NextStopCard({ route }: { route: OptimizedRoute | null }) {
  if (!route || route.stops.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.nextStopDone}>
          <span className={styles.nextStopDoneIcon}>✅</span>
          <p className={styles.nextStopDoneTitle}>All deliveries done</p>
          <p className={styles.nextStopDoneSub}>No pending stops in your route</p>
        </div>
      </div>
    )
  }

  const stop = route.stops[0]
  const riskColor = RISK_VAR[stop.risk_level ?? ''] ?? 'var(--ink-dim)'

  return (
    <div className={styles.card}>
      <div className={styles.nextStopHead}>
        <p className={styles.cardLabel}>Next Stop</p>
        <span className={styles.riskPill} style={{ background: riskColor, color: '#fff', opacity: 0.9 }}>
          {stop.risk_level ?? 'unassessed'} risk
        </span>
      </div>
      <p className={styles.nextStopName}>{stop.customer_name}</p>
      <p className={styles.nextStopAddr}>{stop.customer_address}</p>
      <div className={styles.nextStopMeta}>
        <span>🕐 ETA {fmtTime(stop.eta)}</span>
        <span>·</span>
        <span>{stop.distance_from_prev_km} km away</span>
        <span>·</span>
        <span>{stop.duration_from_prev_min} min</span>
      </div>
      {stop.is_urgent && <p className={styles.nextStopUrgent}>⚠ Urgent delivery</p>}
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
    <div className={styles.card}>
      <p className={styles.cardLabel} style={{ marginBottom: 10 }}>AI Performance · This Week</p>
      <div className="flex items-end" style={{ marginBottom: 12 }}>
        <span className={`${styles.aiPct} ${styles.mono}`}>{aiPct}%</span>
        <span className={styles.aiLift} style={{ color: lift >= 0 ? 'var(--go)' : 'var(--nogo)' }}>
          {lift >= 0 ? '+' : ''}{lift}% vs baseline
        </span>
      </div>

      <div className={styles.aiBarRow}>
        <div className={styles.aiBarHead}><span>AI-assisted</span><span>{aiPct}%</span></div>
        <div className={styles.aiBarTrack}><div className={styles.aiBarFill} style={{ width: `${aiPct}%`, background: 'var(--go)' }} /></div>
      </div>
      <div className={styles.aiBarRow}>
        <div className={styles.aiBarHead}><span>Baseline</span><span>{basePct}%</span></div>
        <div className={styles.aiBarTrack}><div className={styles.aiBarFill} style={{ width: `${basePct}%`, background: 'var(--ink-dim)' }} /></div>
      </div>

      <p className={styles.aiSaved}>Saved {formatINR(metrics.total_savings_inr)} this week</p>
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
  const progress  = total > 0 ? Math.round((delivered / total) * 100) : 0

  const earningsToday = allOrders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + o.payment_amount, 0)

  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  })

  const activeOrders = allOrders.filter(o => o.status === 'pending' || o.status === 'in_transit')
  const doneOrders   = allOrders.filter(o => o.status !== 'pending' && o.status !== 'in_transit')

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>

        {/* ── Welcome banner ── */}
        <div className={styles.banner}>
          <span className={`${styles.corner} ${styles.cornerTl}`} /><span className={`${styles.corner} ${styles.cornerTr}`} />
          <span className={`${styles.corner} ${styles.cornerBl}`} /><span className={`${styles.corner} ${styles.cornerBr}`} />
          <p className={styles.bannerGreet}>{greeting()},</p>
          <h1 className={styles.bannerName}>{user?.name}</h1>
          <p className={styles.bannerMeta}>{user?.area?.toUpperCase()} AREA · {todayStr.toUpperCase()}</p>
          <p className={styles.bannerStatus}>
            {active > 0
              ? `${active} stop${active !== 1 ? 's' : ''} remaining · ${delivered} delivered today`
              : delivered > 0
                ? `All ${delivered} deliveries done — great work!`
                : 'No orders today'}
          </p>
        </div>

        {/* ── Progress bar ── */}
        <div className={styles.progressRow}>
          <div className={styles.progressHead}>
            <span>Delivery progress</span>
            <strong>{delivered}/{total} ({progress}%)</strong>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className={styles.section}>

          {/* ── Metric tiles ── */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpi}>
              <p className={styles.kpiLabel}>Total</p>
              <p className={`${styles.kpiValue} ${styles.mono}`}>{total}</p>
              <p className={styles.kpiSub}>orders today</p>
            </div>
            <div className={styles.kpi}>
              <p className={styles.kpiLabel}>Delivered</p>
              <p className={`${styles.kpiValue} ${styles.mono} ${delivered > 0 ? styles.go : ''}`}>{delivered}</p>
              <p className={styles.kpiSub}>completed</p>
            </div>
            <div className={styles.kpi}>
              <p className={styles.kpiLabel}>Pending</p>
              <p className={`${styles.kpiValue} ${styles.mono} ${active > 0 ? styles.urgent : ''}`}>{active}</p>
              <p className={styles.kpiSub}>in queue</p>
            </div>
            <div className={styles.kpi}>
              <p className={styles.kpiLabel}>Earnings</p>
              <p className={`${styles.kpiValue} ${styles.mono} ${styles.go}`}>{formatINR(earningsToday)}</p>
              <p className={styles.kpiSub}>today</p>
            </div>
          </div>

          {/* ── Next stop + AI performance ── */}
          <div className={styles.twoCol}>
            <NextStopCard route={route} />
            <AICard savings={savings} />
          </div>

          {/* ── Quick links ── */}
          <div className={styles.quickGrid}>
            <QuickLink to="/map"      label="My Route" icon="🗺️" />
            <QuickLink to="/orders"   label="Orders"   icon="📦" />
            <QuickLink to="/chat"     label="AI Chat"  icon="🤖" />
            <QuickLink to="/earnings" label="Earnings" icon="💰" />
          </div>

          {/* ── Today's order list ── */}
          <div className={styles.card}>
            <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Today's Orders</p>
            <p className={styles.listSub}>Active first, then completed</p>

            {allOrders.length === 0 ? (
              <p className={styles.listEmpty}>No orders assigned today.</p>
            ) : (
              <>
                {activeOrders.map(o => <OrderRow key={o.id} order={o} />)}
                {doneOrders.length > 0 && activeOrders.length > 0 && (
                  <p className={styles.listDivider}>Completed / Skipped</p>
                )}
                {doneOrders.map(o => <OrderRow key={o.id} order={o} />)}
              </>
            )}
          </div>

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
      <div className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.card} style={{ borderColor: 'var(--nogo)' }}>
            <p style={{ color: 'var(--nogo)', fontWeight: 600, fontSize: '0.9rem' }}>Failed to load dashboard</p>
            <p style={{ color: 'var(--nogo)', opacity: 0.85, fontSize: '0.8rem', marginTop: 4 }}>{state.message}</p>
          </div>
        </div>
      </div>
    )
  }

  return <AgentContent orders={state.orders} savings={state.savings} route={state.route} />
}
