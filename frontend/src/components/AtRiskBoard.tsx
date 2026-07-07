import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllOrders, type OrderListItem } from '../api/orders'

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
function band(ms: number): { row: string; text: string; label: string } {
  if (ms < 0)            return { row: 'bg-red-100 dark:bg-red-950/40',    text: 'text-red-700 dark:text-red-400',    label: 'OVERDUE' }
  if (ms < 60 * 60_000)  return { row: 'bg-red-50 dark:bg-red-950/20',     text: 'text-red-600 dark:text-red-400',    label: 'CRITICAL' }
  if (ms < 180 * 60_000) return { row: 'bg-amber-50 dark:bg-amber-950/20', text: 'text-amber-600 dark:text-amber-400', label: 'SOON' }
  return { row: 'bg-slate-50 dark:bg-slate-800/40', text: 'text-slate-600 dark:text-slate-400', label: 'ON TRACK' }
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
    return <div className="animate-pulse h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
  }

  const ranked = [...orders]
    .sort((a, b) => msLeft(a.deadline, now) - msLeft(b.deadline, now))
    .slice(0, 6)

  const atRiskCount = orders.filter(o => msLeft(o.deadline, now) < 180 * 60_000).length

  return (
    <div className="card dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          ⏳ Deadline Countdown
        </h2>
        <span className={`text-xs font-bold ${atRiskCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
          {atRiskCount} at risk
        </span>
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No active orders — all clear ✓</p>
      ) : (
        <div className="space-y-1.5">
          {ranked.map(o => {
            const ms = msLeft(o.deadline, now)
            const b = band(ms)
            return (
              <button
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors hover:brightness-95 ${b.row}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{o.order_number}</span>
                    {o.is_urgent && (
                      <span className="text-[9px] font-bold text-red-600 bg-red-100 border border-red-200 px-1 rounded">URGENT</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {o.customer_name} · {o.area} · {o.agent_name ?? 'Unassigned'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${b.text}`}>
                    {ms < 0 ? '−' : ''}{fmtCountdown(ms)}
                  </p>
                  <p className={`text-[9px] font-bold uppercase tracking-wide ${b.text}`}>{b.label}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
