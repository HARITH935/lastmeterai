import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { OrderListItem, OptimizedRoute } from '../api/orders'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''
mapboxgl.accessToken = MAPBOX_TOKEN

const CHENNAI_CENTER: [number, number] = [80.220, 13.040] // [lng, lat]
const INITIAL_ZOOM = 12
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'

const RISK_COLOR: Record<string, string> = { low: '#10B981', medium: '#F59E0B', high: '#EF4444' }
const OWM_KEY = import.meta.env.VITE_OWM_KEY ?? '93ffaa6d46b4f1ba233e01d83955e17d'

function riskColor(level: string | null | undefined): string {
  if (!level) return '#94A3B8'
  return RISK_COLOR[level] ?? '#94A3B8'
}

function fmtEta(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── Geo math (coords are [lng, lat]) ────────────────────────────────────────────

const R = 6371000
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

function haversineM(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a, [lon2, lat2] = b
  const dlat = toRad(lat2 - lat1), dlon = toRad(lon2 - lon1)
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a, [lon2, lat2] = b
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function lerp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

// ── GeoJSON builders ────────────────────────────────────────────────────────────

function pinsGeoJSON(orders: OrderListItem[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: orders
      .filter(o => o.longitude != null && o.latitude != null)
      .map(o => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [o.longitude, o.latitude] },
        properties: {
          color: riskColor(o.risk_level), order_number: o.order_number,
          customer_name: o.customer_name, status: o.status,
        },
      })),
  }
}

// route_geometry is [lat, lon] (Leaflet order) → flip to [lon, lat] for Mapbox.
function routeLineGeoJSON(route: OptimizedRoute | null): GeoJSON.Feature {
  const coords = (route?.route_geometry ?? []).map(([lat, lon]) => [lon, lat])
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }
}

function stopsGeoJSON(route: OptimizedRoute | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (route?.stops ?? []).map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: {
        seq: s.sequence, color: riskColor(s.risk_level), order_number: s.order_number,
        customer_name: s.customer_name, address: s.customer_address, eta: s.eta,
        is_urgent: s.is_urgent, dur: s.duration_from_prev_min, dist: s.distance_from_prev_km,
      },
    })),
  }
}

function agentGeoJSON(pos: [number, number] | null): GeoJSON.FeatureCollection {
  if (!pos) return { type: 'FeatureCollection', features: [] }
  const [lat, lon] = pos
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} }],
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  orders:   OrderListItem[]
  route:    OptimizedRoute | null
  agentPos: [number, number] | null
  optimize: 'time' | 'distance'
  onOptimizeChange: (mode: 'time' | 'distance') => void
}

