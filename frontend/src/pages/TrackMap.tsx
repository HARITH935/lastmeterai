import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import styles from './Track.module.css'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''
mapboxgl.accessToken = TOKEN

interface LatLon { lat: number; lon: number }

interface Props {
  destination: LatLon
  agentLocation: LatLon | null
}

const emptyLine: GeoJSON.Feature = {
  type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {},
}

async function fetchRouteLine(from: [number, number], to: [number, number]): Promise<[number, number][]> {
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}` +
      `?geometries=geojson&overview=full&access_token=${TOKEN}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.routes?.[0]?.geometry?.coordinates ?? []) as [number, number][]
  } catch {
    return []
  }
}

function carElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.innerHTML =
    `<div style="font-size:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">🚗</div>`
  return el
}

function destElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.innerHTML =
    `<div style="font-size:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">📍</div>`
  return el
}

export function TrackMap({ destination, agentLocation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const loadedRef    = useRef(false)
  const carRef       = useRef<mapboxgl.Marker | null>(null)
  const prevRef      = useRef<[number, number] | null>(null)
  const rafRef       = useRef<number | null>(null)
  const lastRouteRef = useRef<{ pos: [number, number]; t: number } | null>(null)

  const dest: [number, number] = [destination.lon, destination.lat]

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current || !TOKEN) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: dest, zoom: 13, attributionControl: false,
    })
    mapRef.current = map

    map.on('load', () => {
      new mapboxgl.Marker({ element: destElement(), anchor: 'bottom' }).setLngLat(dest).addTo(map)
      map.addSource('trk-route', { type: 'geojson', data: emptyLine })
      map.addLayer({
        id: 'trk-route', type: 'line', source: 'trk-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#D9A54B', 'line-width': 5, 'line-opacity': 0.85 },
      })
      loadedRef.current = true
    })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      map.remove(); mapRef.current = null; loadedRef.current = false
    }
  }, [])

  // ── React to new agent position ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current || !agentLocation) return
    const to: [number, number] = [agentLocation.lon, agentLocation.lat]

    // Create the car marker + frame the view on first fix.
    if (!carRef.current) {
      carRef.current = new mapboxgl.Marker({ element: carElement() }).setLngLat(to).addTo(map)
      prevRef.current = to
      const b = new mapboxgl.LngLatBounds(to, to).extend(dest)
      map.fitBounds(b, { padding: 70, maxZoom: 15, duration: 800 })
    } else {
      // Smoothly glide the car from its last position to the new one.
      const from = prevRef.current ?? to
      const start = performance.now()
      const dur = 1400
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur)
        const lng = from[0] + (to[0] - from[0]) * t
        const lat = from[1] + (to[1] - from[1]) * t
        carRef.current?.setLngLat([lng, lat])
        if (t < 1) rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
      prevRef.current = to
    }

    // Refresh the road route (throttled: moved >150m or >12s since last).
    const last = lastRouteRef.current
    const movedFar = !last || Math.hypot(to[0] - last.pos[0], to[1] - last.pos[1]) > 0.0015
    const stale = !last || performance.now() - last.t > 12000
    if (movedFar || stale) {
      lastRouteRef.current = { pos: to, t: performance.now() }
      fetchRouteLine(to, dest).then(coords => {
        const src = map.getSource('trk-route') as mapboxgl.GeoJSONSource | undefined
        src?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
      })
    }
  }, [agentLocation])

  if (!TOKEN) return null

  return (
    <div className={styles.mapCard}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      {!agentLocation && (
        <div className={styles.mapWaitOverlay}>
          <p>Waiting for driver to start moving…</p>
        </div>
      )}
    </div>
  )
}
