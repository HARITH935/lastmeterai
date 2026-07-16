const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'
import { authFetch } from './authFetch'

export interface OrderListItem {
  id: number
  order_number: string
  customer_name: string
  customer_phone: string | null
  customer_address: string
  area: string
  city: string
  latitude: number
  longitude: number
  residence_type: string
  agent_id: number | null
  agent_name: string | null
  package_size: string
  time_window: 'morning' | 'afternoon' | 'evening'
  deadline: string
  status: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'postponed'
  failure_reason: string | null
  payment_amount: number
  is_urgent: boolean
  decision: string | null
  risk_score: number | null
  risk_level: string | null
  created_at: string
  updated_at: string
}

export interface OrderListResponse {
  data: OrderListItem[]
  pagination: {
    page: number
    per_page: number
    total: number
    pages: number
  }
}

// Params for getAllOrders — all optional, defaults match backend defaults.
export interface AllOrdersParams {
  search?: string
  area?: string
  status?: string
  riskLevel?: string
  agentId?: number
  sortBy?: 'created_at' | 'deadline' | 'risk_score' | 'payment_amount'
  sortDir?: 'asc' | 'desc'
  page?: number
  perPage?: number
}

export async function getAllOrders(
  accessToken: string,
  params: AllOrdersParams = {},
): Promise<OrderListResponse> {
  const qs = new URLSearchParams()
  qs.set('per_page', String(params.perPage ?? 100))
  qs.set('sort_by', params.sortBy ?? 'created_at')
  qs.set('sort_dir', params.sortDir ?? 'desc')
  qs.set('page', String(params.page ?? 1))
  if (params.search)    qs.set('search',     params.search)
  if (params.area)      qs.set('area',        params.area)
  if (params.status)    qs.set('status',      params.status)
  if (params.riskLevel) qs.set('risk_level',  params.riskLevel)
  if (params.agentId)   qs.set('agent_id',    String(params.agentId))

  const res = await authFetch(`${API_BASE}/api/orders?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as OrderListResponse
}

export async function getAgentOrders(
  accessToken: string,
  params: { dateFrom?: string; status?: string; perPage?: number } = {},
): Promise<OrderListResponse> {
  const qs = new URLSearchParams()
  if (params.dateFrom) qs.set('date_from', params.dateFrom)
  if (params.status)   qs.set('status',    params.status)
  qs.set('per_page', String(params.perPage ?? 100))
  qs.set('sort_by',  'deadline')
  qs.set('sort_dir', 'asc')

  const res = await authFetch(`${API_BASE}/api/orders?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as OrderListResponse
}

export interface UpdateStatusResponse {
  id: number
  order_number: string
  status: string
  failure_reason: string | null
  updated_at: string
}

// ── Route optimization ────────────────────────────────────────────────────────

export interface RouteStop {
  order_id: number
  order_number: string
  sequence: number
  customer_name: string
  customer_address: string
  latitude: number
  longitude: number
  area: string
  status: string
  risk_level: string | null
  is_urgent: boolean
  eta: string
  duration_from_prev_min: number
  distance_from_prev_km: number
}

export interface OptimizedRoute {
  stops: RouteStop[]
  total_distance_km: number
  total_duration_min: number
  route_geometry: [number, number][]
  start_location: { lat: number; lon: number } | null
  recalculated_at: string | null
  traffic_factor: number
  weather_risk: number
  optimize?: 'time' | 'distance'
}

export async function getOptimizedRoute(
  accessToken: string,
  optimize: 'time' | 'distance' = 'time',
): Promise<OptimizedRoute> {
  const res = await authFetch(`${API_BASE}/api/orders/optimized-route?optimize=${optimize}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as OptimizedRoute
}

export interface OrderDetail extends OrderListItem {
  tracking_token: string
  latest_decision: {
    id: number
    decision: string
    risk_score: number
    risk_level: string
    explanation: string | null
    top_shap_factors: { factor: string; contribution: number }[]
    created_at: string
    model_version: string | null
  } | null
}

export async function getOrder(accessToken: string, orderId: number): Promise<OrderDetail> {
  const res = await authFetch(`${API_BASE}/api/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as OrderDetail
}

export async function updateOrderStatus(
  accessToken: string,
  orderId: number,
  payload: { status: 'delivered' | 'failed' | 'postponed'; failure_reason?: string | null },
): Promise<UpdateStatusResponse> {
  const res = await authFetch(`${API_BASE}/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as UpdateStatusResponse
}

// ── Reassign suggestion ───────────────────────────────────────────────────────

export interface ReassignSuggestion {
  agent_id: number
  agent_name: string
  area: string | null
  pending_orders: number
  area_delivered: number
  success_rate: number
  score: number
  reason: string
}

export interface ReassignSuggestionsResponse {
  order_id: number
  area: string
  suggestions: ReassignSuggestion[]
}

export async function getReassignSuggestions(
  accessToken: string,
  orderId: number,
): Promise<ReassignSuggestionsResponse> {
  const res = await authFetch(`${API_BASE}/api/orders/${orderId}/reassign-suggestion`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as ReassignSuggestionsResponse
}

// ── Customer notify (SMS / WhatsApp) ──────────────────────────────────────────

export interface NotifyResponse {
  sent: boolean
  simulated: boolean
  channel: 'sms' | 'whatsapp'
  to: string
  message: string
}

export async function notifyCustomer(
  accessToken: string,
  orderId: number,
  channel: 'sms' | 'whatsapp',
): Promise<NotifyResponse> {
  const res = await authFetch(`${API_BASE}/api/orders/${orderId}/notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ channel }),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as NotifyResponse
}

// ── Public tracking (no auth) ─────────────────────────────────────────────────

export interface TrackingInfo {
  order_number: string
  customer_name: string
  area: string
  city: string
  status: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'postponed'
  status_title: string
  status_message: string
  time_window: string
  package_size: string
  is_urgent: boolean
  agent_name: string | null
  timeline: string[]
  destination: { lat: number; lon: number }
  agent_location: { lat: number; lon: number } | null
  rating: number | null
  eta: {
    predicted_min: number
    eta_low_min: number
    eta_high_min: number
    eta_time: string
    distance_km: number
  } | null
}

export async function getTracking(token: string): Promise<TrackingInfo> {
  const res = await fetch(`${API_BASE}/api/track/${encodeURIComponent(token)}`)
  const body = await res.json()
  if (!res.ok) throw body
  return body as TrackingInfo
}

export async function submitRating(token: string, rating: number, comment?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/track/${encodeURIComponent(token)}/rating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, comment: comment ?? '' }),
  })
  const body = await res.json()
  if (!res.ok) throw body
}

