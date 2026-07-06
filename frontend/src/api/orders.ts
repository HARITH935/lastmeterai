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
}

export async function getOptimizedRoute(accessToken: string): Promise<OptimizedRoute> {
  const res = await authFetch(`${API_BASE}/api/orders/optimized-route`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as OptimizedRoute
}

export interface OrderDetail extends OrderListItem {
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
