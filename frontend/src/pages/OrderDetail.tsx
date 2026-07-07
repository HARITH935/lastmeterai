import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getOrder, updateOrderStatus, getReassignSuggestions, reassignOrder, getOrderEta,
  notifyCustomer,
  type OrderDetail, type ReassignSuggestion, type OrderEta, type NotifyResponse,
} from '../api/orders'

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

const STATUS_STYLES: Record<string, string> = {
  pending:    'bg-slate-100 text-slate-600',
  in_transit: 'bg-blue-50 text-blue-600',
  delivered:  'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-600',
  postponed:  'bg-amber-50 text-amber-600',
}

const RISK_STYLES: Record<string, string> = {
  low:    'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-600',
  high:   'bg-red-50 text-red-600',
}

const DECISION_STYLES: Record<string, string> = {
  go:    'bg-green-50 text-green-700 border border-green-200',
  no_go: 'bg-red-50 text-red-600 border border-red-200',
}

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${style}`}>
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
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-44 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isNego ? 'bg-red-400' : 'bg-green-400'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-semibold w-12 text-right ${isNego ? 'text-red-500' : 'text-green-600'}`}>
        {isNego ? '+' : ''}{contribution.toFixed(1)}%
      </span>
    </div>
  )
}

// ── Status update form (agent view) ───────────────────────────────────────────

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
    return <p className="text-sm font-semibold text-green-600">Status updated.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {(['delivered', 'failed', 'postponed'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatus(s); setError(null) }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors capitalize ${
              status === s
                ? s === 'delivered' ? 'bg-green-600 text-white border-green-600'
                  : s === 'failed' ? 'bg-red-600 text-white border-red-600'
                  : 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
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
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      )}

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
      >
        {saving ? 'Saving…' : 'Update Status'}
      </button>
    </form>
  )
}

