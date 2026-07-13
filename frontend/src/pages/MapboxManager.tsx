import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { OrderListItem } from '../api/orders'
import type { HeatmapZone } from '../api/analytics'
import { escapeHtml } from '../lib/escapeHtml'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''
mapboxgl.accessToken = MAPBOX_TOKEN

// ── Constants ──────────────────────────────────────────────────────────────────

const CHENNAI_CENTER: [number, number] = [80.220, 13.040] // [lng, lat] for Mapbox
const INITIAL_ZOOM = 11.5
const MAP_STYLE = 'mapbox://styles/mapbox/standard'

const RISK_COLOR: Record<string, string> = {
  low:    '#10B981',
  medium: '#F59E0B',
  high:   '#EF4444',
}

const OWM_KEY = import.meta.env.VITE_OWM_KEY ?? '93ffaa6d46b4f1ba233e01d83955e17d'

// ── GeoJSON builders ────────────────────────────────────────────────────────────

function ordersToGeoJSON(orders: OrderListItem[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: orders
      .filter(o => o.longitude != null && o.latitude != null)
      .map(o => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [o.longitude, o.latitude] },
        properties: {
          risk_level:     o.risk_level ?? 'none',
          color:          o.risk_level ? (RISK_COLOR[o.risk_level] ?? '#94A3B8') : '#94A3B8',
          order_number:   o.order_number,
          customer_name:  o.customer_name,
          status:         o.status,
          area:           o.area,
          is_urgent:      o.is_urgent,
        },
      })),
  }
}

function zonesToGeoJSON(zones: HeatmapZone[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map(z => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [z.lon, z.lat] },
      properties: {
        area:          z.area,
        failure_rate:  z.failure_rate,
        live_rate:     z.live_failure_rate ?? z.failure_rate,
        risk_band:     z.risk_band,
        color:         RISK_COLOR[z.risk_band] ?? '#94A3B8',
        order_count:   z.order_count,
      },
    })),
  }
}

// ── React overlays ───────────────────────────────────────────────────────────────

