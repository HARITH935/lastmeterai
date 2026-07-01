import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getAreaIntelligence,
  VALID_AREAS,
  type AreaName,
  type AreaIntelligenceResponse,
} from '../api/analytics'

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

function toPercent(ratio: number, dp = 1): string {
  return (Math.round(ratio * 1000) / 10).toFixed(dp) + '%'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function srColor(rate: number): string {
  if (rate >= 0.7) return 'text-go'
  if (rate >= 0.4) return 'text-urgent'
  return 'text-nogo'
}

// ── Shared badge colors ────────────────────────────────────────────────────────
// Used for risk_level and weather_sensitivity (same low/medium/high bands).

const LEVEL_COLORS: Record<string, string> = {
  low:    'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-600',
  high:   'bg-red-50 text-red-600',
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${LEVEL_COLORS[level] ?? 'bg-slate-100 text-slate-500'}`}>
      {level}
    </span>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function IntelligenceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Sk key={i} className="h-24" />)}
      </div>
      <Sk className="h-28" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-28" />)}
      </div>
    </div>
  )
}

// ── Metric card ────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  children,
  sub,
}: {
  label:    string
  children: React.ReactNode
  sub?:     string
}) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      {children}
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Intelligence panel ─────────────────────────────────────────────────────────

function IntelligencePanel({ data }: { data: AreaIntelligenceResponse }) {
  if (!data.model_available) {
    return (
      <div className="card border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-700">Model unavailable</p>
        <p className="text-xs text-amber-600 mt-1">
          The area/time prediction model is not available for {data.area}. No predictions can be shown.
        </p>
      </div>
    )
  }

  const {
    success_rate,
    risk_level,
    best_delivery_time,
    rain_impact,
    weather_sensitivity,
    predictions_by_time,
  } = data

  // Approximate clear-day and rainy-day success rates for the rain impact comparison.
  // rain_impact is the increase in FAILURE RATE on rainy vs clear days.
  // success_rate is computed at weather_severity=0.15 (close to clear).
  const clearSuccess = success_rate ?? 0
  const rainySuccess = Math.max(0, clearSuccess - (rain_impact ?? 0))

  return (
    <div className="space-y-4">

      {/* ── Area overview ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Success Rate"
          sub="model prediction (avg)"
        >
          <p className={`text-2xl font-bold ${srColor(success_rate ?? 0)}`}>
            {success_rate != null ? toPercent(success_rate) : '—'}
          </p>
        </MetricCard>

        <MetricCard label="Risk Level">
          {risk_level
            ? <div className="mt-1"><LevelBadge level={risk_level} /></div>
            : <p className="text-2xl font-bold text-slate-400">—</p>
          }
        </MetricCard>

        <MetricCard label="Best Delivery Time" sub="lowest predicted failure rate">
          <p className="text-xl font-bold text-slate-800">
            {best_delivery_time ? capitalize(best_delivery_time) : '—'}
          </p>
        </MetricCard>

        <MetricCard label="Weather Sensitivity" sub={rain_impact != null ? `+${(rain_impact * 100).toFixed(1)} pp on rainy days` : undefined}>
          {weather_sensitivity
            ? <div className="mt-1"><LevelBadge level={weather_sensitivity} /></div>
            : <p className="text-2xl font-bold text-slate-400">—</p>
          }
        </MetricCard>
      </div>

      {/* ── Rain impact ──────────────────────────────────────────────────────── */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Rain Impact
        </p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-slate-500 mb-1">Clear conditions</p>
            <p className={`text-2xl font-bold ${srColor(clearSuccess)}`}>
              ~{toPercent(clearSuccess)}
            </p>
            <p className="text-xs text-slate-400 mt-1">success rate</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Rainy conditions</p>
            <p className={`text-2xl font-bold ${srColor(rainySuccess)}`}>
              ~{toPercent(rainySuccess)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {rain_impact != null ? `−${(rain_impact * 100).toFixed(1)} pp vs clear` : 'success rate'}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-50">
          Estimates from the RF prediction model (synthetic training data — accuracy varies).
        </p>
      </div>

      {/* ── Predictions by time slot ─────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Delivery Success by Time Slot
        </p>
        <div className="grid grid-cols-3 gap-4">
          {(['morning', 'afternoon', 'evening'] as const).map(slot => {
            const rate = predictions_by_time[slot]
            const isBest = slot === best_delivery_time
            return (
              <div
                key={slot}
                className={`card relative ${isBest ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
              >
                {isBest && (
                  <span className="absolute -top-2 left-3 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                    Best ★
                  </span>
                )}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-1">
                  {capitalize(slot)}
                </p>
                <p className={`text-2xl font-bold ${rate != null ? srColor(rate) : 'text-slate-400'}`}>
                  {rate != null ? toPercent(rate) : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-1">predicted success</p>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: AreaIntelligenceResponse }

export function AreaIntelligence() {
  const { user, access_token } = useAuth()
  const [area, setArea] = useState<AreaName>('Anna Nagar')
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' })

  useEffect(() => {
    if (user?.role !== 'manager') return
    let cancelled = false
    setPageState({ status: 'loading' })

    getAreaIntelligence(access_token!, area)
      .then(data => {
        if (!cancelled) setPageState({ status: 'success', data })
      })
      .catch((err: unknown) => {
        if (!cancelled) setPageState({ status: 'error', message: extractMsg(err) })
      })

    return () => { cancelled = true }
  }, [access_token, area, user?.role])

  if (user?.role !== 'manager') {
    return (
      <div className="p-6">
        <div className="card">
          <p className="text-sm text-slate-500">This page is for managers only.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header + area selector */}
      <div className="px-4 md:px-6 pt-6 pb-4 flex flex-wrap items-center gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Area Intelligence</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Per-area delivery model predictions and weather sensitivity.
          </p>
        </div>
        <select
          value={area}
          onChange={e => setArea(e.target.value as AreaName)}
          className="text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {VALID_AREAS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="px-4 md:px-6 pb-8">
        {pageState.status === 'loading' && <IntelligenceSkeleton />}

        {pageState.status === 'error' && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-600">Failed to load area data</p>
            <p className="text-xs text-red-500 mt-1">{pageState.message}</p>
          </div>
        )}

        {pageState.status === 'success' && (
          <IntelligencePanel data={pageState.data} />
        )}
      </div>
    </div>
  )
}