// ── ETA prediction ────────────────────────────────────────────────────────────

export interface EtaFactor {
  label: string
  minutes: number
  detail: string
}

export interface OrderEta {
  order_id: number
  predicted_min: number
  eta_low_min: number
  eta_high_min: number
  eta_time: string
  confidence: number
  distance_km: number
  weather_risk: number
  factors: EtaFactor[]
}

export async function getOrderEta(accessToken: string, orderId: number): Promise<OrderEta> {
  const res = await authFetch(`${API_BASE}/api/orders/${orderId}/eta`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as OrderEta
}

// ── Bulk create ───────────────────────────────────────────────────────────────

export interface BulkOrderRow {
  customer_name: string
  customer_phone: string | null
  customer_address: string
  area: string
  residence_type: string
  package_size: string
  time_window: string
  deadline: string
  payment_amount: number
  latitude: number
  longitude: number
  is_urgent: boolean
}

export interface BulkResultRow {
  row: number
  status: 'created' | 'error'
  order_number?: string
  errors?: Record<string, string>
}

export interface BulkCreateResponse {
  results: BulkResultRow[]
  created: number
  total: number
}

export interface CreateOrderInput {
  customer_name: string
  customer_phone?: string | null
  customer_address: string
  area: string
  latitude: number
  longitude: number
  residence_type: string
  package_size: string
  time_window: string
  deadline: string
  payment_amount: number
  agent_id?: number | null
}

export async function createOrder(
  accessToken: string,
  input: CreateOrderInput,
): Promise<OrderListItem> {
  const res = await authFetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as OrderListItem
}

export async function bulkCreateOrders(
  accessToken: string,
  orders: BulkOrderRow[],
): Promise<BulkCreateResponse> {
  const res = await authFetch(`${API_BASE}/api/orders/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ orders }),
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as BulkCreateResponse
}

export async function reassignOrder(
  accessToken: string,
  orderId: number,
  agentId: number,
): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/orders/${orderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ agent_id: agentId }),
  })
  const body = await res.json()
  if (!res.ok) throw body
}
