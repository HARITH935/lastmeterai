import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getOrder, updateOrderStatus, getReassignSuggestions, reassignOrder, getOrderEta,
  notifyCustomer,
  type OrderDetail, type ReassignSuggestion, type OrderEta, type NotifyResponse,
} from '../api/orders'
import styles from './OrderDetail.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

// ── Badges ─────────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  pending:    styles.pillPending,
  in_transit: styles.pillIn_transit,
  delivered:  styles.pillDelivered,
  failed:     styles.pillFailed,
  postponed:  styles.pillPostponed,
}

const RISK_PILL: Record<string, string> = {
  low:    styles.pillLow,
  medium: styles.pillMedium,
  high:   styles.pillHigh,
}

const DECISION_PILL: Record<string, string> = {
  go:    styles.pillGo,
  no_go: styles.pillNoGo,
}

function Badge({ label, pill }: { label: string; pill: string }) {
  return (
    <span className={`${styles.pill} ${pill}`}>
      {label.replace('_', ' ')}
    </span>
  )
}

// ── SHAP bar ───────────────────────────────────────────────────────────────────

function ShapBar({ factor, contribution }: { factor: string; contribution: number }) {
  const pct = Math.abs(contribution)
  const isNego = contribution > 0
  const label = factor.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className={styles.shapRow}>
      <span className={styles.shapLabel}>{label}</span>
      <div className={styles.shapTrack}>
        <div
          className={isNego ? styles.shapFillUp : styles.shapFillDown}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`${styles.shapVal} ${isNego ? styles.shapValUp : styles.shapValDown}`}>
        {isNego ? '+' : ''}{contribution.toFixed(1)}%
      </span>
    </div>
  )
}

// ── Status update form (agent view) ───────────────────────────────────────────

const STATUS_CHIP_SEL: Record<string, string> = {
  delivered: styles.statusChipSelDelivered,
  failed:    styles.statusChipSelFailed,
  postponed: styles.statusChipSelPostponed,
}

function StatusUpdateForm({
  orderId,
  accessToken,
  onUpdated,
}: {
  orderId: number
  accessToken: string
  onUpdated: () => void
}) {
  const [status, setStatus]   = useState<'delivered' | 'failed' | 'postponed'>('delivered')
  const [reason, setReason]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (status === 'failed' && !reason.trim()) {
      setError('Failure reason is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateOrderStatus(accessToken, orderId, {
        status,
        failure_reason: status === 'failed' ? reason.trim() : null,
      })
      setSuccess(true)
      setTimeout(onUpdated, 800)
    } catch (err) {
      setError(extractMsg(err))
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return <p className={styles.updateSuccess}>Status updated.</p>
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.statusChips}>
        {(['delivered', 'failed', 'postponed'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatus(s); setError(null) }}
            className={`${styles.statusChip} ${status === s ? STATUS_CHIP_SEL[s] : ''}`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {status === 'failed' && (
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError(null) }}
          placeholder="Describe why delivery failed…"
          rows={2}
          className={styles.reasonBox}
        />
      )}

      {error && <p className={styles.updateError}>{error}</p>}

      <button type="submit" disabled={saving} className={styles.updateSubmit}>
        {saving ? 'Saving…' : 'Update Status'}
      </button>
    </form>
  )
}

// ── Reassign panel (manager only, shown when order is failed) ──────────────────

const MEDALS = ['🥇', '🥈', '🥉']

