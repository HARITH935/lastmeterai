import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getMe, updateProfile, changePassword,
  type UserProfile,
} from '../api/auth'

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
}: {
  checked:  boolean
  onChange: (v: boolean) => void
  label:    string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          checked ? 'bg-green-500' : 'bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </div>
  )
}

// ── Feedback helpers ───────────────────────────────────────────────────────────

function InlineSuccess({ msg }: { msg: string }) {
  return (
    <p className="text-xs font-semibold text-green-600 mt-2">{msg}</p>
  )
}

function InlineError({ msg }: { msg: string }) {
  return (
    <p className="text-xs font-semibold text-red-600 mt-2">{msg}</p>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function SettingsSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <Sk className="h-40" />
      <Sk className="h-40" />
      <Sk className="h-40" />
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

type NotifPrefs = UserProfile['notification_prefs']

export function Settings() {
  const { access_token, logout } = useAuth()
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
      <div>
        <div className="px-4 md:px-6 pt-6 pb-4">
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        </div>
        <SettingsSkeleton />
      </div>
    )
  }

  if (pageState.status === 'error') {
    return (
      <div className="p-4 md:p-6">
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-600">Failed to load settings</p>
          <p className="text-xs text-red-500 mt-1">{pageState.message}</p>
        </div>
      </div>
    )
  }

  const { profile } = pageState

  return (
    <div>
      {/* Header */}
      <div className="px-4 md:px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-xs text-slate-400 mt-0.5">{profile.username}</p>
      </div>

      <div className="px-4 md:px-6 pb-8 space-y-4">

        {/* ── Profile section ───────────────────────────────────────────────── */}
        <Section title="Profile">
          <form onSubmit={handleSaveProfile} className="space-y-3">

            {/* Read-only: role + area */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 capitalize">
                {profile.role}
              </span>
              {profile.area && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  {profile.area}
                </span>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Name
              </label>
              <input
                type="text"
                value={nameVal}
                onChange={e => { setNameVal(e.target.value); setProfSuccess(false) }}
                maxLength={120}
                required
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your full name"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Phone <span className="normal-case font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="tel"
                value={phoneVal}
                onChange={e => { setPhoneVal(e.target.value); setProfSuccess(false) }}
                maxLength={15}
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Digits only, 10–15 digits"
              />
            </div>

            {profError   && <InlineError   msg={profError} />}
            {profSuccess && <InlineSuccess msg="Profile saved." />}

            <button
              type="submit"
              disabled={profSaving}
              className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
            >
              {profSaving ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </Section>

        {/* ── Notification Preferences section ──────────────────────────────── */}
        <Section title="Notification Preferences">
          <form onSubmit={handleSavePrefs} className="space-y-1">
            <p className="text-xs text-slate-400 mb-3">
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
            />

            {prefsError   && <InlineError   msg={prefsError} />}
            {prefsSuccess && <InlineSuccess msg="Preferences saved." />}

            <div className="pt-2">
              <button
                type="submit"
                disabled={prefsSaving}
                className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
              >
                {prefsSaving ? 'Saving…' : 'Save Preferences'}
              </button>
            </div>
          </form>
        </Section>

        {/* ── Security section ──────────────────────────────────────────────── */}
        <Section title="Security">
          {pwDone ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-green-600">
                Password changed successfully.
              </p>
              <p className="text-xs text-slate-500">
                Signing you out — please log in with your new password.
              </p>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-3">
              <p className="text-xs text-slate-400 -mt-1 mb-1">
                After changing your password you will be signed out of this session.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={pwCurrent}
                  onChange={e => { setPwCurrent(e.target.value); setPwError(null) }}
                  autoComplete="current-password"
                  className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={pwNew}
                  onChange={e => { setPwNew(e.target.value); setPwError(null) }}
                  autoComplete="new-password"
                  className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={e => { setPwConfirm(e.target.value); setPwError(null) }}
                  autoComplete="new-password"
                  className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {pwError && <InlineError msg={pwError} />}

              <button
                type="submit"
                disabled={pwSaving}
                className="text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
              >
                {pwSaving ? 'Changing…' : 'Change Password'}
              </button>
            </form>
          )}
        </Section>

        {/* ── Spec-only features not yet implemented ───────────────────────── */}
        <div className="card bg-slate-50 border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Coming soon
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Model threshold configuration and API integration status require backend
            endpoints that are not yet implemented.
          </p>
        </div>

      </div>
    </div>
  )
}
