import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTracking, submitRating, type TrackingInfo } from '../api/orders'
import { TrackMap } from './TrackMap'

// ── Rating card (shown after delivery) ──────────────────────────────────────────

function RatingCard({ token, existing }: { token: string; existing: number | null }) {
  const [rating, setRating] = useState(existing ?? 0)
  const [hover, setHover]   = useState(0)
  const [comment, setComment] = useState('')
  const [done, setDone]     = useState(existing != null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function send() {
    if (rating < 1 || saving) return
    setSaving(true); setError(null)
    try {
      await submitRating(token, rating, comment)
      setDone(true)
    } catch {
      setError('Could not submit your rating.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 text-center">
      {done ? (
        <>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Thanks for your feedback! 🙏</p>
          <div className="flex justify-center gap-1 mt-2">
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} className={`text-2xl ${n <= rating ? 'text-amber-400' : 'text-slate-300 dark:text-slate-700'}`}>★</span>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">How was your delivery?</p>
          <div className="flex justify-center gap-1.5 mt-3">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className={`text-3xl transition-transform hover:scale-110 ${
                  n <= (hover || rating) ? 'text-amber-400' : 'text-slate-300 dark:text-slate-700'
                }`}
              >★</button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment (optional)…"
            rows={2}
            className="mt-3 w-full text-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          <button
            onClick={send}
            disabled={rating < 1 || saving}
            className="mt-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Submitting…' : 'Submit Rating'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STEP_LABEL: Record<string, string> = {
  pending:    'Confirmed',
  in_transit: 'Out for delivery',
  delivered:  'Delivered',
}

const STATUS_ACCENT: Record<string, string> = {
  pending:    'text-blue-600',
  in_transit: 'text-indigo-600',
  delivered:  'text-green-600',
  failed:     'text-red-600',
  postponed:  'text-amber-600',
}

function fmtWindow(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1)
}

// ── Progress timeline ──────────────────────────────────────────────────────────

function Timeline({ info }: { info: TrackingInfo }) {
  // Determine current step index. failed/postponed shown as stalled at in_transit.
  const order = info.timeline ?? ['pending', 'in_transit', 'delivered']
  let activeIdx = order.indexOf(info.status)
  if (info.status === 'failed' || info.status === 'postponed') activeIdx = 1

  return (
    <div className="flex items-center">
      {order.map((step, i) => {
        const done   = i <= activeIdx
        const isLast = i === order.length - 1
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  done
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-400 dark:bg-slate-700'
                }`}
              >
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] mt-1.5 font-medium text-center w-16 ${
                done ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'
              }`}>
                {STEP_LABEL[step]}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-1 mx-1 rounded-full mb-5 ${
                i < activeIdx ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function Track() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; info: TrackingInfo }
  >({ status: 'loading' })

  useEffect(() => {
    if (!token) { setState({ status: 'error', message: 'No tracking token provided.' }); return }
    let cancelled = false

    const load = (initial: boolean) => {
      getTracking(token)
        .then(info => { if (!cancelled) setState({ status: 'success', info }) })
        .catch((err: unknown) => {
          if (!initial) return  // keep showing last-known data on a failed poll
          const msg = typeof err === 'object' && err && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'This tracking link is invalid or expired.'
          if (!cancelled) setState({ status: 'error', message: msg })
        })
    }

    load(true)
    // Poll every 5s so the live vehicle + ETA stay current.
    const id = setInterval(() => load(false), 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-8">
      {/* Brand header */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">📦</span>
        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">LastMeter</span>
      </div>

      {state.status === 'loading' && (
        <div className="w-full max-w-md space-y-4">
          <div className="animate-pulse h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          <div className="animate-pulse h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-8 text-center">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tracking unavailable</p>
          <p className="text-xs text-slate-400 mt-1">{state.message}</p>
        </div>
      )}

      {state.status === 'success' && (() => {
        const { info } = state
        const accent = STATUS_ACCENT[info.status] ?? 'text-slate-600'
        const arrival = info.eta
          ? new Date(info.eta.eta_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
          : null
        return (
          <div className="w-full max-w-md space-y-4">
            {/* Status hero */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6">
              <p className="text-xs text-slate-400">Hi {info.customer_name}, your order</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{info.order_number}</p>
              <p className={`text-2xl font-bold mt-3 ${accent}`}>{info.status_title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{info.status_message}</p>

              {info.eta && (
                <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900">
                  <span className="text-xl">⏱</span>
                  <div>
                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                      Arriving in {info.eta.eta_low_min}–{info.eta.eta_high_min} min
                    </p>
                    <p className="text-[11px] text-indigo-500 dark:text-indigo-400">
                      Estimated ~{arrival} · {info.eta.distance_km} km away
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Live driver map (while en route) */}
            {(info.status === 'pending' || info.status === 'in_transit') && info.destination && (
              <TrackMap destination={info.destination} agentLocation={info.agent_location} />
            )}

            {/* Timeline */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6">
              <Timeline info={info} />
            </div>

            {/* Details */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Delivery area</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{info.area}, {info.city}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Time window</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{fmtWindow(info.time_window)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Package</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{info.package_size}</span>
              </div>
              {info.agent_name && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Delivery agent</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{info.agent_name}</span>
                </div>
              )}
              {info.is_urgent && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">PRIORITY</span>
                  <span className="text-xs text-slate-400">Marked for expedited delivery</span>
                </div>
              )}
            </div>

            {/* Rating (after delivery) */}
            {info.status === 'delivered' && token && (
              <RatingCard token={token} existing={info.rating} />
            )}

            <p className="text-center text-[11px] text-slate-400 pt-2">
              Powered by LastMeter AI · Live delivery intelligence
            </p>
          </div>
        )
      })()}
    </div>
  )
}
