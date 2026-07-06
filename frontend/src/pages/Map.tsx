import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Popup } from 'react-leaflet'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { getHeatmap, type HeatmapZone, type HeatmapResponse } from '../api/analytics'
import {
  getAllOrders, getAgentOrders, getOptimizedRoute,
  type OrderListItem, type OptimizedRoute, type RouteStop,
} from '../api/orders'

// ── Constants ──────────────────────────────────────────────────────────────────

const CHENNAI_CENTER: [number, number] = [13.040, 80.220]
const INITIAL_ZOOM = 12

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const DARK_TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>'

// risk_level / risk_band → hex color (matches design tokens: text-go / text-urgent / text-nogo)
const RISK_COLOR: Record<string, string> = {
  low:    '#10B981',
  medium: '#F59E0B',
  high:   '#EF4444',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function riskColor(level: string | null | undefined): string {
  if (!level) return '#94A3B8'  // slate — unassessed, not a risk signal
  return RISK_COLOR[level] ?? '#94A3B8'
}

function fmtEta(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── Layer toggle panel ─────────────────────────────────────────────────────────

interface LayerPanelProps {
  showPins: boolean
  showHeatmap: boolean
  showRoute: boolean
  isManager: boolean
  onTogglePins: () => void
  onToggleHeatmap: () => void
  onToggleRoute: () => void
}

function LayerPanel({
  showPins, showHeatmap, showRoute, isManager,
  onTogglePins, onToggleHeatmap, onToggleRoute,
}: LayerPanelProps) {
  const active   = 'text-white border-transparent'
  const inactive = 'bg-white/90 text-slate-700 border-slate-200 hover:bg-white'

  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
      <button
        onClick={onTogglePins}
        style={showPins ? { backgroundColor: '#2563EB' } : undefined}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${showPins ? active : inactive}`}
      >
        Order Pins
      </button>
      {!isManager && (
        <button
          onClick={onToggleRoute}
          style={showRoute ? { backgroundColor: '#8B5CF6' } : undefined}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${showRoute ? active : inactive}`}
        >
          My Route
        </button>
      )}
      {isManager && (
        <button
          onClick={onToggleHeatmap}
          style={showHeatmap ? { backgroundColor: '#EF4444' } : undefined}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${showHeatmap ? active : inactive}`}
        >
          {showHeatmap ? '🔥 Heatmap ON' : 'Heatmap'}
        </button>
      )}
    </div>
  )
}

// ── Heatmap legend ─────────────────────────────────────────────────────────────

function HeatmapLegend() {
  return (
    <div className="absolute bottom-6 left-3 z-[1000] bg-slate-900/90 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-xl text-white">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Failure Risk</p>
      {[
        { color: '#10B981', label: 'Low  (< 20%)' },
        { color: '#F59E0B', label: 'Medium (20–40%)' },
        { color: '#EF4444', label: 'High  (> 40%)' },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-2 mb-1 last:mb-0">
          <div className="w-3 h-3 rounded-full opacity-80" style={{ backgroundColor: color }} />
          <span className="text-[11px] text-slate-200">{label}</span>
        </div>
      ))}
      <p className="text-[10px] text-slate-500 mt-2">Circle size = order volume</p>
    </div>
  )
}

// ── Zone stats panel ───────────────────────────────────────────────────────────

function ZoneStatsPanel({ zones, onClose }: { zones: HeatmapZone[]; onClose: () => void }) {
  const sorted = [...zones].sort((a, b) => b.failure_rate - a.failure_rate)

  return (
    <div className="absolute top-3 left-3 z-[1000] bg-slate-900/92 backdrop-blur-sm rounded-xl shadow-xl text-white w-56">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-slate-700">
        <p className="text-xs font-semibold text-white">Zone Risk Ranking</p>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs px-1">×</button>
      </div>
      <div className="p-2 space-y-1.5">
        {sorted.map((z, i) => {
          const pct = Math.round(z.failure_rate * 100)
          const color = RISK_COLOR[z.risk_band] ?? '#94A3B8'
          return (
            <div key={z.area} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-4 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-slate-200 truncate">{z.area}</span>
                  <span className="text-[10px] font-bold ml-1 shrink-0" style={{ color }}>{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{z.order_count} orders · {z.risk_band} risk</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Map view (success state) ───────────────────────────────────────────────────

interface AgentMarker {
  agent_id: number
  agent_name: string | null
  lat: number
  lon: number
}

interface MapViewProps {
  orders:        OrderListItem[]
  zones:         HeatmapZone[]
  isManager:     boolean
  route:         OptimizedRoute | null
  agentPos:      [number, number] | null
  agentMarkers:  Record<number, AgentMarker>
}

function MapView({ orders, zones, isManager, route, agentPos, agentMarkers }: MapViewProps) {
  const [showPins,      setShowPins]      = useState(true)
  const [showHeatmap,   setShowHeatmap]   = useState(isManager)  // ON by default for managers
  const [showRoute,     setShowRoute]     = useState(true)
  const [showZonePanel, setShowZonePanel] = useState(isManager)

  const hasRoute = route && route.stops.length > 0

  const routeOrderIds = new Set((route?.stops ?? []).map(s => s.order_id))

  // Toggle heatmap + zone panel together
  function toggleHeatmap() {
    setShowHeatmap(h => {
      if (h) setShowZonePanel(false)
      else   setShowZonePanel(true)
      return !h
    })
  }

  return (
    <div className="relative" style={{ height: 'calc(100vh - 64px)' }}>
      <MapContainer
        center={CHENNAI_CENTER}
        zoom={INITIAL_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer url={DARK_TILE_URL} attribution={DARK_TILE_ATTR} />

        {/* ── Heatmap circles (manager only) ── */}
        {isManager && showHeatmap && zones.map(z => {
          const color = RISK_COLOR[z.risk_band] ?? '#94A3B8'
          const pct   = Math.round(z.failure_rate * 100)
          const livePct = Math.round((z.live_failure_rate ?? z.failure_rate) * 100)
          return (
            <Circle
              key={z.area}
              center={[z.lat, z.lon]}
              radius={1800 + z.failure_rate * 5000}
              pathOptions={{
                color,
                fillColor:   color,
                fillOpacity: 0.25,
                weight:      2,
              }}
            >
              <Popup>
                <div style={{ fontFamily: 'system-ui', minWidth: 180 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{z.area}</p>
                  {/* Failure rate bar */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: '#64748b' }}>ML predicted failure</span>
                      <strong style={{ color }}>{pct}%</strong>
                    </div>
                    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.8 }}>
                    <div>Live failure rate: <strong>{livePct}%</strong></div>
                    <div>Risk band: <strong style={{ color }}>{z.risk_band}</strong></div>
                    <div>Orders tracked: <strong>{z.order_count}</strong></div>
                  </div>
                </div>
              </Popup>
            </Circle>
          )
        })}

        {/* ── Order pins ──
            For agents: skip pins that are already shown as route stop markers.
            Non-active orders (failed/delivered/postponed) show as muted gray
            so the agent can see them but knows they aren't in today's route. */}
        {showPins && orders
          .filter(o => !(!isManager && routeOrderIds.has(o.id)))
          .map(o => {
            const isActive = o.status === 'pending' || o.status === 'in_transit'
            const pinColor = isActive ? riskColor(o.risk_level) : '#64748B'
            return (
              <CircleMarker
                key={o.id}
                center={[o.latitude, o.longitude]}
                radius={6}
                pathOptions={{
                  color:       pinColor,
                  fillColor:   pinColor,
                  fillOpacity: isActive ? 0.75 : 0.35,
                  weight:      1.5,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 12, lineHeight: 1.7, minWidth: 150 }}>
                    <strong style={{ fontSize: 13 }}>{o.order_number}</strong>
                    <br />{o.customer_name}
                    <br />Area: {o.area}
                    <br />Status: {o.status.replace('_', ' ')}
                    <br />Risk: <strong>{o.risk_level ?? '—'}</strong>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })
        }

        {/* ── Optimized route (agent view) ── */}
        {!isManager && showRoute && hasRoute && (
          <>
            {/* Route polyline — use road geometry from OSRM when available,
                fall back to straight lines between stop coordinates. */}
            {(() => {
              const geo: [number, number][] =
                route.route_geometry.length > 1
                  ? (route.route_geometry as [number, number][])
                  : [
                      ...(agentPos ? [agentPos] : []),
                      ...route.stops.map((s): [number, number] => [s.latitude, s.longitude]),
                    ]
              return geo.length > 1 ? (
                <Polyline
                  positions={geo}
                  pathOptions={{ color: '#8B5CF6', weight: 3, opacity: 0.85, dashArray: '10,5' }}
                />
              ) : null
            })()}

            {/* Stop markers with sequence numbers and ETA labels */}
            {route.stops.map((stop: RouteStop) => (
              <CircleMarker
                key={stop.order_id}
                center={[stop.latitude, stop.longitude]}
                radius={9}
                pathOptions={{
                  color:       riskColor(stop.risk_level),
                  fillColor:   riskColor(stop.risk_level),
                  fillOpacity: 0.90,
                  weight:      2,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 12, lineHeight: 1.8, minWidth: 170 }}>
                    <strong style={{ fontSize: 13 }}>
                      Stop {stop.sequence} — {stop.order_number}
                    </strong>
                    <br />{stop.customer_name}
                    <br />{stop.customer_address}
                    <br />
                    <span style={{ color: riskColor(stop.risk_level), fontWeight: 600 }}>
                      ETA: {fmtEta(stop.eta)}
                    </span>
                    {' '}
                    <span style={{ color: '#64748b' }}>
                      ({stop.duration_from_prev_min} min · {stop.distance_from_prev_km} km)
                    </span>
                    {stop.is_urgent && (
                      <><br /><span style={{ color: '#EF4444', fontWeight: 700 }}>⚠ URGENT</span></>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Agent's own position marker */}
            {agentPos && (
              <CircleMarker
                center={agentPos}
                radius={11}
                pathOptions={{
                  color:       '#2563EB',
                  fillColor:   '#2563EB',
                  fillOpacity: 0.95,
                  weight:      3,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 12 }}>
                    <strong>You are here</strong>
                    <br />
                    {route.traffic_factor > 1.1
                      ? `Traffic ×${route.traffic_factor.toFixed(1)}`
                      : 'Traffic: clear'}
                    {' · '}
                    Weather risk: {Math.round(route.weather_risk * 100)}%
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </>
        )}

        {/* ── Live agent position markers (manager view) ── */}
        {isManager && Object.values(agentMarkers).map(a => (
          <CircleMarker
            key={a.agent_id}
            center={[a.lat, a.lon]}
            radius={10}
            pathOptions={{
              color:       '#2563EB',
              fillColor:   '#2563EB',
              fillOpacity: 0.9,
              weight:      2,
            }}
          >
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>{a.agent_name ?? `Agent ${a.agent_id}`}</strong>
                <br />Live position
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <LayerPanel
        showPins={showPins}
        showHeatmap={showHeatmap}
        showRoute={showRoute}
        isManager={isManager}
        onTogglePins={() => setShowPins(p => !p)}
        onToggleHeatmap={toggleHeatmap}
        onToggleRoute={() => setShowRoute(r => !r)}
      />

      {/* Heatmap legend — bottom left */}
      {isManager && showHeatmap && <HeatmapLegend />}

      {/* Zone stats panel — top left */}
      {isManager && showZonePanel && zones.length > 0 && (
        <ZoneStatsPanel zones={zones} onClose={() => setShowZonePanel(false)} />
      )}

      {/* Route summary bar (agent only) */}
      {!isManager && hasRoute && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full shadow-lg flex gap-4 items-center">
          <span><strong>{route.stops.length}</strong> stops</span>
          <span>·</span>
          <span><strong>{route.total_distance_km} km</strong></span>
          <span>·</span>
          <span><strong>{route.total_duration_min} min</strong></span>
          {route.traffic_factor > 1.1 && (
            <>
              <span>·</span>
              <span style={{ color: '#F59E0B' }}>Traffic ×{route.traffic_factor.toFixed(1)}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Map() {
  const { user, access_token } = useAuth()
  const { socket } = useSocket()
  const isManager = user?.role === 'manager'
  const isAgent   = user?.role === 'agent'

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; orders: OrderListItem[]; zones: HeatmapZone[] }
  >({ status: 'loading' })

  const [route,        setRoute]        = useState<OptimizedRoute | null>(null)
  const [agentPos,     setAgentPos]     = useState<[number, number] | null>(null)
  const [agentMarkers, setAgentMarkers] = useState<Record<number, AgentMarker>>({})

  // ── Fetch orders + heatmap ──────────────────────────────────────────────────
  useEffect(() => {
    if (!access_token) return
    let cancelled = false

    const fetch$ = isManager
      ? Promise.all([getAllOrders(access_token), getHeatmap(access_token)])
          .then(([ordersRes, heatmapRes]) => ({ orders: ordersRes.data, zones: heatmapRes.zones }))
      : getAgentOrders(access_token).then(res => ({ orders: res.data, zones: [] as HeatmapZone[] }))

    fetch$
      .then(({ orders, zones }) => {
        if (!cancelled) setState({ status: 'success', orders, zones })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Unable to load map data.'
          setState({ status: 'error', message: msg })
        }
      })

    return () => { cancelled = true }
  }, [access_token, isManager])

  // ── Fetch optimized route (agent only) ─────────────────────────────────────
  useEffect(() => {
    if (!isAgent || !access_token) return
    let cancelled = false

    getOptimizedRoute(access_token)
      .then(r => {
        if (!cancelled) {
          setRoute(r)
          if (r.start_location) {
            setAgentPos([r.start_location.lat, r.start_location.lon])
          }
        }
      })
      .catch(() => {}) // non-fatal — map still shows order pins without route

    return () => { cancelled = true }
  }, [isAgent, access_token])

  // ── Socket: route_updated (agent) + agent_location (manager) ───────────────
  // Track socket.id in a ref to detect stale closures on socket reconnect.
  const socketIdRef = useRef<string | undefined>()

  useEffect(() => {
    if (!socket) return

    if (isAgent) {
      const onRouteUpdated = (data: OptimizedRoute) => {
        setRoute(data)
        if (data.start_location) {
          setAgentPos([data.start_location.lat, data.start_location.lon])
        }
      }
      socket.on('route_updated', onRouteUpdated)
      return () => { socket.off('route_updated', onRouteUpdated) }
    }

    if (isManager) {
      const onAgentLocation = (data: AgentMarker) => {
        setAgentMarkers(prev => ({ ...prev, [data.agent_id]: data }))
      }
      socket.on('agent_location', onAgentLocation)
      return () => { socket.off('agent_location', onAgentLocation) }
    }
  }, [socket, isAgent, isManager])

  // ── Emit simulated agent location every 15 s (agent only) ─────────────────
  // Uses the route's start_location as a fixed position (no real GPS in this app).
  // In production, replace with navigator.geolocation.watchPosition().
  useEffect(() => {
    if (!isAgent || !socket || !agentPos) return

    const [lat, lon] = agentPos

    socket.emit('agent_location_update', { lat, lon })

    const id = setInterval(() => {
      socket.emit('agent_location_update', { lat, lon })
    }, 15_000)

    return () => clearInterval(id)
  }, [isAgent, socket, agentPos])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state.status === 'loading') {
    return (
      <div className="p-6">
        <div className="animate-pulse bg-slate-200 rounded-xl" style={{ height: 'calc(100vh - 120px)' }} />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="p-6">
        <div className="card border-nogo/30 bg-red-50">
          <p className="text-sm font-semibold text-nogo">Failed to load map data</p>
          <p className="text-xs text-nogo/80 mt-1">{state.message}</p>
        </div>
      </div>
    )
  }

  return (
    <MapView
      orders={state.orders}
      zones={state.zones}
      isManager={isManager}
      route={route}
      agentPos={agentPos}
      agentMarkers={agentMarkers}
    />
  )
}
