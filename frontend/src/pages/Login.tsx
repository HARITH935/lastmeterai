import { useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { loginRequest, type ApiError } from '../api/auth'
import { useAuth } from '../contexts/AuthContext'
import styles from './Login.module.css'

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
    <div className={styles.screen}>
      <svg className={styles.bgMap} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgRouteGrad" x1="80" y1="780" x2="1320" y2="140" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#A9772A" />
            <stop offset="0.55" stopColor="#D9A54B" />
            <stop offset="1" stopColor="#FFF3D0" />
          </linearGradient>
          <linearGradient id="bgRouteGrad2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#A9772A" />
            <stop offset="1" stopColor="#F3D999" />
          </linearGradient>
          <filter id="bgGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <line className={styles.gridLine} x1="140" y1="80" x2="140" y2="840" />
        <line className={styles.gridLine} x1="420" y1="40" x2="420" y2="860" />
        <line className={styles.gridLine} x1="700" y1="40" x2="700" y2="820" />
        <line className={styles.gridLine} x1="980" y1="40" x2="980" y2="760" />
        <line className={styles.gridLine} x1="1260" y1="60" x2="1260" y2="700" />
        <line className={styles.gridLine} x1="60" y1="200" x2="1400" y2="200" />
        <line className={styles.gridLine} x1="60" y1="460" x2="1400" y2="460" />
        <line className={styles.gridLine} x1="60" y1="700" x2="1400" y2="700" />

        <rect className={styles.mapBlock} x="200" y="130" width="130" height="80" />
        <rect className={styles.mapBlock} x="500" y="560" width="110" height="90" />
        <rect className={styles.mapBlock} x="820" y="480" width="150" height="100" />
        <rect className={styles.mapBlock} x="1080" y="600" width="120" height="80" />
        <rect className={styles.mapBlock} x="960" y="90" width="100" height="70" />

        <path id="bgRoutePath2" className={styles.routePath2} d="M 260 200 C 340 320, 420 340, 520 420 S 700 560, 880 600" />
        <path id="bgRoutePath3" className={styles.routePath3} d="M 1360 200 C 1260 260, 1180 260, 1080 340 S 900 480, 700 520" />

        <path className={styles.routeFaint} d="M 100 780 Q 300 700 420 520" />
        <path className={styles.routeFaint} d="M 780 340 Q 900 260 980 90" />
        <path className={styles.routeFaint} d="M 260 200 Q 180 400 260 700" />

        <path id="bgRoutePath" className={styles.routePath} d="M 100 780 C 260 780, 300 560, 420 520 S 680 380, 780 340 S 1080 200, 1300 150" />
        <path className={styles.routeDash} d="M 100 780 C 260 780, 300 560, 420 520 S 680 380, 780 340 S 1080 200, 1300 150" />

        <circle className={styles.pin} cx="260" cy="700" r="4" />
        <text className={styles.mapLabelDim} x="260" y="722" textAnchor="middle">VELACHERY</text>
        <circle className={styles.pin} cx="880" cy="600" r="4" />
        <text className={`${styles.mapLabelDim} ${styles.pingEnd}`} style={{ '--ping-dur': '4.2s' } as CSSProperties} x="880" y="622" textAnchor="middle">PORUR</text>
        <circle className={styles.pin} cx="700" cy="520" r="4" />
        <text className={`${styles.mapLabelDim} ${styles.pingEnd}`} style={{ '--ping-dur': '5.4s' } as CSSProperties} x="700" y="542" textAnchor="middle">T NAGAR</text>
        <circle className={styles.pin} cx="420" cy="200" r="4" />
        <text className={styles.mapLabelDim} x="420" y="186" textAnchor="middle">ANNA NAGAR</text>
        <circle className={styles.pin} cx="1080" cy="340" r="4" />
        <text className={styles.mapLabelDim} x="1080" y="326" textAnchor="middle">MYLAPORE</text>

        <circle cx="100" cy="780" r="8" fill="#F3ECDA" opacity="0.85" />
        <text className={`${styles.mapLabel} ${styles.pingStart}`} x="100" y="806" textAnchor="middle">DEPOT</text>
        <circle cx="1300" cy="150" r="11" fill="none" stroke="#D9A54B" strokeWidth="2" opacity="0.5">
          <animate attributeName="r" values="9;24;9" dur="2.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.55;0;0.55" dur="2.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="1300" cy="150" r="7" fill="#F3D999" />
        <text className={`${styles.mapLabelGold} ${styles.pingEnd}`} style={{ '--ping-dur': '6s' } as CSSProperties} x="1300" y="128" textAnchor="middle">ADYAR</text>

        <circle r="7" fill="#FFF3D0" filter="url(#bgGlow)">
          <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
            <mpath href="#bgRoutePath" />
          </animateMotion>
        </circle>
        <circle r="5" fill="#F3D999" filter="url(#bgGlow)" opacity="0.7">
          <animateMotion dur="4.2s" repeatCount="indefinite" rotate="auto">
            <mpath href="#bgRoutePath2" />
          </animateMotion>
        </circle>
        <circle r="5" fill="#F3D999" filter="url(#bgGlow)" opacity="0.55">
          <animateMotion dur="5.4s" repeatCount="indefinite" rotate="auto">
            <mpath href="#bgRoutePath3" />
          </animateMotion>
        </circle>
      </svg>

      <div className={styles.guilloche} />
      <div className={styles.grain} />
      <div className={styles.topHairline} />
      <div className={styles.screenAtmosphere} />

      <div className={styles.formSide}>
        <div className={styles.formWrap}>
          <span className={`${styles.corner} ${styles.cornerTl}`} />
          <span className={`${styles.corner} ${styles.cornerTr}`} />
          <span className={`${styles.corner} ${styles.cornerBl}`} />
          <span className={`${styles.corner} ${styles.cornerBr}`} />

          <div className={styles.wordmark}>
            LastMeter<span>-AI</span>
          </div>
          <div className={styles.formHead}>
            <div className={styles.eyebrow}>Manager / Agent access</div>
            <h1>Sign in to the console</h1>
            <p>Accounts are provisioned by your dispatch manager.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                data-invalid={Boolean(fieldErrors.username)}
                required
              />
              {fieldErrors.username && <p className={styles.fieldError}>{fieldErrors.username}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                data-invalid={Boolean(fieldErrors.password)}
                required
              />
              {fieldErrors.password && <p className={styles.fieldError}>{fieldErrors.password}</p>}
            </div>

            {formError && <div className={styles.formError}>{formError}</div>}

            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