// ── Reassign panel (manager only, shown when order is failed) ──────────────────

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
      <div className="card border-green-200 bg-green-50">
        <p className="text-sm font-semibold text-green-700">✓ Order reassigned successfully</p>
      </div>
    )
  }

  return (
    <div className="card dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Smart Reassignment
        </h2>
        {!open && (
          <button
            onClick={fetchSuggestions}
            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            🤖 Suggest Agent
          </button>
        )}
      </div>

      {!open && (
        <p className="text-sm text-slate-500">
          AI will rank available agents by success rate, area familiarity, and current workload.
        </p>
      )}

      {open && loading && (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="animate-pulse h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />)}
        </div>
      )}

      {open && !loading && error && (
        <p className="text-xs font-semibold text-red-600">{error}</p>
      )}

      {open && !loading && suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <div
              key={s.agent_id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                i === 0
                  ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
                  : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
              }`}
            >
              <div className="text-xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{s.agent_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{s.reason}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-20 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${Math.round(s.success_rate * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">{Math.round(s.success_rate * 100)}% success</span>
                  </div>
                  <span className="text-[10px] text-blue-600 font-bold">
                    Score: {Math.round(s.score * 100)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleReassign(s.agent_id, s.agent_name)}
                disabled={applying !== null}
                className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                {applying === s.agent_id ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-slate-400 hover:text-slate-600 mt-1"
          >
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
    return <div className="animate-pulse h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
  }
  if (state.status === 'error') return null

  const { data } = state
  const arrival = new Date(data.eta_time).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
  const confPct = Math.round(data.confidence * 100)
  const factors = data.factors ?? []
  const maxMin  = Math.max(...factors.map(f => f.minutes), 1)

  return (
    <div className="card dark:bg-slate-900 dark:border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          ⏱ Predicted ETA
        </h2>
        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">AI estimate</span>
      </div>

      {/* Headline */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 leading-none">
            {data.predicted_min}<span className="text-lg font-semibold text-slate-400 ml-1">min</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Window {data.eta_low_min}–{data.eta_high_min} min · arrives ~{arrival}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{data.distance_km} km</p>
          <p className="text-[10px] text-slate-400">from depot</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Confidence</span>
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{confPct}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${confPct >= 85 ? 'bg-green-500' : confPct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${confPct}%` }}
          />
        </div>
      </div>

      {/* Factor breakdown */}
      <div className="space-y-2 pt-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Time breakdown</p>
        {factors.map(f => (
          <div key={f.label} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 dark:text-slate-400 w-32 shrink-0">{f.label}</span>
            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-400"
                style={{ width: `${Math.max((f.minutes / maxMin) * 100, f.minutes > 0 ? 6 : 0)}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-14 text-right">
              {f.minutes} min
            </span>
          </div>
        ))}
        <div className="pt-1 space-y-0.5">
          {factors.map(f => (
            <p key={f.label} className="text-[10px] text-slate-400">
              <span className="font-semibold text-slate-500 dark:text-slate-400">{f.label}:</span> {f.detail}
            </p>
          ))}
        </div>
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
    <div className="card dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          🔗 Customer Tracking Link
        </h2>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Preview ↗
        </a>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Share this public link — the customer can track status and live ETA without logging in.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={e => e.target.select()}
          className="flex-1 min-w-0 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-400 outline-none"
        />
        <button
          onClick={copy}
          className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${
            copied ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Send alert */}
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
          Send delivery alert to customer
        </p>
        {!hasPhone ? (
          <p className="text-xs text-amber-600">No phone number on file for this order.</p>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => notify('sms')}
              disabled={sending !== null}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
            >
              {sending === 'sms' ? 'Sending…' : '💬 Send SMS'}
            </button>
            <button
              onClick={() => notify('whatsapp')}
              disabled={sending !== null}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
            >
              {sending === 'whatsapp' ? 'Sending…' : '🟢 Send WhatsApp'}
            </button>
          </div>
        )}

        {error && <p className="text-xs font-semibold text-red-600 mt-2">{error}</p>}

        {result && (
          <div className="mt-3 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400">
              ✓ {result.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} {result.simulated ? 'simulated' : 'sent'} to {result.to}
            </p>
            {result.simulated && (
              <p className="text-[10px] text-amber-600 mt-0.5">
                Demo mode — add Twilio keys to send real messages.
              </p>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 italic">"{result.message}"</p>
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
      <div className="p-4 md:p-6 space-y-4">
        {[1,2,3].map(i => (
          <div key={i} className="animate-pulse bg-slate-200 dark:bg-slate-800 rounded-xl h-28" />
        ))}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="p-4 md:p-6">
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 mb-4">← Back</button>
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-600">{state.message}</p>
        </div>
      </div>
    )
  }

  const { order } = state
  const d = order.latest_decision
  const isManager = user?.role === 'manager'

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      {/* Back + header */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-blue-600 hover:text-blue-700 mb-3 flex items-center gap-1"
        >
          ← Back
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {order.order_number}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">{order.area} · {order.time_window}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge label={order.status} style={STATUS_STYLES[order.status] ?? 'bg-slate-100 text-slate-600'} />
            {order.is_urgent && (
              <Badge label="Urgent" style="bg-red-100 text-red-700 border border-red-200" />
            )}
          </div>
        </div>
      </div>

      {/* Customer */}
      <div className="card space-y-2 dark:bg-slate-900 dark:border-slate-800">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Customer</h2>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{order.customer_name}</p>
        {order.customer_phone && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{order.customer_phone}</p>
        )}
        <p className="text-sm text-slate-600 dark:text-slate-400">{order.customer_address}</p>
        <div className="flex gap-4 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <span>Package: <strong className="text-slate-700 dark:text-slate-300 capitalize">{order.package_size}</strong></span>
          <span>Residence: <strong className="text-slate-700 dark:text-slate-300 capitalize">{order.residence_type.replace('_', ' ')}</strong></span>
          <span>Payment: <strong className="text-slate-700 dark:text-slate-300">{fmtINR(order.payment_amount)}</strong></span>
        </div>
        <p className="text-xs text-slate-400">Deadline: {fmtDate(order.deadline)}</p>
      </div>

      {/* Agent */}
      {order.agent_name && (
        <div className="card dark:bg-slate-900 dark:border-slate-800">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Assigned Agent</h2>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{order.agent_name}</p>
        </div>
      )}

      {/* AI Decision */}
      {d ? (
        <div className="card dark:bg-slate-900 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">AI Decision</h2>
            <div className="flex gap-2">
              <Badge
                label={d.decision.replace('_', '-')}
                style={DECISION_STYLES[d.decision] ?? 'bg-slate-100 text-slate-600'}
              />
              {d.risk_level && (
                <Badge label={d.risk_level} style={RISK_STYLES[d.risk_level] ?? 'bg-slate-100 text-slate-600'} />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${d.risk_score > 50 ? 'bg-red-400' : 'bg-green-400'}`}
                style={{ width: `${Math.round(d.risk_score)}%` }}
              />
            </div>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-14 text-right">
              {Math.round(d.risk_score)}% risk
            </span>
          </div>

          {d.explanation && (
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{d.explanation}</p>
          )}

          {(d.top_shap_factors?.length ?? 0) > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Risk Factors
              </p>
              {d.top_shap_factors.map(f => (
                <ShapBar key={f.factor} factor={f.factor} contribution={f.contribution} />
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Assessed {fmtDate(d.created_at)}
            {d.model_version && ` · Model ${d.model_version}`}
          </p>
        </div>
      ) : (
        <div className="card dark:bg-slate-900 dark:border-slate-800">
          <p className="text-sm text-slate-400">No AI decision recorded for this order.</p>
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
          <div className="card border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
            <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Reschedule Reason</h2>
            <p className="text-sm text-amber-700 dark:text-amber-400">{order.failure_reason}</p>
          </div>
        ) : (
          <div className="card border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
            <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Failure Reason</h2>
            <p className="text-sm text-red-700 dark:text-red-400">{order.failure_reason}</p>
          </div>
        )
      )}

      {/* Status update (agent only, active orders) */}
      {isAgent && (order.status === 'pending' || order.status === 'in_transit') && (
        <div className="card dark:bg-slate-900 dark:border-slate-800">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Update Status</h2>
          <StatusUpdateForm
            orderId={order.id}
            accessToken={access_token!}
            onUpdated={load}
          />
        </div>
      )}

      {/* Smart Reassign (manager only, failed orders) */}
      {isManager && order.status === 'failed' && (
        <ReassignPanel
          orderId={order.id}
          accessToken={access_token!}
          onReassigned={load}
        />
      )}

      {/* Timestamps */}
      <div className="text-xs text-slate-400 pb-2 space-y-1">
        <p>Created: {fmtDate(order.created_at)}</p>
        <p>Updated: {fmtDate(order.updated_at)}</p>
      </div>
    </div>
  )
}
