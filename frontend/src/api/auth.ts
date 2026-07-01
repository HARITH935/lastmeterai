// VITE_API_BASE in .env.local overrides this default.
// Default is 5001 because macOS AirPlay Receiver occupies port 5000.
// To use port 5000, disable AirPlay Receiver in System Settings → General → AirDrop & Handoff.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'
import { authFetch } from './authFetch'

export interface AuthUser {
  id: number
  username: string
  name: string
  role: 'manager' | 'agent'
  area: string | null
  is_active: boolean
  is_manager: boolean | null  // Python property — not always serialized by to_dict()
}

// Full shape returned by GET /api/auth/me and PATCH /api/auth/me/profile.
// Superset of AuthUser — includes fields not stored in AuthContext.
export interface UserProfile {
  id:                 number
  username:           string
  role:               'manager' | 'agent'
  name:               string
  phone:              string | null
  area:               string | null
  city:               string
  is_active:          boolean
  notification_prefs: {
    ai_alert:       boolean
    delivery_alert: boolean
    weather_alert:  boolean
    system_alert:   boolean
  }
  created_at: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  user: AuthUser
}

export interface ApiError {
  error: string
  message: string
  details: Record<string, string>
}

export async function loginRequest(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  const body = await res.json()

  if (!res.ok) {
    // Throw with the backend's error shape so callers can read .message
    throw body as ApiError
  }

  return body as LoginResponse
}

export async function getMe(accessToken: string): Promise<UserProfile> {
  const res = await authFetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as UserProfile
}

export interface UpdateProfileData {
  name?:               string
  phone?:              string | null
  notification_prefs?: Partial<UserProfile['notification_prefs']>
}

export async function updateProfile(
  accessToken: string,
  data: UpdateProfileData,
): Promise<UserProfile> {
  const res = await authFetch(`${API_BASE}/api/auth/me/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as UserProfile
}

export async function changePassword(
  accessToken: string,
  payload: { current_password: string; new_password: string; confirm_password: string },
): Promise<{ message: string }> {
  const res = await authFetch(`${API_BASE}/api/auth/me/password`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as { message: string }
}
