import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getMe, type UserProfile } from '../api/auth'
import styles from './Profile.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Profile card ───────────────────────────────────────────────────────────────

function ProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <div>
      {/* Identity card */}
      <div className={styles.card}>

        {/* Avatar + name + role */}
        <div className={styles.idRow}>
          <div className={styles.avatarWrap}>
            <div className={styles.avatarGlow} />
            <div className={styles.avatar}>
              {profile.name.charAt(0).toUpperCase()}
            </div>
          </div>
          <div>
            <p className={styles.idName}>{profile.name}</p>
            <p className={styles.idUsername}>@{profile.username}</p>
          </div>
          <div className={styles.roleWrap}>
            <span className={`${styles.pill} ${styles.pillGold}`}>{profile.role}</span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Fields grid */}
        <div className={styles.fieldsGrid}>
          {profile.phone && (
            <div>
              <p className={styles.fieldLabel}>Phone</p>
              <p className={styles.fieldVal}>{profile.phone}</p>
            </div>
          )}

          {profile.area && (
            <div>
              <p className={styles.fieldLabel}>Area</p>
              <p><span className={`${styles.pill} ${styles.pillMuted}`}>{profile.area}</span></p>
            </div>
          )}

          <div>
            <p className={styles.fieldLabel}>City</p>
            <p className={styles.fieldVal}>{profile.city}</p>
          </div>

          <div>
            <p className={styles.fieldLabel}>Member Since</p>
            <p className={styles.fieldVal}>{fmtDate(profile.created_at)}</p>
          </div>

          <div>
            <p className={styles.fieldLabel}>Account Status</p>
            <p>
              <span className={`${styles.pill} ${profile.is_active ? styles.pillGo : styles.pillNoGo}`}>
                {profile.is_active ? 'Active' : 'Inactive'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Link to Settings */}
      <p className={styles.settingsNote}>
        To edit your name, phone, or notification preferences, visit{' '}
        <Link to="/settings">Settings</Link>.
      </p>

    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Profile() {
  const { access_token } = useAuth()

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; profile: UserProfile }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getMe(access_token!)
      .then(profile => {
        if (!cancelled) setState({ status: 'success', profile })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: extractMsg(err) })
      })
    return () => { cancelled = true }
  }, [access_token])

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        <div className={styles.pageHead}>
          <h1>Profile</h1>
          <p className={styles.sub}>Your account information.</p>
        </div>

        {state.status === 'loading' && (
          <div className={styles.card}>
            <div className={styles.skelRow}>
              <div className={styles.skelBlock} style={{ width: 92, height: 92, borderRadius: '50%' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className={styles.skelBlock} style={{ height: 22, width: 200 }} />
                <div className={styles.skelBlock} style={{ height: 14, width: 120 }} />
              </div>
            </div>
            <div className={styles.divider} />
            <div className={styles.skelGrid}>
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 44 }} />)}
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Failed to load profile</p>
            <p className={styles.errorMsg}>{state.message}</p>
          </div>
        )}

        {state.status === 'success' && (
          <ProfileCard profile={state.profile} />
        )}
      </div>
    </div>
  )
}
