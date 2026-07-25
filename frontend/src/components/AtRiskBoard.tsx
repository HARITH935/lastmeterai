import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllOrders, type OrderListItem } from '../api/orders'
import styles from './AtRiskBoard.module.css'

// ── Time helpers ────────────────────────────────────────────────────────────────

function msLeft(deadline: string, now: number): number {
  return new Date(deadline).getTime() - now
}

function fmtCountdown(ms: number): string {
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const s = Math.floor((abs % 60_000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Urgency band from minutes remaining.
function band(ms: number): { row: string; label: string } {
  if (ms < 0)            return { row: styles.overdue, label: 'OVERDUE' }
  if (ms < 60 * 60_000)  return { row: styles.overdue, label: 'CRITICAL' }
  if (ms < 180 * 60_000) return { row: styles.soon,    label: 'SOON' }
  return { row: styles.ok, label: 'ON TRACK' }
}

// ── Board ───────────────────────────────────────────────────────────────────────

export function AtRiskBoard({ accessToken }: { accessToken: string }) {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderListItem[] | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Load active orders, refresh list every 30s.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      getAllOrders(accessToken, { perPage: 100, sortBy: 'deadline', sortDir: 'asc' })
        .then(res => {
          if (cancelled) return
          const active = res.data.filter(o => o.status === 'pending' || o.status === 'in_transit')
          setOrders(active)
        })
        .catch(() => { if (!cancelled) setOrders([]) })
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [accessToken])

  // Tick the countdown every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!orders) {
    return <div className={styles.skeleton} />
  }

  const ranked = [...orders]
    .sort((a, b) => msLeft(a.deadline, now) - msLeft(b.deadline, now))
    .slice(0, 6)

  const atRiskCount = orders.filter(o => msLeft(o.deadline, now) < 180 * 60_000).length

  return (
    <div className={styles.board}>
      <div className={styles.boardHead}>
        <h2 className={styles.boardTitle}>Deadline Countdown</h2>
        <span className={`${styles.boardCount} ${atRiskCount > 0 ? styles.countRisk : styles.countClear}`}>
          {atRiskCount} at risk
        </span>
      </div>

      {ranked.length === 0 ? (
        <p className={styles.empty}>No active orders — all clear</p>
      ) : (
        <div className={styles.list}>
          {ranked.map(o => {
            const ms = msLeft(o.deadline, now)
            const b = band(ms)
            return (
              <button
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className={`${styles.row} ${b.row}`}
              >
                <div className={styles.rowMain}>
                  <div>
                    <span className={styles.rowId}>{o.order_number}</span>
                    {o.is_urgent && <span className={styles.rowTag}>URGENT</span>}
                  </div>
                  <p className={styles.rowMeta}>
                    {o.customer_name} · {o.area} · {o.agent_name ?? 'Unassigned'}
                  </p>
                </div>
                <div className={styles.rowTime}>
                  <p className={styles.rowCountdown}>
                    {ms < 0 ? '−' : ''}{fmtCountdown(ms)}
                  </p>
                  <p className={styles.rowLabel}>{b.label}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
