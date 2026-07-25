import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { OrderListItem, OptimizedRoute } from '../api/orders'
import { escapeHtml } from '../lib/escapeHtml'
import '../styles/mapChrome.css'
import styles from './MapboxAgent.module.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''
mapboxgl.accessToken = MAPBOX_TOKEN

const CHENNAI_CENTER: [number, number] = [80.220, 13.040] // [lng, lat]
const INITIAL_ZOOM = 12
const MAP_STYLE = 'mapbox://styles/mapbox/standard'

// Map is a committed dark environment (night light-preset) — same
// dark-mode-validated risk hues used elsewhere (Dashboard's dark theme).
const RISK_COLOR: Record<string, string> = { low: '#1FA971', medium: '#C1841A', high: '#E35B52' }
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

// Maneuver-type → icon for the instruction banner.
const MANEUVER_ICON: Record<string, string> = {
  turn: '↱', 'turn-left': '↰', 'turn-right': '↱', 'sharp left': '⬅', 'sharp right': '➡',
  merge: '⤵', 'roundabout': '↻', 'depart': '▲', 'arrive': '🏁', continue: '↑',
  'new name': '↑', 'end of road': '↱', fork: 'Y',
}
function maneuverIcon(type: string, modifier?: string): string {
  if (type === 'arrive') return '🏁'
  if (type === 'depart') return '▲'
  if (modifier?.includes('left')) return '↰'
  if (modifier?.includes('right')) return '↱'
  if (modifier === 'straight' || type === 'continue') return '↑'
  return MANEUVER_ICON[type] ?? '↑'
}

interface NavStep { dist: number; instruction: string; type: string; modifier?: string }
interface RawStep { location: [number, number]; instruction: string; type: string; modifier?: string }

