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
  return RISK_COLOR[level ?? 'medium'] ?? '#94A3B8'
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
          Heatmap
        </button>
      )}
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
  const [showPins,    setShowPins]    = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showRoute,   setShowRoute]   = useState(true)

  const hasRoute = route && route.stops.length > 0

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
        {isManager && showHeatmap && zones.map(z => (
          <Circle
            key={z.area}
            center={[z.lat, z.lon]}
            radius={1500 + z.failure_rate * 4000}
            pathOptions={{
              color:       riskColor(z.risk_band),
              fillColor:   riskColor(z.risk_band),
              fillOpacity: 0.22,
              weight:      1.5,
            }}
          >
            <Popup>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                <strong style={{ fontSize: 13 }}>{z.area}</strong>
                <br />Failure rate: {Math.round(z.failure_rate * 100)}%
                <br />Risk band: <strong>{z.risk_band}</strong>
                <br />Orders tracked: {z.order_count}
              </div>
            </Popup>
          </Circle>
        ))}

        {/* ── Order pins ── */}
        {showPins && orders.map(o => (
          <CircleMarker
            key={o.id}
            center={[o.latitude, o.longitude]}
            radius={7}
            pathOptions={{
              color:       riskColor(o.risk_level),
              fillColor:   riskColor(o.risk_level),
              fillOpacity: 0.85,
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
        ))}

        {/* ── Optimized route (agent view) ── */}
        {!isManager && showRoute && hasRoute && (
          <>
            {/* Route polyline */}
            {route.route_geometry.length > 1 && (
              <Polyline
                positions={route.route_geometry as [number, number][]}
                pathOptions={{ color: '#8B5CF6', weight: 3, opacity: 0.85, dashArray: '10,5' }}
              />
            )}

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
                  color:       '#F59E0B',
                  fillColor:   '#F59E0B',
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
              color:       '#F59E0B',
              fillColor:   '#F59E0B',
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
        onToggleHeatmap={() => setShowHeatmap(h => !h)}
        onToggleRoute={() => setShowRoute(r => !r)}
      />

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
