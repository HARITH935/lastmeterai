import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTracking, submitRating, type TrackingInfo } from '../api/orders'
import { TrackMap } from './TrackMap'
import styles from './Track.module.css'

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
    <div className={`${styles.card} ${styles.ratingCard}`}>
      {done ? (
        <>
          <p className={styles.thanksNote}>Thanks for your feedback! 🙏</p>
          <div className={styles.thanksStars}>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} className={`${styles.starStatic} ${n <= rating ? styles.starStaticOn : ''}`}>★</span>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className={styles.ratingTitle}>How was your delivery?</p>
          <div className={styles.stars}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className={`${styles.star} ${n <= (hover || rating) ? styles.starOn : ''}`}
              >★</button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment (optional)…"
            rows={2}
            className={styles.ratingTextarea}
          />
          {error && <p className={styles.ratingError}>{error}</p>}
          <button onClick={send} disabled={rating < 1 || saving} className={styles.ratingSubmit}>
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
  pending:    styles.heroStatusPending,
  in_transit: styles.heroStatusIn_transit,
  delivered:  styles.heroStatusDelivered,
  failed:     styles.heroStatusFailed,
  postponed:  styles.heroStatusPostponed,
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
    <div className={styles.timeline}>
      {order.map((step, i) => {
        const done   = i <= activeIdx
        const isLast = i === order.length - 1
        return (
          <div key={step} className={`${styles.tStep} ${isLast ? styles.tStepLast : ''}`}>
            <div className={styles.tCol}>
              <div className={`${styles.tDot} ${done ? styles.tDotDone : styles.tDotTodo}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`${styles.tLabel} ${done ? styles.tLabelDone : styles.tLabelTodo}`}>
                {STEP_LABEL[step]}
              </span>
            </div>
            {!isLast && (
              <div className={`${styles.tBar} ${i < activeIdx ? styles.tBarDone : styles.tBarTodo}`} />
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
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        {/* Brand header */}
        <div className={styles.brand}>
          <div className={styles.brandMark}>L</div>
          <span className={styles.brandName}>LastMeter AI</span>
        </div>

        {state.status === 'loading' && (
          <div className={styles.col}>
            <div className={styles.skelBlock} style={{ height: 160 }} />
            <div className={styles.skelBlock} style={{ height: 96 }} />
          </div>
        )}

        {state.status === 'error' && (
          <div className={styles.col}>
            <div className={`${styles.card} ${styles.errorCard}`}>
              <p className={styles.errorIcon}>🔍</p>
              <p className={styles.errorTitle}>Tracking unavailable</p>
              <p className={styles.errorMsg}>{state.message}</p>
            </div>
          </div>
        )}

        {state.status === 'success' && (() => {
          const { info } = state
          const accent = STATUS_ACCENT[info.status] ?? styles.heroStatusPending
          const arrival = info.eta
            ? new Date(info.eta.eta_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
            : null
          return (
            <div className={styles.col}>
              {/* Status hero */}
              <div className={styles.card}>
                <p className={styles.heroGreet}>Hi {info.customer_name}, your order</p>
                <p className={styles.heroOrder}>{info.order_number}</p>
                <p className={`${styles.heroStatus} ${accent}`}>{info.status_title}</p>
                <p className={styles.heroMsg}>{info.status_message}</p>

                {info.eta && (
                  <div className={styles.etaPill}>
                    <span className={styles.icon}>⏱</span>
                    <div>
                      <p className={styles.etaBig}>
                        Arriving in {info.eta.eta_low_min}–{info.eta.eta_high_min} min
                      </p>
                      <p className={styles.etaSmall}>
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
              <div className={styles.card}>
                <Timeline info={info} />
              </div>

              {/* Details */}
              <div className={styles.card}>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Delivery area</span>
                  <span className={styles.detailVal}>{info.area}, {info.city}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Time window</span>
                  <span className={styles.detailVal}>{fmtWindow(info.time_window)}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Package</span>
                  <span className={styles.detailVal}>{info.package_size}</span>
                </div>
                {info.agent_name && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Delivery agent</span>
                    <span className={styles.detailVal}>{info.agent_name}</span>
                  </div>
                )}
                {info.is_urgent && (
                  <div className={styles.priorityRow}>
                    <span className={styles.priorityTag}>PRIORITY</span>
                    <span className={styles.priorityNote}>Marked for expedited delivery</span>
                  </div>
                )}
              </div>

              {/* Rating (after delivery) */}
              {info.status === 'delivered' && token && (
                <RatingCard token={token} existing={info.rating} />
              )}

              <p className={styles.footNote}>
                Powered by LastMeter AI · Live delivery intelligence
              </p>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
