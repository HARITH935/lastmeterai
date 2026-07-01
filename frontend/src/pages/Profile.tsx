import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getMe, type UserProfile } from '../api/auth'

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

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

// ── Profile card ───────────────────────────────────────────────────────────────

function ProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <div className="space-y-4">

      {/* Identity card */}
      <div className="card space-y-4">

        {/* Avatar placeholder + name */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-xl font-bold text-blue-600">
              {profile.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{profile.name}</p>
            <p className="text-xs text-slate-400 font-mono">@{profile.username}</p>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Fields grid */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Role</dt>
            <dd>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 capitalize">
                {profile.role}
              </span>
            </dd>
          </div>

          {profile.phone && (
            <div>
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Phone</dt>
              <dd className="text-sm text-slate-700">{profile.phone}</dd>
            </div>
          )}

          {profile.area && (
            <div>
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Area</dt>
              <dd>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  {profile.area}
                </span>
              </dd>
            </div>
          )}

          <div>
            <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">City</dt>
            <dd className="text-sm text-slate-700">{profile.city}</dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Member Since</dt>
            <dd className="text-sm text-slate-700">{fmtDate(profile.created_at)}</dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Account Status</dt>
            <dd>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                profile.is_active
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-600'
              }`}>
                {profile.is_active ? 'Active' : 'Inactive'}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Link to Settings */}
      <p className="text-xs text-slate-400 text-center">
        To edit your name, phone, or notification preferences, visit{' '}
        <Link to="/settings" className="text-blue-600 hover:underline font-semibold">
          Settings
        </Link>
        .
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
    <div>
      <div className="px-4 md:px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-slate-900">Profile</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your account information.</p>
      </div>

      <div className="px-4 md:px-6 pb-8">
        {state.status === 'loading' && (
          <div className="card space-y-4">
            <div className="flex items-center gap-4">
              <Sk className="w-14 h-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Sk className="h-5 w-40" />
                <Sk className="h-3 w-24" />
              </div>
            </div>
            <hr className="border-slate-100" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-10" />)}
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-600">Failed to load profile</p>
            <p className="text-xs text-red-500 mt-1">{state.message}</p>
          </div>
        )}

        {state.status === 'success' && (
          <ProfileCard profile={state.profile} />
        )}
      </div>
    </div>
  )
}