function ReassignPanel({
  orderId,
  accessToken,
  onReassigned,
}: {
  orderId: number
  accessToken: string
  onReassigned: () => void
}) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<ReassignSuggestion[]>([])
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState(false)

  function fetchSuggestions() {
    setOpen(true)
    setLoading(true)
    setError(null)
    getReassignSuggestions(accessToken, orderId)
      .then(res => { setSuggestions(res.suggestions ?? []); setLoading(false) })
      .catch(() => { setError('Could not load suggestions.'); setLoading(false) })
  }

  async function handleReassign(agentId: number, agentName: string) {
    setApplying(agentId)
    setError(null)
    try {
      await reassignOrder(accessToken, orderId, agentId)
      setDone(true)
      setTimeout(onReassigned, 1000)
    } catch {
      setError(`Failed to reassign to ${agentName}.`)
    } finally {
      setApplying(null)
    }
  }

  if (done) {
    return (
      <div className={styles.card}>
        <p className={styles.reassignDone}>✓ Order reassigned successfully</p>
      </div>
    )
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardLabelRow}>
        <p className={styles.cardLabel}>Smart Reassignment</p>
        {!open && (
          <button onClick={fetchSuggestions} className={styles.suggestBtn}>
            🤖 Suggest Agent
          </button>
        )}
      </div>

      {!open && (
        <p className={styles.reassignHint}>
          AI will rank available agents by success rate, area familiarity, and current workload.
        </p>
      )}

      {open && loading && (
        <div className={styles.suggSkeleton}>
          {[1, 2, 3].map(i => <div key={i} className={styles.suggSkelBlock} />)}
        </div>
      )}

      {open && !loading && error && (
        <p className={styles.reassignError}>{error}</p>
      )}

      {open && !loading && suggestions.length > 0 && (
        <div className={styles.suggList}>
          {suggestions.map((s, i) => (
            <div
              key={s.agent_id}
              className={`${styles.suggRow} ${i === 0 ? styles.suggRowTop : ''}`}
            >
              <div className={styles.medal}>{MEDALS[i] ?? '🏅'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className={styles.suggName}>{s.agent_name}</p>
                <p className={styles.suggReason}>{s.reason}</p>
                <div className={styles.suggMetaRow}>
                  <div className={styles.suggBar}>
                    <div className={styles.suggBarFill} style={{ width: `${Math.round(s.success_rate * 100)}%` }} />
                  </div>
                  <span className={styles.suggPct}>{Math.round(s.success_rate * 100)}% success</span>
                  <span className={styles.suggScore}>Score: {Math.round(s.score * 100)}</span>
                </div>
              </div>
              <button
                onClick={() => handleReassign(s.agent_id, s.agent_name)}
                disabled={applying !== null}
                className={styles.assignBtn}
              >
                {applying === s.agent_id ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          ))}
          <button onClick={() => setOpen(false)} className={styles.cancelSuggest}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── ETA prediction card ────────────────────────────────────────────────────────

function EtaCard({ orderId, accessToken }: { orderId: number; accessToken: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'success'; data: OrderEta }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getOrderEta(accessToken, orderId)
      .then(data => { if (!cancelled) setState({ status: 'success', data }) })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [accessToken, orderId])

  if (state.status === 'loading') {
    return <div className={styles.skelBlock} style={{ height: 160 }} />
  }
  if (state.status === 'error') return null

  const { data } = state
  const arrival = new Date(data.eta_time).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
  const confPct = Math.round(data.confidence * 100)
  const confFill = confPct >= 85 ? styles.confFillGood : confPct >= 70 ? styles.confFillMed : styles.confFillLow
  const factors = data.factors ?? []
  const maxMin  = Math.max(...factors.map(f => f.minutes), 1)

  return (
    <div className={styles.card}>
      <div className={styles.cardLabelRow}>
        <p className={styles.cardLabel}>⏱ Predicted ETA</p>
        <span className={styles.aiTag}>AI estimate</span>
      </div>

      {/* Headline */}
      <div className={styles.etaHeadRow}>
        <div>
          <p className={styles.etaBig}>{data.predicted_min}<span>min</span></p>
          <p className={styles.etaWindow}>
            Window {data.eta_low_min}–{data.eta_high_min} min · arrives ~{arrival}
          </p>
        </div>
        <div className={styles.etaDist}>
          <p className={styles.km}>{data.distance_km} km</p>
          <p className={styles.lbl}>from depot</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className={styles.confRow}>
        <span>Confidence</span>
        <span className={styles.confVal}>{confPct}%</span>
      </div>
      <div className={styles.confTrack}>
        <div className={confFill} style={{ width: `${confPct}%` }} />
      </div>

      {/* Factor breakdown */}
      <p className={styles.shapTitle}>Time breakdown</p>
      {factors.map(f => (
        <div key={f.label} className={styles.factorRow}>
          <span className={styles.factorLabel}>{f.label}</span>
          <div className={styles.factorTrack}>
            <div
              className={styles.factorFill}
              style={{ width: `${Math.max((f.minutes / maxMin) * 100, f.minutes > 0 ? 6 : 0)}%` }}
            />
          </div>
          <span className={styles.factorVal}>{f.minutes} min</span>
        </div>
      ))}
      <div className={styles.factorDetail}>
        {factors.map(f => (
          <p key={f.label}><b>{f.label}:</b> {f.detail}</p>
        ))}
      </div>
    </div>
  )
}

// ── Share tracking link (manager) ───────────────────────────────────────────────

function ShareTrackingCard({
  token, orderId, accessToken, hasPhone,
}: {
  token: string
  orderId: number
  accessToken: string
  hasPhone: boolean
}) {
  const [copied, setCopied]   = useState(false)
  const [sending, setSending] = useState<'sms' | 'whatsapp' | null>(null)
  const [result, setResult]   = useState<NotifyResponse | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const link = `${window.location.origin}/track/${token}`

  function copy() {
    navigator.clipboard?.writeText(link).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
      () => {},
    )
  }

  async function notify(channel: 'sms' | 'whatsapp') {
    setSending(channel)
    setError(null)
    setResult(null)
    try {
      const res = await notifyCustomer(accessToken, orderId, channel)
      setResult(res)
    } catch (err) {
      setError(extractMsg(err))
    } finally {
      setSending(null)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.linkTitleRow}>
        <p className={styles.cardLabel}>🔗 Customer Tracking Link</p>
        <a href={link} target="_blank" rel="noopener noreferrer" className={styles.previewLink}>
          Preview ↗
        </a>
      </div>
      <p className={styles.shareDesc}>
        Share this public link — the customer can track status and live ETA without logging in.
      </p>
      <div className={styles.linkRow}>
        <input readOnly value={link} onFocus={e => e.target.select()} className={styles.linkInput} />
        <button onClick={copy} className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Send alert */}
      <div className={styles.notifyDivider}>
        <p className={styles.notifyLabel}>Send delivery alert to customer</p>
        {!hasPhone ? (
          <p className={styles.noPhone}>No phone number on file for this order.</p>
        ) : (
          <div className={styles.notifyBtns}>
            <button onClick={() => notify('sms')} disabled={sending !== null} className={styles.smsBtn}>
              {sending === 'sms' ? 'Sending…' : '💬 Send SMS'}
            </button>
            <button onClick={() => notify('whatsapp')} disabled={sending !== null} className={styles.waBtn}>
              {sending === 'whatsapp' ? 'Sending…' : '🟢 Send WhatsApp'}
            </button>
          </div>
        )}

        {error && <p className={styles.notifyError}>{error}</p>}

        {result && (
          <div className={styles.notifyResult}>
            <p className={styles.ok}>
              ✓ {result.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} {result.simulated ? 'simulated' : 'sent'} to {result.to}
            </p>
            {result.simulated && (
              <p className={styles.demo}>Demo mode — add Twilio keys to send real messages.</p>
            )}
            <p className={styles.quote}>"{result.message}"</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const { user, access_token } = useAuth()
  const navigate = useNavigate()
  const isAgent = user?.role === 'agent'

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; order: OrderDetail }
  >({ status: 'loading' })

  function load() {
    if (!access_token || !id) return
    setState({ status: 'loading' })
    getOrder(access_token, Number(id))
      .then(order => setState({ status: 'success', order }))
      .catch((err: unknown) => setState({ status: 'error', message: extractMsg(err) }))
  }

  useEffect(() => { load() }, [access_token, id])

  if (state.status === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          <div className={styles.skeleton}>
            {[1, 2, 3].map(i => <div key={i} className={styles.skelBlock} />)}
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          <button onClick={() => navigate(-1)} className={styles.backLink}>← Back</button>
          <div className={styles.errorCard}>
            <p className={styles.errorMsg}>{state.message}</p>
          </div>
        </div>
      </div>
    )
  }

  const { order } = state
  const d = order.latest_decision
  const isManager = user?.role === 'manager'

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        {/* Back + header */}
        <div>
          <button onClick={() => navigate(-1)} className={styles.backLink}>← Back</button>
          <div className={styles.headRow}>
            <div>
              <h1>{order.order_number}</h1>
              <p className={styles.headSub}>{order.area} · {order.time_window}</p>
            </div>
            <div className={styles.headBadges}>
              <Badge label={order.status} pill={STATUS_PILL[order.status] ?? styles.pillPostponed} />
              {order.is_urgent && <Badge label="Urgent" pill={styles.pillUrgent} />}
            </div>
          </div>
        </div>

        {/* Customer */}
        <div className={styles.card}>
          <p className={styles.cardLabel} style={{ marginBottom: 10 }}>Customer</p>
          <p className={styles.custName}>{order.customer_name}</p>
          {order.customer_phone && <p className={styles.custLine}>{order.customer_phone}</p>}
          <p className={styles.custLine}>{order.customer_address}</p>
          <div className={styles.custMetaRow}>
            <span>Package: <strong>{order.package_size}</strong></span>
            <span>Residence: <strong>{order.residence_type.replace('_', ' ')}</strong></span>
            <span>Payment: <strong>{fmtINR(order.payment_amount)}</strong></span>
          </div>
          <p className={styles.deadline}>Deadline: {fmtDate(order.deadline)}</p>
        </div>

        {/* Navigate to this order (agent, active orders) */}
        {isAgent && (order.status === 'pending' || order.status === 'in_transit') && (
          <button onClick={() => navigate(`/map?order=${order.id}`)} className={styles.navBtn}>
            🧭 Navigate to this order
          </button>
        )}

        {/* Agent */}
        {order.agent_name && (
          <div className={styles.card}>
            <p className={styles.cardLabel} style={{ marginBottom: 8 }}>Assigned Agent</p>
            <p className={styles.custName}>{order.agent_name}</p>
          </div>
        )}

        {/* AI Decision */}
        {d ? (
          <div className={styles.card}>
            <div className={styles.cardLabelRow}>
              <p className={styles.cardLabel}>AI Decision</p>
              <div className={styles.badgeGroup}>
                <Badge label={d.decision.replace('_', '-')} pill={DECISION_PILL[d.decision] ?? styles.pillPostponed} />
                {d.risk_level && <Badge label={d.risk_level} pill={RISK_PILL[d.risk_level] ?? styles.pillPostponed} />}
              </div>
            </div>

            <div className={styles.riskRow}>
              <div className={styles.riskTrack}>
                <div
                  className={`${styles.riskFill} ${d.risk_score > 50 ? styles.riskFillHigh : styles.riskFillLow}`}
                  style={{ width: `${Math.round(d.risk_score)}%` }}
                />
              </div>
              <span className={styles.riskPct}>{Math.round(d.risk_score)}% risk</span>
            </div>

            {d.explanation && <p className={styles.explain}>{d.explanation}</p>}

            {(d.top_shap_factors?.length ?? 0) > 0 && (
              <>
                <p className={styles.shapTitle}>Risk Factors</p>
                {d.top_shap_factors.map(f => (
                  <ShapBar key={f.factor} factor={f.factor} contribution={f.contribution} />
                ))}
              </>
            )}

            <p className={styles.assessedNote}>
              Assessed {fmtDate(d.created_at)}
              {d.model_version && ` · Model ${d.model_version}`}
            </p>
          </div>
        ) : (
          <div className={styles.card}>
            <p className={styles.noDecision}>No AI decision recorded for this order.</p>
          </div>
        )}

        {/* ETA prediction (active orders only) */}
        {(order.status === 'pending' || order.status === 'in_transit') && (
          <EtaCard orderId={order.id} accessToken={access_token!} />
        )}

        {/* Customer tracking link + alerts (manager only) */}
        {isManager && order.tracking_token && (
          <ShareTrackingCard
            token={order.tracking_token}
            orderId={order.id}
            accessToken={access_token!}
            hasPhone={!!order.customer_phone}
          />
        )}

        {/* Failure / reschedule reason — label depends on status */}
        {order.failure_reason && (
          order.status === 'postponed' ? (
            <div className={`${styles.reasonCard} ${styles.reasonCardPostpone}`}>
              <p className={styles.reasonCardTitle}>Reschedule Reason</p>
              <p className={styles.reasonCardText}>{order.failure_reason}</p>
            </div>
          ) : (
            <div className={`${styles.reasonCard} ${styles.reasonCardFail}`}>
              <p className={styles.reasonCardTitle}>Failure Reason</p>
              <p className={styles.reasonCardText}>{order.failure_reason}</p>
            </div>
          )
        )}

        {/* Status update (agent only, active orders) */}
        {isAgent && (order.status === 'pending' || order.status === 'in_transit') && (
          <div className={styles.card}>
            <p className={styles.cardLabel} style={{ marginBottom: 12 }}>Update Status</p>
            <StatusUpdateForm orderId={order.id} accessToken={access_token!} onUpdated={load} />
          </div>
        )}

        {/* Smart Reassign (manager only) — failed orders, or active orders that
            still need reassigning (e.g. moving work off an agent being
            deactivated). The backend already supports this for any status. */}
        {isManager && (order.status === 'failed' || order.status === 'pending' || order.status === 'in_transit') && (
          <ReassignPanel orderId={order.id} accessToken={access_token!} onReassigned={load} />
        )}

        {/* Timestamps */}
        <div className={styles.timestamps}>
          <p>Created: {fmtDate(order.created_at)}</p>
          <p>Updated: {fmtDate(order.updated_at)}</p>
        </div>
      </div>
    </div>
  )
}
