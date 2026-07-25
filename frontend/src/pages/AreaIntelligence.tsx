import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getAreaIntelligence,
  VALID_AREAS,
  type AreaName,
  type AreaIntelligenceResponse,
} from '../api/analytics'
import styles from './AreaIntelligence.module.css'

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

function srClass(rate: number): string {
  if (rate >= 0.7) return styles.go
  if (rate >= 0.4) return styles.urgent
  return styles.nogo
}

// ── Shared badge colors ────────────────────────────────────────────────────────
// Used for risk_level and weather_sensitivity (same low/medium/high bands).

const LEVEL_PILL: Record<string, string> = {
  low:    styles.pillLow,
  medium: styles.pillMedium,
  high:   styles.pillHigh,
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`${styles.pill} ${LEVEL_PILL[level] ?? styles.pillMedium}`}>
      {level}
    </span>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function IntelligenceSkeleton() {
  return (
    <>
      <div className={styles.overviewGrid} style={{ marginBottom: 22 }}>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 108 }} />)}
      </div>
      <div className={styles.skelBlock} style={{ height: 128, marginBottom: 22 }} />
      <div className={styles.slotGrid}>
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 128 }} />)}
      </div>
    </>
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
    <div className={styles.tile}>
      <p className={styles.tileLabel}>{label}</p>
      {children}
      {sub && <p className={styles.tileSub}>{sub}</p>}
    </div>
  )
}

// ── Intelligence panel ─────────────────────────────────────────────────────────

function IntelligencePanel({ data }: { data: AreaIntelligenceResponse }) {
  if (!data.model_available) {
    return (
      <div className={styles.unavailCard}>
        <p className={styles.unavailTitle}>Model unavailable</p>
        <p className={styles.unavailBody}>
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
    <>
      {/* ── Area overview ────────────────────────────────────────────────── */}
      <div className={`${styles.section} ${styles.overviewGrid}`}>
        <MetricCard
          label="Success Rate"
          sub="model prediction (avg)"
        >
          <p className={`${styles.tileValue} ${srClass(success_rate ?? 0)}`}>
            {success_rate != null ? toPercent(success_rate) : '—'}
          </p>
        </MetricCard>

        <MetricCard label="Risk Level">
          {risk_level
            ? <LevelBadge level={risk_level} />
            : <p className={styles.tileValueMuted}>—</p>
          }
        </MetricCard>

        <MetricCard label="Best Delivery Time" sub="lowest predicted failure rate">
          <p className={styles.tileValueSm}>
            {best_delivery_time ? capitalize(best_delivery_time) : '—'}
          </p>
        </MetricCard>

        <MetricCard label="Weather Sensitivity" sub={rain_impact != null ? `+${(rain_impact * 100).toFixed(1)} pp on rainy days` : undefined}>
          {weather_sensitivity
            ? <LevelBadge level={weather_sensitivity} />
            : <p className={styles.tileValueMuted}>—</p>
          }
        </MetricCard>
      </div>

      {/* ── Rain impact ──────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Rain Impact</p>
        <div className={styles.rainCard}>
          <div className={styles.rainGrid}>
            <div>
              <p className={styles.rainLabel}>Clear conditions</p>
              <p className={`${styles.rainValue} ${srClass(clearSuccess)}`}>
                ~{toPercent(clearSuccess)}
              </p>
              <p className={styles.rainSub}>success rate</p>
            </div>
            <div>
              <p className={styles.rainLabel}>Rainy conditions</p>
              <p className={`${styles.rainValue} ${srClass(rainySuccess)}`}>
                ~{toPercent(rainySuccess)}
              </p>
              <p className={styles.rainSub}>
                {rain_impact != null ? `−${(rain_impact * 100).toFixed(1)} pp vs clear` : 'success rate'}
              </p>
            </div>
          </div>
          <div className={styles.rainDivider} />
          <p className={styles.rainFoot}>
            Estimates from the RF prediction model (synthetic training data — accuracy varies).
          </p>
        </div>
      </div>

      {/* ── Predictions by time slot ─────────────────────────────────────── */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Delivery Success by Time Slot</p>
        <div className={styles.slotGrid}>
          {(['morning', 'afternoon', 'evening'] as const).map(slot => {
            const rate = predictions_by_time[slot]
            const isBest = slot === best_delivery_time
            return (
              <div
                key={slot}
                className={`${styles.slotCard} ${isBest ? styles.slotCardBest : ''}`}
              >
                {isBest && <span className={styles.bestTag}>Best ★</span>}
                <p className={styles.slotLabel}>
                  {capitalize(slot)}
                </p>
                <p className={rate != null ? `${styles.slotValue} ${srClass(rate)}` : styles.slotValueMuted}>
                  {rate != null ? toPercent(rate) : '—'}
                </p>
                <p className={styles.slotSub}>predicted success</p>
              </div>
            )
          })}
        </div>
      </div>
    </>
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

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        {/* Header + area selector */}
        <div className={styles.pageHead}>
          <div>
            <h1>Area Intelligence</h1>
            <p className={styles.sub}>
              Per-area delivery model predictions and weather sensitivity.
            </p>
          </div>
          <select
            value={area}
            onChange={e => setArea(e.target.value as AreaName)}
            className={styles.areaSelect}
          >
            {VALID_AREAS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {pageState.status === 'loading' && <IntelligenceSkeleton />}

        {pageState.status === 'error' && (
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Failed to load area data</p>
            <p className={styles.errorMsg}>{pageState.message}</p>
          </div>
        )}

        {pageState.status === 'success' && (
          <IntelligencePanel data={pageState.data} />
        )}
      </div>
    </div>
  )
}
