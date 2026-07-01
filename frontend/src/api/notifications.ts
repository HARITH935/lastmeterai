const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'
import { authFetch } from './authFetch'

// ── Types ──────────────────────────────────────────────────────────────────────

export type NotificationCategory =
  | 'ai_alert'
  | 'delivery_alert'
  | 'weather_alert'
  | 'system_alert'

export interface NotificationItem {
  id:         number
  user_id:    number
  category:   NotificationCategory
  title:      string
  message:    string
  is_read:    boolean
  order_id:   number | null
  extra:      Record<string, unknown> | null
  created_at: string
}

export interface UnreadCounts {
  ai_alert:       number
  delivery_alert: number
  weather_alert:  number
  system_alert:   number
  total:          number
}

export interface NotificationListResponse {
  data: NotificationItem[]
  pagination: {
    page:     number
    per_page: number
    total:    number
    pages:    number
  }
  unread_counts: UnreadCounts
}

export interface ListParams {
  category?: NotificationCategory | ''
  is_read?:  boolean
  page?:     number
  per_page?: number
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function getNotifications(
  accessToken: string,
  params: ListParams = {},
): Promise<NotificationListResponse> {
  const qs = new URLSearchParams()
  qs.set('per_page', String(params.per_page ?? 20))
  qs.set('page',     String(params.page ?? 1))
  if (params.category)          qs.set('category', params.category)
  if (params.is_read === true)  qs.set('is_read',  'true')
  if (params.is_read === false) qs.set('is_read',  'false')

  const res  = await authFetch(`${API_BASE}/api/notifications?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as NotificationListResponse
}

export async function markNotificationRead(
  accessToken: string,
  id: number,
): Promise<NotificationItem> {
  const res  = await authFetch(`${API_BASE}/api/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as NotificationItem
}

export async function markAllRead(
  accessToken: string,
  category?: NotificationCategory | '',
): Promise<{ updated_count: number }> {
  const payload: Record<string, string> = {}
  if (category) payload.category = category

  const res  = await authFetch(`${API_BASE}/api/notifications/read-all`, {
    method:  'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as { updated_count: number }
}

export async function deleteNotification(
  accessToken: string,
  id: number,
): Promise<{ message: string }> {
  const res  = await authFetch(`${API_BASE}/api/notifications/${id}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as { message: string }
}