// Fetch real turn-by-turn maneuvers from the Mapbox Directions API.
// Only the maneuver LOCATIONS + text are used — the vehicle follows the
// backend route geometry (which already honors Fastest/Shortest), so
// instructions are mapped onto that line rather than Mapbox's own path.
async function fetchDirections(
  waypoints: [number, number][],
): Promise<{ steps: RawStep[]; duration: number; geometry: [number, number][] } | null> {
  const coordStr = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
    `?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const route = data.routes?.[0]
  if (!route) return null

  const steps: RawStep[] = []
  for (const leg of route.legs ?? []) {
    for (const s of leg.steps ?? []) {
      steps.push({
        location: s.maneuver.location,
        instruction: s.maneuver.instruction,
        type: s.maneuver.type,
        modifier: s.maneuver.modifier,
      })
    }
  }
  // geojson geometry coordinates are already [lng, lat].
  const geometry: [number, number][] = route.geometry?.coordinates ?? []
  return { steps, duration: route.duration, geometry }
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
  // When set (via /map?order=<id> deep-link), auto-navigate to just this one
  // order instead of following the full optimized multi-stop route.
  focusOrderId?: number | null
}

export function MapboxAgent({ orders, route, agentPos, optimize, onOptimizeChange, focusOrderId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const loadedRef    = useRef(false)
  const fittedRef    = useRef(false)

  // Navigation engine refs
  const vehicleRef   = useRef<mapboxgl.Marker | null>(null)
  const rafRef       = useRef<number | null>(null)
  const navRef       = useRef(false)
  // Camera-follow: while true the camera tracks the vehicle (Gmap-style). A user
  // pan sets it false so the map can be explored; the Re-center button restores it.
  const followRef    = useRef(true)
  const lastPosRef   = useRef<[number, number] | null>(null)
  const lastBrgRef   = useRef(0)
  // Timestamp until which no new camera ease should be issued — prevents the
  // edge-follow from restarting easeTo every frame (which freezes the camera).
  const easeUntilRef = useRef(0)

  const [showPins,    setShowPins]    = useState(true)
  const [showRoute,   setShowRoute]   = useState(true)
  const [showWeather, setShowWeather] = useState(false)
  const [showTraffic, setShowTraffic] = useState(true)
  const [navMode,     setNavMode]     = useState(false)
  const [following,   setFollowing]   = useState(true)
  const [nav,         setNav]         = useState<
    { icon: string; instruction: string; distToNext: number; remainMin: number; remainKm: number } | null
  >(null)

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
      // Standard style's configurable light preset — commit to a dark
      // "night" look matching the app's navy/gold chrome.
      map.setConfigProperty('basemap', 'lightPreset', 'night')

      // Weather rasters
      map.addSource('owm-clouds', { type: 'raster', tiles: [`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`], tileSize: 256 })
      map.addSource('owm-precip', { type: 'raster', tiles: [`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`], tileSize: 256 })
      map.addLayer({ id: 'owm-clouds', type: 'raster', source: 'owm-clouds', paint: { 'raster-opacity': 0.5 }, layout: { visibility: 'none' } })
      map.addLayer({ id: 'owm-precip', type: 'raster', source: 'owm-precip', paint: { 'raster-opacity': 0.7 }, layout: { visibility: 'none' } })

      // Live traffic overlay — two-tone: neutral for normal flow, red only where
      // congested. Thin + only rendered where there's a real slowdown, so it
      // stays out of the way instead of covering the whole map in color.
      map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' })
      map.addLayer({
        id: 'traffic-flow', type: 'line', source: 'mapbox-traffic', 'source-layer': 'traffic',
        filter: ['in', ['get', 'congestion'], ['literal', ['moderate', 'heavy', 'severe']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': 2,
          'line-opacity': 0.7,
          'line-color': [
            'match', ['get', 'congestion'],
            'moderate', '#8290A3',
            '#E35B52',
          ],
          'line-emissive-strength': 1,
        },
      })

      // Route line
      // 'emissive-strength' properties below counter Standard style's night
      // light-preset, which otherwise scene-dims every custom layer's color.
      map.addSource('route', { type: 'geojson', data: routeLineGeoJSON(route) })
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#D9A54B', 'line-width': 5, 'line-opacity': 0.85, 'line-emissive-strength': 1 },
      })

      // Non-route order pins — soft glow halo so risk color reads clearly
      // (a dark stroke on a 5px fill was visually swallowing the color).
      map.addSource('pins', { type: 'geojson', data: pinsGeoJSON(orders) })
      map.addLayer({
        id: 'order-pins-glow', type: 'circle', source: 'pins',
        paint: { 'circle-radius': 13, 'circle-color': ['get', 'color'], 'circle-opacity': 0.4, 'circle-blur': 0.9, 'circle-emissive-strength': 1 },
      })
      map.addLayer({
        id: 'order-pins', type: 'circle', source: 'pins',
        paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1.2, 'circle-stroke-color': '#F3ECDA', 'circle-stroke-opacity': 0.9, 'circle-emissive-strength': 1 },
      })

      // Route stops (numbered)
      map.addSource('stops', { type: 'geojson', data: stopsGeoJSON(route) })
      map.addLayer({
        id: 'stop-circles', type: 'circle', source: 'stops',
        paint: { 'circle-radius': 12, 'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#F3ECDA', 'circle-emissive-strength': 1 },
      })
      map.addLayer({
        id: 'stop-labels', type: 'symbol', source: 'stops',
        layout: { 'text-field': ['get', 'seq'], 'text-size': 12, 'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#0E2038' },
      })

      // Agent position (pulsing gold dot)
      map.addSource('agent', { type: 'geojson', data: agentGeoJSON(agentPos) })
      map.addLayer({
        id: 'agent-halo', type: 'circle', source: 'agent',
        paint: { 'circle-radius': 18, 'circle-color': '#D9A54B', 'circle-opacity': 0.25, 'circle-emissive-strength': 1 },
      })
      map.addLayer({
        id: 'agent-dot', type: 'circle', source: 'agent',
        paint: { 'circle-radius': 8, 'circle-color': '#D9A54B', 'circle-stroke-width': 3, 'circle-stroke-color': '#F3ECDA', 'circle-emissive-strength': 1 },
      })

      loadedRef.current = true

      // Stop popups
      const popup = new mapboxgl.Popup({ closeButton: false, offset: 14 })
      map.on('click', 'stop-circles', e => {
        const p = e.features?.[0].properties
        if (!p) return
        popup.setLngLat((e.features![0].geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(
            `<div style="font-family:'LM Plex Sans',sans-serif;font-size:12px;line-height:1.6;min-width:170px">
              <strong>Stop ${escapeHtml(p.seq)} — ${escapeHtml(p.order_number)}</strong>${p.is_urgent === true || p.is_urgent === 'true' ? ' <span style="color:#E35B52;font-weight:700">⚠</span>' : ''}
              <br/>${escapeHtml(p.customer_name)}
              <br/>${escapeHtml(p.address)}
              <br/><span style="color:${escapeHtml(p.color)};font-weight:600">ETA ${escapeHtml(fmtEta(p.eta))}</span>
              <span style="color:#8290A3"> (${p.dur} min · ${p.dist} km)</span>
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
  useEffect(() => { setVis('order-pins', showPins); setVis('order-pins-glow', showPins) }, [showPins])
  useEffect(() => { setVis('route-line', showRoute); setVis('stop-circles', showRoute); setVis('stop-labels', showRoute) }, [showRoute])
  useEffect(() => { setVis('owm-clouds', showWeather); setVis('owm-precip', showWeather) }, [showWeather])
  useEffect(() => setVis('traffic-flow', showTraffic), [showTraffic])

  // ── Uber-style navigation engine (with turn-by-turn) ───────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    let cancelled = false

    // Any user pan/zoom (originalEvent present) breaks camera-follow so the map
    // can be explored freely; programmatic jumpTo has no originalEvent.
    let onUserGesture: ((e: { originalEvent?: unknown }) => void) | null = null

    const stop = () => {
      navRef.current = false
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (vehicleRef.current) { vehicleRef.current.remove(); vehicleRef.current = null }
      if (onUserGesture) {
        map.off('dragstart', onUserGesture)
        map.off('zoomstart', onUserGesture)
        onUserGesture = null
      }
      setVis('agent-dot', true); setVis('agent-halo', true)
    }

    if (!navMode) {
      stop()
      setNav(null)
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 })
      return
    }

    // Determine navigation target:
    //   focusOrderId set → single-order nav (agent start → that one order)
    //   otherwise        → full optimized multi-stop route
    const focusOrder = focusOrderId != null
      ? orders.find(o => o.id === focusOrderId && o.longitude != null && o.latitude != null)
      : null

    // Origin is the stable agent start (depot), not the live GPS dot — avoids
    // restarting navigation every time the simulated position ticks.
    const origin: [number, number] | null = route?.start_location
      ? [route.start_location.lon, route.start_location.lat]
      : null

    // Ordered waypoints in [lng, lat].
    const wp: [number, number][] = []
    if (origin) wp.push(origin)
    if (focusOrder) {
      wp.push([focusOrder.longitude, focusOrder.latitude])
    } else {
      for (const s of route?.stops ?? []) wp.push([s.longitude, s.latitude])
    }
    if (wp.length < 2) { setNavMode(false); return }

    const run = (line: [number, number][], rawSteps: RawStep[], totalDurationS: number) => {
      if (cancelled || line.length < 2) { setNavMode(false); return }

      const segLen: number[] = []
      const cum: number[] = [0]
      for (let i = 0; i < line.length - 1; i++) {
        const d = haversineM(line[i], line[i + 1])
        segLen.push(d); cum.push(cum[i] + d)
      }
      const total = cum[cum.length - 1]
      if (total < 1) { setNavMode(false); return }

      // Map each Mapbox maneuver onto the backend line by nearest vertex, so the
      // turn instructions track the exact route the vehicle is driving.
      const steps: NavStep[] = rawSteps.map(s => {
        let best = 0, bd = Infinity
        for (let i = 0; i < line.length; i++) {
          const d = haversineM(line[i], s.location)
          if (d < bd) { bd = d; best = i }
        }
        return { dist: cum[best], instruction: s.instruction, type: s.type, modifier: s.modifier }
      }).sort((a, b) => a.dist - b.dist)

      const speed = Math.min(22, Math.max(8, total / 70)) // ~70s trip

      const el = document.createElement('div')
      el.innerHTML =
        `<svg width="36" height="36" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))">
          <circle cx="12" cy="12" r="11" fill="#D9A54B"/><path d="M12 5 L17 18 L12 15 L7 18 Z" fill="#241503"/>
        </svg>`
      const vehicle = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat(line[0]).addTo(map)
      vehicle.setRotation(bearingDeg(line[0], line[1]))
      vehicleRef.current = vehicle
      setVis('agent-dot', false); setVis('agent-halo', false)
      // North-up so the arrow visibly travels across the map (the arrow itself
      // rotates to the heading, instead of the map pinning itself to the arrow).
      map.easeTo({ center: line[0], zoom: 15.5, pitch: 0, bearing: 0, duration: 900 })

      // Start in follow mode; a user pan/zoom releases it (Re-center to resume).
      followRef.current = true
      setFollowing(true)
      onUserGesture = (e) => {
        if (e.originalEvent && followRef.current) {
          followRef.current = false
          setFollowing(false)
        }
      }
      map.on('dragstart', onUserGesture)
      map.on('zoomstart', onUserGesture)

      navRef.current = true
      let traveled = 0
      let last = performance.now()
      let lastPanel = 0

      const frame = (now: number) => {
        if (!navRef.current) return
        const dt = (now - last) / 1000
        last = now
        traveled = (traveled + speed * dt) % total

        let i = 0
        while (i < segLen.length && cum[i + 1] < traveled) i++
        const t = segLen[i] > 0 ? (traveled - cum[i]) / segLen[i] : 0
        const pos = lerp(line[i], line[i + 1], t)
        const brg = bearingDeg(line[i], line[i + 1])

        vehicle.setLngLat(pos)
        vehicle.setRotation(brg)          // arrow points in the direction of travel
        lastPosRef.current = pos
        lastBrgRef.current = brg
        // Gentle follow: let the arrow travel across the view and only ease the
        // camera when it nears an edge. Skipped entirely once the user has panned.
        if (followRef.current && now > easeUntilRef.current) {
          const p = map.project(pos)
          const c = map.getContainer()
          const mx = c.clientWidth * 0.28
          const my = c.clientHeight * 0.28
          if (p.x < mx || p.x > c.clientWidth - mx || p.y < my || p.y > c.clientHeight - my) {
            easeUntilRef.current = now + 700   // let this ease finish before the next
            map.easeTo({ center: pos, duration: 700, essential: true })
          }
        }

        // Update the instruction panel a few times/sec.
        if (now - lastPanel > 350) {
          lastPanel = now
          const next = steps.find(s => s.dist > traveled + 1)
          const remain = total - traveled
          setNav({
            icon: next ? maneuverIcon(next.type, next.modifier) : '🏁',
            instruction: next ? next.instruction : 'Arriving at destination',
            distToNext: Math.max(0, Math.round((next ? next.dist - traveled : remain))),
            remainMin: Math.max(1, Math.round((remain / total) * (totalDurationS / 60))),
            remainKm: Math.round((remain / 1000) * 10) / 10,
          })
        }
        rafRef.current = requestAnimationFrame(frame)
      }
      rafRef.current = requestAnimationFrame(frame)
    }

    // Full-route nav follows the backend geometry (which honors Fastest/Shortest);
    // single-order nav has no backend line, so it drives Mapbox's own path.
    const backendLine = (route?.route_geometry ?? []).map(([lat, lon]) => [lon, lat] as [number, number])
    const fallbackDur = (route?.total_duration_min ?? 10) * 60

    fetchDirections(wp)
      .then(dir => {
        if (cancelled) return
        const line = focusOrder
          ? (dir?.geometry?.length ? dir.geometry : wp) // straight-line fallback
          : backendLine
        run(line, dir?.steps ?? [], dir?.duration ?? fallbackDur)
      })
      .catch(() => {
        if (cancelled) return
        run(focusOrder ? wp : backendLine, [], fallbackDur)
      })

    return () => { cancelled = true; stop() }
  }, [navMode, route, focusOrderId, orders])

  // Arriving via a per-order deep-link (/map?order=<id>) auto-starts navigation
  // to that order, once the route (agent start location) has loaded.
  useEffect(() => {
    if (focusOrderId != null && route) setNavMode(true)
  }, [focusOrderId, route])

  // Re-center button: resume camera-follow and snap back to the vehicle.
  function recenter() {
    const map = mapRef.current
    followRef.current = true
    setFollowing(true)
    const pos = lastPosRef.current
    if (map && pos) {
      // Hold off the frame-loop edge-follow so this recenter ease isn't stomped.
      easeUntilRef.current = performance.now() + 550
      // Orient along the arrow's heading (facing the direction of travel), Gmap-style.
      map.easeTo({ center: pos, bearing: lastBrgRef.current, pitch: 0, zoom: 15.5, duration: 500 })
    }
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="mapTokens">
        <div className="mapTokenCard">
          <div className="mapTokenBox">
            <p>🗺️</p>
            <p className="mapTokenTitle">Map needs a Mapbox token</p>
            <p className="mapTokenBody">
              Add <code>VITE_MAPBOX_TOKEN</code> to Vercel and redeploy.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const hasRoute = route && route.stops.length > 0

  return (
    <div className="mapTokens">
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Re-center (Gmap-style) — appears when the user has panned away mid-nav */}
      {navMode && !following && (
        <button onClick={recenter} className={`${styles.recenter} mapPanel`} title="Re-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}

      {/* Turn-by-turn banner (navigation mode) */}
      {navMode && nav && (
        <>
          <div className={`${styles.navBanner} mapPanel`}>
            <span className="mapCorner mapCornerTl" /><span className="mapCorner mapCornerTr" />
            <span className="mapCorner mapCornerBl" /><span className="mapCorner mapCornerBr" />
            <span className={styles.navIcon}>{nav.icon}</span>
            <div className="min-w-0">
              <p className={`${styles.navDist} mapGoldShimmer`}>
                {nav.distToNext >= 1000 ? `${(nav.distToNext / 1000).toFixed(1)} km` : `${nav.distToNext} m`}
              </p>
              <p className={styles.navText}>{nav.instruction}</p>
            </div>
          </div>
          <div className={`${styles.navSub} mapPanel`}>
            <strong>{nav.remainMin} min</strong> · {nav.remainKm} km to destination
          </div>
        </>
      )}

      {/* Corner controls — hidden while navigating for a clean driver view */}
      {!navMode && (<>
      <div className={styles.optimizeToggle}>
        {([
          { key: 'time',     label: '⚡ Fastest' },
          { key: 'distance', label: '📏 Shortest' },
        ] as const).map(m => (
          <button
            key={m.key}
            onClick={() => onOptimizeChange(m.key)}
            className={`mapPill ${optimize === m.key ? 'mapPillGold' : ''}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Layer panel */}
      <div className={styles.layerStack}>
        {[
          { on: showPins,    variant: 'mapPillGold', set: () => setShowPins(p => !p),    label: 'Order Pins' },
          { on: showRoute,   variant: 'mapPillGold', set: () => setShowRoute(r => !r),   label: showRoute ? 'Route ON' : 'My Route' },
          { on: showTraffic, variant: 'mapPillRisk', set: () => setShowTraffic(t => !t), label: showTraffic ? '🚦 Traffic ON' : 'Traffic' },
          { on: showWeather, variant: 'mapPillGold', set: () => setShowWeather(w => !w), label: showWeather ? '🌧 Weather ON' : 'Weather' },
        ].map(b => (
          <button
            key={b.label} onClick={b.set}
            className={`mapPill ${b.on ? b.variant : ''}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      </>)}

      {/* Route summary + navigation control */}
      {hasRoute && (
        <>
          <div className={`${styles.routeSummary} mapPanel`}>
            <span><span className={`${styles.routeFigure} mapGoldShimmer`}>{route.stops.length}</span><span className={styles.routeFigLabel}>stops</span></span>
            <span className={styles.routeDivider} />
            <span><span className={`${styles.routeFigure} mapGoldShimmer`}>{route.total_distance_km}</span><span className={styles.routeFigLabel}>km</span></span>
            <span className={styles.routeDivider} />
            <span><span className={`${styles.routeFigure} mapGoldShimmer`}>{route.total_duration_min}</span><span className={styles.routeFigLabel}>min</span></span>
            {route.traffic_factor > 1.1 && (
              <>
                <span className={styles.routeDivider} />
                <span className={styles.routeTraffic}>⚠ Traffic ×{route.traffic_factor.toFixed(1)}</span>
              </>
            )}
          </div>
          <button
            onClick={() => setNavMode(n => !n)}
            className={`${styles.navCta} ${navMode ? styles.navCtaExit : ''}`}
          >
            {navMode ? '■ Exit Navigation' : '▶ Start Navigation'}
          </button>
        </>
      )}
    </div>
  )
}