function LayerButton({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={active ? { backgroundColor: color } : undefined}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${
        active ? 'text-white border-transparent' : 'bg-white/90 text-slate-700 border-slate-200 hover:bg-white'
      }`}
    >
      {children}
    </button>
  )
}

function HeatmapLegend() {
  return (
    <div className="absolute bottom-6 left-3 z-[10] bg-slate-900/90 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-xl text-white">
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
      <p className="text-[10px] text-slate-500 mt-2">Circle size = failure rate</p>
    </div>
  )
}

function ZoneStatsPanel({ zones, onClose }: { zones: HeatmapZone[]; onClose: () => void }) {
  const sorted = [...zones].sort((a, b) => b.failure_rate - a.failure_rate)
  return (
    <div className="absolute top-3 left-3 z-[10] bg-slate-900/92 backdrop-blur-sm rounded-xl shadow-xl text-white w-56">
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
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
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

// ── Main component ───────────────────────────────────────────────────────────────

interface AgentMarker {
  agent_id: number
  agent_name: string | null
  lat: number
  lon: number
}

function agentsToGeoJSON(markers: Record<number, AgentMarker>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.values(markers).map(a => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: { agent_name: a.agent_name ?? `Agent ${a.agent_id}` },
    })),
  }
}

interface Props {
  orders: OrderListItem[]
  zones:  HeatmapZone[]
  agentMarkers: Record<number, AgentMarker>
}

export function MapboxManager({ orders, zones, agentMarkers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const loadedRef    = useRef(false)

  const [showPins,      setShowPins]      = useState(true)
  const [showHeatmap,   setShowHeatmap]   = useState(true)
  const [showWeather,   setShowWeather]   = useState(false)
  const [showAgents,    setShowAgents]    = useState(true)
  const [showZonePanel, setShowZonePanel] = useState(true)

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current || !MAPBOX_TOKEN) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CHENNAI_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')
    mapRef.current = map

    map.on('load', () => {
      // Weather raster (clouds + precipitation)
      map.addSource('owm-clouds', {
        type: 'raster', tiles: [`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`], tileSize: 256,
      })
      map.addSource('owm-precip', {
        type: 'raster', tiles: [`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`], tileSize: 256,
      })
      map.addLayer({ id: 'owm-clouds', type: 'raster', source: 'owm-clouds', paint: { 'raster-opacity': 0.5 }, layout: { visibility: 'none' } })
      map.addLayer({ id: 'owm-precip', type: 'raster', source: 'owm-precip', paint: { 'raster-opacity': 0.7 }, layout: { visibility: 'none' } })

      // Zone heatmap circles
      map.addSource('zones', { type: 'geojson', data: zonesToGeoJSON(zones) })
      map.addLayer({
        id: 'zone-circles',
        type: 'circle',
        source: 'zones',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'failure_rate'], 0, 26, 1, 70],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.28,
          'circle-blur': 0.6,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': 0.7,
        },
      })

      // Order pins
      map.addSource('orders', { type: 'geojson', data: ordersToGeoJSON(orders) })
      map.addLayer({
        id: 'order-pins',
        type: 'circle',
        source: 'orders',
        paint: {
          'circle-radius': ['case', ['get', 'is_urgent'], 8, 6],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f172a',
        },
      })

      // Live agent positions (halo + dot + name label)
      map.addSource('agents', { type: 'geojson', data: agentsToGeoJSON(agentMarkers) })
      map.addLayer({
        id: 'agent-halo', type: 'circle', source: 'agents',
        paint: { 'circle-radius': 16, 'circle-color': '#2563EB', 'circle-opacity': 0.22 },
      })
      map.addLayer({
        id: 'agent-dots', type: 'circle', source: 'agents',
        paint: { 'circle-radius': 7, 'circle-color': '#2563EB', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' },
      })
      map.addLayer({
        id: 'agent-names', type: 'symbol', source: 'agents',
        layout: {
          'text-field': ['get', 'agent_name'], 'text-size': 11, 'text-offset': [0, 1.4],
          'text-anchor': 'top', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: { 'text-color': '#e2e8f0', 'text-halo-color': '#0f172a', 'text-halo-width': 1.5 },
      })

      loadedRef.current = true

      // Popups
      const popup = new mapboxgl.Popup({ closeButton: false, offset: 12 })
      map.on('click', 'order-pins', e => {
        const p = e.features?.[0].properties
        if (!p) return
        popup.setLngLat((e.features![0].geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(
            `<div style="font-size:12px;line-height:1.6;min-width:150px">
              <strong>${escapeHtml(p.order_number)}</strong>${p.is_urgent === 'true' || p.is_urgent === true ? ' <span style="color:#EF4444;font-weight:700">⚠</span>' : ''}
              <br/>${escapeHtml(p.customer_name)}
              <br/>${escapeHtml(p.area)} · <span style="text-transform:capitalize">${escapeHtml(p.status)}</span>
              <br/><span style="color:${escapeHtml(p.color)};font-weight:600;text-transform:capitalize">${escapeHtml(p.risk_level)} risk</span>
            </div>`,
          ).addTo(map)
      })
      map.on('click', 'zone-circles', e => {
        const p = e.features?.[0].properties
        if (!p) return
        popup.setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px;line-height:1.6;min-width:150px">
              <strong>${escapeHtml(p.area)}</strong>
              <br/>Failure rate: <span style="color:${escapeHtml(p.color)};font-weight:700">${Math.round(p.failure_rate * 100)}%</span>
              <br/>Live: ${Math.round(p.live_rate * 100)}% · ${p.order_count} orders
            </div>`,
          ).addTo(map)
      })
      for (const layer of ['order-pins', 'zone-circles']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
    })

    return () => { map.remove(); mapRef.current = null; loadedRef.current = false }
  }, [])

  // ── Update data when props change ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource('orders') as mapboxgl.GeoJSONSource | undefined)?.setData(ordersToGeoJSON(orders))
  }, [orders])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource('zones') as mapboxgl.GeoJSONSource | undefined)?.setData(zonesToGeoJSON(zones))
  }, [zones])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource('agents') as mapboxgl.GeoJSONSource | undefined)?.setData(agentsToGeoJSON(agentMarkers))
  }, [agentMarkers])

  // ── Layer visibility toggles ─────────────────────────────────────────────────
  function setVis(id: string, visible: boolean) {
    const map = mapRef.current
    if (!map || !loadedRef.current || !map.getLayer(id)) return
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
  useEffect(() => setVis('order-pins', showPins),   [showPins])
  useEffect(() => setVis('zone-circles', showHeatmap), [showHeatmap])
  useEffect(() => { setVis('owm-clouds', showWeather); setVis('owm-precip', showWeather) }, [showWeather])
  useEffect(() => {
    setVis('agent-halo', showAgents); setVis('agent-dots', showAgents); setVis('agent-names', showAgents)
  }, [showAgents])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center p-6" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="max-w-md text-center card dark:bg-slate-900 dark:border-slate-800">
          <p className="text-3xl mb-2">🗺️</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Map needs a Mapbox token</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Add <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">VITE_MAPBOX_TOKEN</code> to
            your Vercel environment variables, then redeploy. The map will load automatically.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative" style={{ height: 'calc(100vh - 64px)' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Layer panel */}
      <div className="absolute top-3 right-3 z-[10] flex flex-col gap-2">
        <LayerButton active={showPins}    color="#2563EB" onClick={() => setShowPins(p => !p)}>Order Pins</LayerButton>
        <LayerButton active={showHeatmap} color="#EF4444" onClick={() => { setShowHeatmap(h => !h); setShowZonePanel(h => !h) }}>
          {showHeatmap ? '🔥 Heatmap ON' : 'Heatmap'}
        </LayerButton>
        <LayerButton active={showWeather} color="#0EA5E9" onClick={() => setShowWeather(w => !w)}>
          {showWeather ? '🌧 Weather ON' : 'Weather'}
        </LayerButton>
        <LayerButton active={showAgents} color="#2563EB" onClick={() => setShowAgents(a => !a)}>
          {`🚚 Agents (${Object.keys(agentMarkers).length})`}
        </LayerButton>
      </div>

      {showHeatmap && <HeatmapLegend />}
      {showZonePanel && zones.length > 0 && (
        <ZoneStatsPanel zones={zones} onClose={() => setShowZonePanel(false)} />
      )}
    </div>
  )
}
