import { useState, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { loginRequest, type ApiError } from '../api/auth'
import { useAuth } from '../contexts/AuthContext'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Already logged in — skip the login page
  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setLoading(true)

    try {
      const res = await loginRequest(username.trim(), password)
      login(res.user, res.access_token, res.refresh_token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.error === 'VALIDATION_ERROR' && apiErr.details) {
        setFieldErrors(apiErr.details as { username?: string; password?: string })
      } else {
        // INVALID_CREDENTIALS, ACCOUNT_DISABLED, or network error
        setFormError(apiErr.message ?? 'Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-screen">
      {/* Left — form panel */}
      <div className="flex flex-col justify-center w-full md:w-1/2 px-8 py-12 bg-white">
        <div className="max-w-sm w-full mx-auto">
          {/* Logo / Brand */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">LastMeter AI</h1>
            <p className="mt-1 text-sm text-slate-500">
              Last-mile delivery intelligence for Chennai
            </p>
          </div>

          <h2 className="text-lg font-semibold text-slate-800 mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={fieldErrors.username}
              placeholder="e.g. manager"
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              placeholder="••••••••"
              required
            />

            {/* Form-level error (wrong credentials, disabled account, network) */}
            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-nogo">
                {formError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full mt-2 py-3"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-xs text-slate-400 text-center">
            Seed credentials: manager / manager123 · ravi.kumar / agent123
          </p>
        </div>
      </div>

      {/* Right — visual panel (desktop only) */}
      <div className="hidden md:flex flex-col items-center justify-center w-1/2 bg-primary relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary-light opacity-40" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-primary-light opacity-30" />

        <div className="relative z-10 text-center text-white px-8">
          <div className="text-6xl font-bold tracking-tight mb-3">LM</div>
          <h2 className="text-2xl font-semibold mb-4">AI-driven delivery decisions</h2>
          <p className="text-primary-100 text-sm max-w-xs leading-relaxed">
            Predict GO / NO-GO in real time. Reduce failed deliveries with weather-aware,
            area-intelligent routing assistance across Chennai.
          </p>

          {/* Stats row */}
          <div className="mt-10 flex gap-8 justify-center">
            <div>
              <div className="text-3xl font-bold">91%</div>
              <div className="text-xs text-primary-100 mt-1">Model accuracy</div>
            </div>
            <div>
              <div className="text-3xl font-bold">5</div>
              <div className="text-xs text-primary-100 mt-1">Chennai areas</div>
            </div>
            <div>
              <div className="text-3xl font-bold">8</div>
              <div className="text-xs text-primary-100 mt-1">AI intents</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
