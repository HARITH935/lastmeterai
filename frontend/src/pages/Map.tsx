import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Circle, Popup } from 'react-leaflet'
import { useAuth } from '../contexts/AuthContext'
import { getHeatmap, type HeatmapZone, type HeatmapResponse } from '../api/analytics'
import { getAllOrders, getAgentOrders, type OrderListItem } from '../api/orders'

// ── Constants ──────────────────────────────────────────────────────────────────

// Chennai city centre — midpoint of the 5 area centroids
const CHENNAI_CENTER: [number, number] = [13.040, 80.220]
const INITIAL_ZOOM = 12

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const DARK_TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>'

// risk_level / risk_band → hex color (matches design tokens exactly)
const RISK_COLOR: Record<string, string> = {
  low:    '#10B981',  // text-go
  medium: '#F59E0B',  // text-urgent
  high:   '#EF4444',  // text-nogo
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

function riskColor(level: string | null): string {
  return RISK_COLOR[level ?? 'medium'] ?? '#94A3B8'
}

// ── Layer toggle panel ─────────────────────────────────────────────────────────

interface LayerPanelProps {
  showPins: boolean
  showHeatmap: boolean
  isManager: boolean
  onTogglePins: () => void
  onToggleHeatmap: () => void
}

function LayerPanel({ showPins, showHeatmap, isManager, onTogglePins, onToggleHeatmap }: LayerPanelProps) {
  const activeClass = 'text-white border-transparent'
  const inactiveClass = 'bg-white/90 text-slate-700 border-slate-200 hover:bg-white'

  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
      <button
        onClick={onTogglePins}
        style={showPins ? { backgroundColor: '#2563EB' } : undefined}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${
          showPins ? activeClass : inactiveClass
        }`}
      >
        Order Pins
      </button>
      {isManager && (
        <button
          onClick={onToggleHeatmap}
          style={showHeatmap ? { backgroundColor: '#EF4444' } : undefined}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${
            showHeatmap ? activeClass : inactiveClass
          }`}
        >
          Heatmap
        </button>
      )}
    </div>
  )
}

// ── Map view (success state) ───────────────────────────────────────────────────

interface MapViewProps {
  orders: OrderListItem[]
  zones: HeatmapZone[]
  isManager: boolean
}

function MapView({ orders, zones, isManager }: MapViewProps) {
  const [showPins, setShowPins] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)

  return (
    <div className="relative" style={{ height: 'calc(100vh - 64px)' }}>
      <MapContainer
        center={CHENNAI_CENTER}
        zoom={INITIAL_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer url={DARK_TILE_URL} attribution={DARK_TILE_ATTR} />

        {/* ── Heatmap circles (manager only, toggled off by default) ── */}
        {isManager && showHeatmap && zones.map(z => (
          <Circle
            key={z.area}
            center={[z.lat, z.lon]}
            // radius in metres: scales from 1 500 m (0% failure) to 5 500 m (100% failure)
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
                <br />
                Failure rate: {Math.round(z.failure_rate * 100)}%
                <br />
                Risk band: <strong>{z.risk_band}</strong>
                <br />
                Orders tracked: {z.order_count}
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
                <br />
                {o.customer_name}
                <br />
                Area: {o.area}
                <br />
                Status: {o.status.replace('_', ' ')}
                <br />
                Risk: <strong>{o.risk_level ?? '—'}</strong>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <LayerPanel
        showPins={showPins}
        showHeatmap={showHeatmap}
        isManager={isManager}
        onTogglePins={() => setShowPins(p => !p)}
        onToggleHeatmap={() => setShowHeatmap(h => !h)}
      />
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function Map() {
  const { user, access_token } = useAuth()
  const isManager = user?.role === 'manager'

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; orders: OrderListItem[]; zones: HeatmapZone[] }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    const fetch$ = isManager
      ? Promise.all([getAllOrders(access_token!), getHeatmap(access_token!)])
          .then(([ordersRes, heatmapRes]) => ({
            orders: ordersRes.data,
            zones:  heatmapRes.zones,
          }))
      : getAgentOrders(access_token!).then(res => ({
          orders: res.data,
          zones:  [] as HeatmapZone[],
        }))

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

  return <MapView orders={state.orders} zones={state.zones} isManager={isManager} />
}
