import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  getMe, updateProfile, changePassword,
  type UserProfile,
} from '../api/auth'
import styles from './Settings.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractMsg(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  disabled,
  flush,
}: {
  checked:  boolean
  onChange: (v: boolean) => void
  label:    string
  disabled?: boolean
  flush?: boolean
}) {
  return (
    <div className={`${styles.toggleRow} ${flush ? styles.toggleRowFlush : ''}`}>
      <span className={styles.toggleLabel}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
      >
        <span className={styles.switchKnob} />
      </button>
    </div>
  )
}

// ── Feedback helpers ───────────────────────────────────────────────────────────

function InlineSuccess({ msg }: { msg: string }) {
  return <p className={`${styles.inlineMsg} ${styles.inlineOk}`}>{msg}</p>
}

function InlineError({ msg }: { msg: string }) {
  return <p className={`${styles.inlineMsg} ${styles.inlineErr}`}>{msg}</p>
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{title}</p>
      {children}
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <div className={styles.sections}>
      {Array.from({ length: 3 }).map((_, i) => <div key={i} className={styles.skelBlock} style={{ height: 160 }} />)}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

type NotifPrefs = UserProfile['notification_prefs']

export function Settings() {
  const { access_token, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  // ── Page-level load ─────────────────────────────────────────────────────────
  const [pageState, setPageState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; profile: UserProfile }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getMe(access_token!)
      .then(profile => {
        if (!cancelled) setPageState({ status: 'success', profile })
      })
      .catch((err: unknown) => {
        if (!cancelled) setPageState({ status: 'error', message: extractMsg(err) })
      })
    return () => { cancelled = true }
  }, [access_token])

  // ── Profile form state ───────────────────────────────────────────────────────
  const [nameVal,   setNameVal]   = useState('')
  const [phoneVal,  setPhoneVal]  = useState('')
  const [profSaving,  setProfSaving]  = useState(false)
  const [profError,   setProfError]   = useState<string | null>(null)
  const [profSuccess, setProfSuccess] = useState(false)

  // ── Notification prefs state ─────────────────────────────────────────────────
  const [prefs, setPrefs] = useState<NotifPrefs>({
    ai_alert: true, delivery_alert: true, weather_alert: true, system_alert: true,
  })
  const [prefsSaving,  setPrefsSaving]  = useState(false)
  const [prefsError,   setPrefsError]   = useState<string | null>(null)
  const [prefsSuccess, setPrefsSuccess] = useState(false)

  // ── Password form state ──────────────────────────────────────────────────────
  const [pwCurrent,  setPwCurrent]  = useState('')
  const [pwNew,      setPwNew]      = useState('')
  const [pwConfirm,  setPwConfirm]  = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)
  const [pwError,    setPwError]    = useState<string | null>(null)
  const [pwDone,     setPwDone]     = useState(false)

  // Populate form fields once profile loads
  useEffect(() => {
    if (pageState.status !== 'success') return
    const p = pageState.profile
    setNameVal(p.name)
    setPhoneVal(p.phone ?? '')
    setPrefs({ ...p.notification_prefs })
  }, [pageState.status])  // Only on initial load

  // Redirect to login after password change (token was revoked server-side)
  useEffect(() => {
    if (!pwDone) return
    const timer = window.setTimeout(() => {
      logout()
      navigate('/login')
    }, 2000)
    return () => clearTimeout(timer)
  }, [pwDone, logout, navigate])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (profSaving) return
    setProfError(null)
    setProfSuccess(false)

    const trimmedName = nameVal.trim()
    if (!trimmedName) {
      setProfError('Name is required.')
      return
    }

    const phoneClean = phoneVal.trim()

    setProfSaving(true)
    try {
      const updated = await updateProfile(access_token!, {
        name:  trimmedName,
        phone: phoneClean || null,
      })
      setNameVal(updated.name)
      setPhoneVal(updated.phone ?? '')
      setPageState(s =>
        s.status === 'success' ? { ...s, profile: updated } : s,
      )
      setProfSuccess(true)
    } catch (err) {
      setProfError(extractMsg(err))
    } finally {
      setProfSaving(false)
    }
  }

  async function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault()
    if (prefsSaving) return
    setPrefsError(null)
    setPrefsSuccess(false)

    setPrefsSaving(true)
    try {
      const updated = await updateProfile(access_token!, { notification_prefs: prefs })
      setPrefs({ ...updated.notification_prefs })
      setPageState(s =>
        s.status === 'success' ? { ...s, profile: updated } : s,
      )
      setPrefsSuccess(true)
    } catch (err) {
      setPrefsError(extractMsg(err))
    } finally {
      setPrefsSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwSaving || pwDone) return
    setPwError(null)

    // Client-side checks before hitting API
    if (!pwCurrent) { setPwError('Current password is required.'); return }
    if (!pwNew)     { setPwError('New password is required.');     return }
    if (pwNew.length < 8) {
      setPwError('New password must be at least 8 characters.')
      return
    }
    if (pwNew !== pwConfirm) {
      setPwError("Passwords don't match.")
      return
    }
    if (pwNew === pwCurrent) {
      setPwError('New password must differ from your current password.')
      return
    }

    setPwSaving(true)
    try {
      await changePassword(access_token!, {
        current_password: pwCurrent,
        new_password:     pwNew,
        confirm_password: pwConfirm,
      })
      setPwDone(true)
    } catch (err) {
      setPwError(extractMsg(err))
    } finally {
      setPwSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (pageState.status === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          <div className={styles.pageHead}>
            <h1>Settings</h1>
          </div>
          <SettingsSkeleton />
        </div>
      </div>
    )
  }

  if (pageState.status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.guilloche} />
        <div className={styles.wrap}>
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Failed to load settings</p>
            <p className={styles.errorMsg}>{pageState.message}</p>
          </div>
        </div>
      </div>
    )
  }

  const { profile } = pageState

  return (
    <div className={styles.page}>
      <div className={styles.guilloche} />
      <div className={styles.wrap}>
        {/* Header */}
        <div className={styles.pageHead}>
          <h1>Settings</h1>
          <p className={styles.sub}>@{profile.username}</p>
        </div>

        <div className={styles.sections}>

          {/* ── Profile section ───────────────────────────────────────────── */}
          <Section title="Profile">
            <form onSubmit={handleSaveProfile}>

              {/* Read-only: role + area */}
              <div className={styles.pillRow}>
                <span className={`${styles.pill} ${styles.pillGold}`}>{profile.role}</span>
                {profile.area && (
                  <span className={`${styles.pill} ${styles.pillMuted}`}>{profile.area}</span>
                )}
              </div>

              {/* Name */}
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Name</label>
                <input
                  type="text"
                  value={nameVal}
                  onChange={e => { setNameVal(e.target.value); setProfSuccess(false) }}
                  maxLength={120}
                  required
                  className={styles.formInput}
                  placeholder="Your full name"
                />
              </div>

              {/* Phone */}
              <div className={styles.formRowLast}>
                <label className={styles.formLabel}>
                  Phone <span className={styles.opt}>(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phoneVal}
                  onChange={e => { setPhoneVal(e.target.value); setProfSuccess(false) }}
                  maxLength={15}
                  className={styles.formInput}
                  placeholder="Digits only, 10–15 digits"
                />
              </div>

              <button type="submit" disabled={profSaving} className={styles.btnGold}>
                {profSaving ? 'Saving…' : 'Save Profile'}
              </button>

              {profError   && <InlineError   msg={profError} />}
              {profSuccess && <InlineSuccess msg="Profile saved." />}
            </form>
          </Section>

          {/* ── Notification Preferences section ──────────────────────────── */}
          <Section title="Notification Preferences">
            <form onSubmit={handleSavePrefs}>
              <p className={styles.sectionDesc}>
                Choose which notification types you receive.
              </p>

              <Toggle
                checked={prefs.ai_alert}
                onChange={v => { setPrefs(p => ({ ...p, ai_alert: v })); setPrefsSuccess(false) }}
                label="AI Alerts"
                disabled={prefsSaving}
              />
              <Toggle
                checked={prefs.delivery_alert}
                onChange={v => { setPrefs(p => ({ ...p, delivery_alert: v })); setPrefsSuccess(false) }}
                label="Delivery Alerts"
                disabled={prefsSaving}
              />
              <Toggle
                checked={prefs.weather_alert}
                onChange={v => { setPrefs(p => ({ ...p, weather_alert: v })); setPrefsSuccess(false) }}
                label="Weather Alerts"
                disabled={prefsSaving}
              />
              <Toggle
                checked={prefs.system_alert}
                onChange={v => { setPrefs(p => ({ ...p, system_alert: v })); setPrefsSuccess(false) }}
                label="System Alerts"
                disabled={prefsSaving}
                flush
              />

              <div style={{ marginTop: 18 }}>
                <button type="submit" disabled={prefsSaving} className={styles.btnGold}>
                  {prefsSaving ? 'Saving…' : 'Save Preferences'}
                </button>
              </div>

              {prefsError   && <InlineError   msg={prefsError} />}
              {prefsSuccess && <InlineSuccess msg="Preferences saved." />}
            </form>
          </Section>

          {/* ── Security section ──────────────────────────────────────────── */}
          <Section title="Security">
            {pwDone ? (
              <div className={styles.successCard}>
                <p className={styles.successTitle}>
                  ✓ Password changed successfully.
                </p>
                <p className={styles.successSub}>
                  Signing you out — please log in with your new password.
                </p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword}>
                <p className={styles.sectionDesc}>
                  After changing your password you will be signed out of this session.
                </p>

                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Current Password</label>
                  <input
                    type="password"
                    value={pwCurrent}
                    onChange={e => { setPwCurrent(e.target.value); setPwError(null) }}
                    autoComplete="current-password"
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formRow}>
                  <label className={styles.formLabel}>New Password</label>
                  <input
                    type="password"
                    value={pwNew}
                    onChange={e => { setPwNew(e.target.value); setPwError(null) }}
                    autoComplete="new-password"
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formRowLast}>
                  <label className={styles.formLabel}>Confirm New Password</label>
                  <input
                    type="password"
                    value={pwConfirm}
                    onChange={e => { setPwConfirm(e.target.value); setPwError(null) }}
                    autoComplete="new-password"
                    className={styles.formInput}
                  />
                </div>

                <button type="submit" disabled={pwSaving} className={styles.btnDanger}>
                  {pwSaving ? 'Changing…' : 'Change Password'}
                </button>

                {pwError && <InlineError msg={pwError} />}
              </form>
            )}
          </Section>

          {/* ── Appearance section ─────────────────────────────────────────── */}
          <Section title="Appearance">
            <p className={styles.sectionDesc}>Choose your preferred theme.</p>
            <Toggle
              checked={theme === 'dark'}
              onChange={toggleTheme}
              label="Dark Mode"
              flush
            />
          </Section>

        </div>
      </div>
    </div>
  )
}
