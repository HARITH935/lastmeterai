import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AuthUser } from '../api/auth'
import { setupAuthFetch } from '../api/authFetch'

const STORAGE_KEY = 'lm_auth'

interface StoredAuth {
  user: AuthUser
  access_token: string
  refresh_token: string
}

interface AuthContextValue {
  user: AuthUser | null
  access_token: string | null
  login: (user: AuthUser, access_token: string, refresh_token: string) => void
  logout: () => void
  updateTokens: (access_token: string, refresh_token: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStorage(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredAuth) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredAuth | null>(() => readStorage())

  const login = useCallback(
    (user: AuthUser, access_token: string, refresh_token: string) => {
      const next: StoredAuth = { user, access_token, refresh_token }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStored(next)
    },
    [],
  )

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setStored(null)
  }, [])

  const updateTokens = useCallback(
    (access_token: string, refresh_token: string) => {
      setStored(prev => {
        if (!prev) return prev
        const next: StoredAuth = { ...prev, access_token, refresh_token }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        return next
      })
    },
    [],
  )

  // Wire up authFetch on every render — idempotent module assignment.
  setupAuthFetch({ updateTokens, logout })

  return (
    <AuthContext.Provider
      value={{
        user: stored?.user ?? null,
        access_token: stored?.access_token ?? null,
        login,
        logout,
        updateTokens,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
