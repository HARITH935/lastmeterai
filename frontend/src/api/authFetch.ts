const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'

interface AuthCallbacks {
  updateTokens: (access_token: string, refresh_token: string) => void
  logout: () => void
}

// Injected once by AuthProvider during its render — available before any child mounts.
let _cb: AuthCallbacks | null = null

// Deduplicates concurrent 401 retries: if two calls both get 401 simultaneously,
// only one refresh request is sent; both callers await the same promise.
let _inflightRefresh: Promise<string | null> | null = null

export function setupAuthFetch(cb: AuthCallbacks): void {
  _cb = cb
}

function readRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem('lm_auth')
    if (!raw) return null
    return (JSON.parse(raw) as { refresh_token?: string }).refresh_token ?? null
  } catch {
    return null
  }
}

// Only these error codes mean the access token itself is stale and worth refreshing.
// Semantic 401s (WRONG_PASSWORD, TOKEN_REVOKED, UNAUTHORIZED) are passed through unchanged.
const REFRESH_ON = new Set(['TOKEN_EXPIRED', 'TOKEN_INVALID'])

async function attemptRefresh(): Promise<string | null> {
  if (_inflightRefresh) return _inflightRefresh

  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    _cb?.logout()
    return null
  }

  _inflightRefresh = (async () => {
    try {
      const r = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!r.ok) {
        _cb?.logout()
        return null
      }
      const { access_token, refresh_token } = await r.json() as {
        access_token: string
        refresh_token: string
      }
      _cb?.updateTokens(access_token, refresh_token)
      return access_token
    } catch {
      _cb?.logout()
      return null
    } finally {
      _inflightRefresh = null
    }
  })()

  return _inflightRefresh
}

/**
 * Drop-in replacement for `fetch` in API client files.
 *
 * On 401 with TOKEN_EXPIRED or TOKEN_INVALID: silently refreshes the access
 * token (using the refresh token from localStorage), updates AuthContext, and
 * retries the original request once with the new token.
 *
 * On any other 401 (WRONG_PASSWORD, TOKEN_REVOKED, etc.): returns the response
 * as-is so the caller can handle the semantic error normally.
 *
 * On refresh failure: calls logout() and returns the original 401 response.
 */
export async function authFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status !== 401 || !_cb) return res

  // Clone to inspect the error code without consuming the body for the caller.
  let errorCode: string | null = null
  try {
    const body = await res.clone().json() as { error?: string }
    errorCode = body.error ?? null
  } catch {
    return res
  }

  if (!errorCode || !REFRESH_ON.has(errorCode)) return res

  const newToken = await attemptRefresh()
  if (!newToken) return res  // refresh failed; logout already called

  // Retry with the new token replacing the Authorization header.
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
    Authorization: `Bearer ${newToken}`,
  }
  return fetch(url, { ...init, headers })
}