export function MapboxAgent({ orders, route, agentPos, optimize, onOptimizeChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const loadedRef    = useRef(false)
  const fittedRef    = useRef(false)

  // Navigation engine refs
  const vehicleRef   = useRef<mapboxgl.Marker | null>(null)
  const rafRef       = useRef<number | null>(null)
  const navRef       = useRef(false)

  const [showPins,    setShowPins]    = useState(true)
  const [showRoute,   setShowRoute]   = useState(true)
  const [showWeather, setShowWeather] = useState(false)
  const [navMode,     setNavMode]     = useState(false)

  // ── Init once ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current || !MAPBOX_TOKEN) return

    const map = new mapboxgl.Map({
      container: containerRef.current, style: MAP_STYLE,
      center: CHENNAI_CENTER, zoom: INITIAL_ZOOM, attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')
    mapRef.current = map

    map.on('load', () => {
      // Weather rasters
      map.addSource('owm-clouds', { type: 'raster', tiles: [`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`], tileSize: 256 })
      map.addSource('owm-precip', { type: 'raster', tiles: [`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`], tileSize: 256 })
      map.addLayer({ id: 'owm-clouds', type: 'raster', source: 'owm-clouds', paint: { 'raster-opacity': 0.5 }, layout: { visibility: 'none' } })
      map.addLayer({ id: 'owm-precip', type: 'raster', source: 'owm-precip', paint: { 'raster-opacity': 0.7 }, layout: { visibility: 'none' } })

      // Route line
      map.addSource('route', { type: 'geojson', data: routeLineGeoJSON(route) })
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#8B5CF6', 'line-width': 5, 'line-opacity': 0.85 },
      })

      // Non-route order pins
      map.addSource('pins', { type: 'geojson', data: pinsGeoJSON(orders) })
      map.addLayer({
        id: 'order-pins', type: 'circle', source: 'pins',
        paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#0f172a' },
      })

      // Route stops (numbered)
      map.addSource('stops', { type: 'geojson', data: stopsGeoJSON(route) })
      map.addLayer({
        id: 'stop-circles', type: 'circle', source: 'stops',
        paint: { 'circle-radius': 12, 'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      })
      map.addLayer({
        id: 'stop-labels', type: 'symbol', source: 'stops',
        layout: { 'text-field': ['get', 'seq'], 'text-size': 12, 'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#ffffff' },
      })

      // Agent position (pulsing blue dot)
      map.addSource('agent', { type: 'geojson', data: agentGeoJSON(agentPos) })
      map.addLayer({
        id: 'agent-halo', type: 'circle', source: 'agent',
        paint: { 'circle-radius': 18, 'circle-color': '#2563EB', 'circle-opacity': 0.25 },
      })
      map.addLayer({
        id: 'agent-dot', type: 'circle', source: 'agent',
        paint: { 'circle-radius': 8, 'circle-color': '#2563EB', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
      })

      loadedRef.current = true

      // Stop popups
      const popup = new mapboxgl.Popup({ closeButton: false, offset: 14 })
      map.on('click', 'stop-circles', e => {
        const p = e.features?.[0].properties
        if (!p) return
        popup.setLngLat((e.features![0].geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(
            `<div style="font-size:12px;line-height:1.6;min-width:170px">
              <strong>Stop ${p.seq} — ${p.order_number}</strong>${p.is_urgent === true || p.is_urgent === 'true' ? ' <span style="color:#EF4444;font-weight:700">⚠</span>' : ''}
              <br/>${p.customer_name}
              <br/>${p.address}
              <br/><span style="color:${p.color};font-weight:600">ETA ${fmtEta(p.eta)}</span>
              <span style="color:#64748b"> (${p.dur} min · ${p.dist} km)</span>
            </div>`,
          ).addTo(map)
      })
      map.on('mouseenter', 'stop-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'stop-circles', () => { map.getCanvas().style.cursor = '' })
    })

    return () => { map.remove(); mapRef.current = null; loadedRef.current = false; fittedRef.current = false }
  }, [])

  // ── Update sources on data change ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource('pins') as mapboxgl.GeoJSONSource | undefined)?.setData(pinsGeoJSON(orders))
  }, [orders])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource('route') as mapboxgl.GeoJSONSource | undefined)?.setData(routeLineGeoJSON(route))
    ;(map.getSource('stops') as mapboxgl.GeoJSONSource | undefined)?.setData(stopsGeoJSON(route))

    // Fit the map to the route once, when it first arrives.
    const coords = (route?.route_geometry ?? []).map(([lat, lon]) => [lon, lat] as [number, number])
    if (!fittedRef.current && coords.length > 1) {
      const b = coords.reduce((acc, c) => acc.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
      map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 800 })
      fittedRef.current = true
    }
  }, [route])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource('agent') as mapboxgl.GeoJSONSource | undefined)?.setData(agentGeoJSON(agentPos))
  }, [agentPos])

  // ── Toggles ────────────────────────────────────────────────────────────────
  function setVis(id: string, v: boolean) {
    const map = mapRef.current
    if (!map || !loadedRef.current || !map.getLayer(id)) return
    map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none')
  }
  useEffect(() => setVis('order-pins', showPins), [showPins])
  useEffect(() => { setVis('route-line', showRoute); setVis('stop-circles', showRoute); setVis('stop-labels', showRoute) }, [showRoute])
  useEffect(() => { setVis('owm-clouds', showWeather); setVis('owm-precip', showWeather) }, [showWeather])

  // ── Uber-style navigation engine ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    // Build the polyline in [lng, lat].
    const line = (route?.route_geometry ?? []).map(([lat, lon]) => [lon, lat] as [number, number])

    if (!navMode || line.length < 2) {
      // Stop navigation: cancel loop, drop vehicle, restore top-down view + dot.
      navRef.current = false
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (vehicleRef.current) { vehicleRef.current.remove(); vehicleRef.current = null }
      setVis('agent-dot', true); setVis('agent-halo', true)
      if (navMode && line.length < 2) setNavMode(false)  // nothing to navigate
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 })
      return
    }

    // Cumulative distances along the line.
    const segLen: number[] = []
    const cum: number[] = [0]
    for (let i = 0; i < line.length - 1; i++) {
      const d = haversineM(line[i], line[i + 1])
      segLen.push(d)
      cum.push(cum[i] + d)
    }
    const total = cum[cum.length - 1]
    if (total < 1) { setNavMode(false); return }

    // Speed so the trip plays in ~70s (clamped to a believable 8–22 m/s).
    const speed = Math.min(22, Math.max(8, total / 70))

    // Vehicle marker: a rotating navigation arrow.
    const el = document.createElement('div')
    el.innerHTML =
      `<svg width="36" height="36" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">
        <circle cx="12" cy="12" r="11" fill="#2563EB"/>
        <path d="M12 5 L17 18 L12 15 L7 18 Z" fill="#ffffff"/>
      </svg>`
    const vehicle = new mapboxgl.Marker({ element: el, rotationAlignment: 'viewport' })
      .setLngLat(line[0]).addTo(map)
    vehicleRef.current = vehicle

    // Hide the static dot while navigating.
    setVis('agent-dot', false); setVis('agent-halo', false)

    // Enter driver view.
    map.easeTo({ center: line[0], zoom: 16.2, pitch: 60, bearing: bearingDeg(line[0], line[1]), duration: 900 })

    navRef.current = true
    let traveled = 0
    let last = performance.now()

    const frame = (now: number) => {
      if (!navRef.current) return
      const dt = (now - last) / 1000
      last = now
      traveled = (traveled + speed * dt) % total

      // Locate current segment by cumulative distance.
      let i = 0
      while (i < segLen.length && cum[i + 1] < traveled) i++
      const segStart = cum[i]
      const t = segLen[i] > 0 ? (traveled - segStart) / segLen[i] : 0
      const pos = lerp(line[i], line[i + 1], t)
      const brg = bearingDeg(line[i], line[i + 1])

      vehicle.setLngLat(pos)
      map.jumpTo({ center: pos, bearing: brg, pitch: 60, zoom: 16.2 })

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      navRef.current = false
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (vehicleRef.current) { vehicleRef.current.remove(); vehicleRef.current = null }
    }
  }, [navMode, route])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center p-6" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="max-w-md text-center card dark:bg-slate-900 dark:border-slate-800">
          <p className="text-3xl mb-2">🗺️</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Map needs a Mapbox token</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Add <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">VITE_MAPBOX_TOKEN</code> to Vercel and redeploy.
          </p>
        </div>
      </div>
    )
  }

  const hasRoute = route && route.stops.length > 0

  return (
    <div className="relative" style={{ height: 'calc(100vh - 64px)' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Route optimization mode — top-left segmented control */}
      <div className="absolute top-3 left-3 z-[10] bg-slate-900/90 backdrop-blur-sm rounded-lg shadow-lg p-1 flex gap-1">
        {([
          { key: 'time',     label: '⚡ Fastest' },
          { key: 'distance', label: '📏 Shortest' },
        ] as const).map(m => (
          <button
            key={m.key}
            onClick={() => onOptimizeChange(m.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              optimize === m.key ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Layer panel */}
      <div className="absolute top-3 right-3 z-[10] flex flex-col gap-2">
        {[
          { on: showPins,    color: '#2563EB', set: () => setShowPins(p => !p),    label: 'Order Pins' },
          { on: showRoute,   color: '#8B5CF6', set: () => setShowRoute(r => !r),   label: showRoute ? 'Route ON' : 'My Route' },
          { on: showWeather, color: '#0EA5E9', set: () => setShowWeather(w => !w), label: showWeather ? '🌧 Weather ON' : 'Weather' },
        ].map(b => (
          <button
            key={b.label} onClick={b.set}
            style={b.on ? { backgroundColor: b.color } : undefined}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${
              b.on ? 'text-white border-transparent' : 'bg-white/90 text-slate-700 border-slate-200 hover:bg-white'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Route summary + navigation control */}
      {hasRoute && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[10] flex flex-col items-center gap-2">
          <div className="bg-slate-900/90 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full shadow-lg flex gap-4 items-center">
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
          <button
            onClick={() => setNavMode(n => !n)}
            className={`px-6 py-2.5 text-sm font-bold rounded-full shadow-xl transition-colors ${
              navMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white'
            }`}
          >
            {navMode ? '■ Exit Navigation' : '▶ Start Navigation'}
          </button>
        </div>
      )}
    </div>
  )
}
