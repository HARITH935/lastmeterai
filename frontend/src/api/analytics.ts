const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001'
import { authFetch } from './authFetch'

export interface DashboardCards {
  total_orders_today: number
  deliveries_completed: number
  high_risk_orders: number
  revenue_today: number
  estimated_savings: number
  active_agents: number
}

export interface DashboardResponse {
  cards: DashboardCards
  trends: {
    success_rate_over_time: { date: string; success_rate: number }[]
    failure_rate_by_area: { area: string; failure_rate: number }[]
    revenue_by_day: { date: string; revenue: number }[]
  }
}

export async function getDashboard(accessToken: string): Promise<DashboardResponse> {
  const res = await authFetch(`${API_BASE}/api/analytics/dashboard`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as DashboardResponse
}

export interface CostSavingsMetrics {
  total_orders: number
  go_count: number
  no_go_count: number
  deliveries_avoided: number
  fuel_saved_litres: number
  fuel_saved_inr: number
  failed_cost_avoided_inr: number
  total_savings_inr: number
  success_rate_with_ai: number
  baseline_success_rate: number
  improvement_pct: number
}

export interface CostSavingsResponse {
  period: string
  scope: string
  metrics: CostSavingsMetrics
}

export interface HeatmapZone {
  area: string
  lat: number
  lon: number
  order_count: number
  failure_rate: number
  predicted_failure_rate: number
  live_failure_rate: number
  risk_band: 'low' | 'medium' | 'high'
}

export interface HeatmapResponse {
  zones: HeatmapZone[]
}

export async function getHeatmap(accessToken: string): Promise<HeatmapResponse> {
  const res = await authFetch(`${API_BASE}/api/analytics/heatmap`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as HeatmapResponse
}

// ── KPI ────────────────────────────────────────────────────────────────────────

export interface AgentPerf {
  agent_id: number
  agent_name: string
  area: string
  order_count: number
  delivered_count: number
  success_rate: number
  performance_score: number
}

export interface AreaPerf {
  area: string
  total_orders: number
  success_count: number
  failure_count: number
  avg_risk_score: number
}

export interface KPIResponse {
  period: string
  summary: {
    avg_delivery_time_minutes: number
    failed_delivery_pct: number
    total_orders: number
    total_delivered: number
  }
  agent_performance: AgentPerf[]
  area_performance: AreaPerf[]
  weather_impact: {
    clear_days_success_rate: number
    rainy_days_success_rate: number
    clear_count: number
    rainy_count: number
  }
}

export async function getKPI(
  accessToken: string,
  period: 'week' | 'month' = 'week',
): Promise<KPIResponse> {
  const res = await authFetch(`${API_BASE}/api/analytics/kpi?period=${period}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as KPIResponse
}

// ── Weather impact ─────────────────────────────────────────────────────────────

export interface WeatherDay {
  date: string
  weather_condition: string
  success_rate: number
  order_count: number
}

export interface WeatherImpactResponse {
  period: string
  daily_correlation: WeatherDay[]
  summary: {
    clear_avg_success: number
    light_rain_avg_success: number
    heavy_rain_avg_success: number
    estimated_revenue_lost_to_weather_inr: number
  }
}

export async function getWeatherImpact(
  accessToken: string,
  period: 'week' | 'month' = 'week',
): Promise<WeatherImpactResponse> {
  const res = await authFetch(`${API_BASE}/api/analytics/weather-impact?period=${period}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as WeatherImpactResponse
}

export async function getCostSavings(
  accessToken: string,
  period: 'today' | 'week' | 'month' | 'all' = 'week',
): Promise<CostSavingsResponse> {
  const res = await authFetch(`${API_BASE}/api/analytics/cost-savings?period=${period}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as CostSavingsResponse
}

// ── Area intelligence ─────────────────────────────────────────────────────────

export const VALID_AREAS = ['Anna Nagar', 'T Nagar', 'Velachery', 'Adyar', 'Porur'] as const
export type AreaName = typeof VALID_AREAS[number]

export interface AreaIntelligenceResponse {
  area:                string
  success_rate:        number | null
  best_delivery_time:  'morning' | 'afternoon' | 'evening' | null
  rain_impact:         number | null
  weather_sensitivity: 'high' | 'medium' | 'low' | null
  risk_level:          'high' | 'medium' | 'low' | null
  predictions_by_time: {
    morning:   number | null
    afternoon: number | null
    evening:   number | null
  }
  model_available: boolean
}

export async function getAreaIntelligence(
  accessToken: string,
  area: string,
): Promise<AreaIntelligenceResponse> {
  const res = await authFetch(`${API_BASE}/api/analytics/area-intelligence/${encodeURIComponent(area)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as AreaIntelligenceResponse
}

// ── Customer insights ──────────────────────────────────────────────────────────

export interface CustomerInsightOrder {
  order_number: string
  date:         string   // YYYY-MM-DD
  status:       string
  time_window:  'morning' | 'afternoon' | 'evening'
}

export interface CustomerInsightResponse {
  address: string
  summary: {
    total_orders: number
    delivered:    number
    failed:       number
    postponed:    number
    success_rate: number  // 0.0–1.0
    risk_level:   'low' | 'medium' | 'high'
  }
  preferred_delivery_time: 'morning' | 'afternoon' | 'evening'
  recent_orders: CustomerInsightOrder[]   // capped at 5 by the backend
}

export async function getCustomerInsights(
  accessToken: string,
  address: string,
): Promise<CustomerInsightResponse> {
  const qs = new URLSearchParams({ address })
  const res = await authFetch(`${API_BASE}/api/analytics/customer?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as CustomerInsightResponse
}

// ── Leaderboard ────────────────────────────────────────────────────────────────

export interface LeaderboardAgent {
  rank: number
  agent_id: number
  agent_name: string
  area: string | null
  order_count: number
  delivered_count: number
  failed_count: number
  success_rate: number
  performance_score: number
  earnings_inr: number
}

export interface LeaderboardResponse {
  period: string
  agents: LeaderboardAgent[]
}

export async function getLeaderboard(
  accessToken: string,
  period: 'today' | 'week' | 'month' = 'week',
): Promise<LeaderboardResponse> {
  const res = await authFetch(`${API_BASE}/api/analytics/leaderboard?period=${period}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as LeaderboardResponse
}

// ── Daily AI Summary ───────────────────────────────────────────────────────────

export interface DailySummaryResponse {
  summary: string
  context: {
    total_orders_today: number
    delivered_today: number
    failed_today: number
    high_risk_orders: number
    worst_area: string
    worst_area_failure_rate_pct: number
    postpone_candidates: number
    weather: string
  }
  generated_at: string
}

export async function getDailySummary(accessToken: string): Promise<DailySummaryResponse> {
  const res = await authFetch(`${API_BASE}/api/analytics/daily-summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as DailySummaryResponse
}

// ── Live Weather ───────────────────────────────────────────────────────────────

export interface WeatherCurrent {
  condition: string
  description: string
  temp_c: number
  humidity_pct: number
  wind_kmh: number
  rain_1h_mm: number
  cloud_pct: number
  risk_score: number
  risk_level: 'low' | 'medium' | 'high'
  icon_code: string
}

export async function getCurrentWeather(accessToken: string): Promise<WeatherCurrent> {
  const res = await authFetch(`${API_BASE}/api/weather/current`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok) throw body
  return body as WeatherCurrent
}
