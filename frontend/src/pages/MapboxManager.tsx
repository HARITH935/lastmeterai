import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { OrderListItem } from '../api/orders'
import type { HeatmapZone } from '../api/analytics'
import { escapeHtml } from '../lib/escapeHtml'
import '../styles/mapChrome.css'
import styles from './MapboxManager.module.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''
mapboxgl.accessToken = MAPBOX_TOKEN

// ── Constants ──────────────────────────────────────────────────────────────────

const CHENNAI_CENTER: [number, number] = [80.220, 13.040] // [lng, lat] for Mapbox
const INITIAL_ZOOM = 11.5
const MAP_STYLE = 'mapbox://styles/mapbox/standard'

// Map is a committed dark environment (night light-preset) — these are the
// same dark-mode-validated risk hues used elsewhere (Dashboard's dark theme),
// tuned for contrast against dark tiles/panels rather than the light-mode set.
const RISK_COLOR: Record<string, string> = {
  low:    '#1FA971',
  medium: '#C1841A',
  high:   '#E35B52',
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
          color:          o.risk_level ? (RISK_COLOR[o.risk_level] ?? '#8290A3') : '#8290A3',
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
        color:         RISK_COLOR[z.risk_band] ?? '#8290A3',
        order_count:   z.order_count,
      },
    })),
  }
}

// ── React overlays ───────────────────────────────────────────────────────────────

function LayerButton({ active, variant = 'gold', onClick, children }: {
  active: boolean; variant?: 'gold' | 'risk'; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`mapPill ${active ? (variant === 'risk' ? 'mapPillRisk' : 'mapPillGold') : ''}`}
    >
      {children}
    </button>
  )
}

function HeatmapLegend() {
  return (
    <div className={`${styles.legend} mapPanel`}>
      <p className={styles.legendTitle}>Failure Risk</p>
      {[
        { color: 'var(--go)', label: 'Low  (< 20%)' },
        { color: 'var(--urgent)', label: 'Medium (20–40%)' },
        { color: 'var(--nogo)', label: 'High  (> 40%)' },
      ].map(({ color, label }) => (
        <div key={label} className={styles.legendRow}>
          <div className={styles.dot} style={{ backgroundColor: color }} />
          <span>{label}</span>
        </div>
      ))}
      <p className={styles.legendNote}>Circle size = failure rate</p>
    </div>
  )
}

function ZoneStatsPanel({ zones, onClose }: { zones: HeatmapZone[]; onClose: () => void }) {
  const sorted = [...zones].sort((a, b) => b.failure_rate - a.failure_rate)
  return (
    <div className={`${styles.zonePanel} mapPanel`}>
      <span className="mapCorner mapCornerTl" /><span className="mapCorner mapCornerTr" />
      <span className="mapCorner mapCornerBl" /><span className="mapCorner mapCornerBr" />
      <div className={styles.zoneHead}>
        <p className={styles.zoneTitle}>Zone Risk Ranking</p>
        <button onClick={onClose} className={styles.zoneClose}>×</button>
      </div>
      <div className={styles.zoneList}>
        {sorted.map((z, i) => {
          const pct = Math.round(z.failure_rate * 100)
          const color = RISK_COLOR[z.risk_band] ?? '#8290A3'
          return (
            <div key={z.area} className={styles.zoneRow}>
              <span className={`${styles.zoneRank} mapMono`}>#{i + 1}</span>
              <div className={styles.zoneBody}>
                <div className={styles.zoneTop}>
                  <span className={styles.zoneName}>{z.area}</span>
                  <span className={`${styles.zonePct} mapMono`} style={{ color }}>{pct}%</span>
                </div>
                <div className={styles.zoneBar}>
                  <div className={styles.zoneBarFill} style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <p className={styles.zoneMeta}>{z.order_count} orders · {z.risk_band} risk</p>
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
      // Standard style supports a configurable light preset — commit the map
      // to a dark "night" look so it matches the app's navy/gold chrome
      // instead of the default light basemap.
      map.setConfigProperty('basemap', 'lightPreset', 'night')

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
          // Standard style's night light-preset dims scene-lit layers — this
          // keeps risk colors at full intended brightness regardless of preset.
          'circle-emissive-strength': 1,
        },
      })

      // Order pins — soft glow halo underneath so risk color reads clearly
      // (a dark 2px stroke on a 6px fill was visually swallowing the color).
      map.addSource('orders', { type: 'geojson', data: ordersToGeoJSON(orders) })
      map.addLayer({
        id: 'order-pins-glow',
        type: 'circle',
        source: 'orders',
        paint: {
          'circle-radius': ['case', ['get', 'is_urgent'], 18, 14],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.4,
          'circle-blur': 0.9,
          'circle-emissive-strength': 1,
        },
      })
      map.addLayer({
        id: 'order-pins',
        type: 'circle',
        source: 'orders',
        paint: {
          'circle-radius': ['case', ['get', 'is_urgent'], 9, 7],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#F3ECDA',
          'circle-stroke-opacity': 0.9,
          'circle-emissive-strength': 1,
        },
      })

      // Live agent positions (halo + dot + name label)
      map.addSource('agents', { type: 'geojson', data: agentsToGeoJSON(agentMarkers) })
      map.addLayer({
        id: 'agent-halo', type: 'circle', source: 'agents',
        paint: { 'circle-radius': 16, 'circle-color': '#D9A54B', 'circle-opacity': 0.22, 'circle-emissive-strength': 1 },
      })
      map.addLayer({
        id: 'agent-dots', type: 'circle', source: 'agents',
        paint: { 'circle-radius': 7, 'circle-color': '#D9A54B', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#F3ECDA', 'circle-emissive-strength': 1 },
      })
      map.addLayer({
        id: 'agent-names', type: 'symbol', source: 'agents',
        layout: {
          'text-field': ['get', 'agent_name'], 'text-size': 11, 'text-offset': [0, 1.4],
          'text-anchor': 'top', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: { 'text-color': '#F3ECDA', 'text-halo-color': '#0E2038', 'text-halo-width': 1.5 },
      })

      loadedRef.current = true

      // Popups
      const popup = new mapboxgl.Popup({ closeButton: false, offset: 12 })
      map.on('click', 'order-pins', e => {
        const p = e.features?.[0].properties
        if (!p) return
        popup.setLngLat((e.features![0].geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(
            `<div style="font-family:'LM Plex Sans',sans-serif;font-size:12px;line-height:1.6;min-width:150px">
              <strong>${escapeHtml(p.order_number)}</strong>${p.is_urgent === 'true' || p.is_urgent === true ? ' <span style="color:#E35B52;font-weight:700">⚠</span>' : ''}
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
            `<div style="font-family:'LM Plex Sans',sans-serif;font-size:12px;line-height:1.6;min-width:150px">
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
  useEffect(() => { setVis('order-pins', showPins); setVis('order-pins-glow', showPins) }, [showPins])
  useEffect(() => setVis('zone-circles', showHeatmap), [showHeatmap])
  useEffect(() => { setVis('owm-clouds', showWeather); setVis('owm-precip', showWeather) }, [showWeather])
  useEffect(() => {
    setVis('agent-halo', showAgents); setVis('agent-dots', showAgents); setVis('agent-names', showAgents)
  }, [showAgents])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="mapTokens">
        <div className="mapTokenCard">
          <div className="mapTokenBox">
            <p>🗺️</p>
            <p className="mapTokenTitle">Map needs a Mapbox token</p>
            <p className="mapTokenBody">
              Add <code>VITE_MAPBOX_TOKEN</code> to
              your Vercel environment variables, then redeploy. The map will load automatically.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mapTokens">
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Layer panel */}
      <div className={styles.layerStack}>
        <LayerButton active={showPins} onClick={() => setShowPins(p => !p)}>Order Pins</LayerButton>
        <LayerButton active={showHeatmap} variant="risk" onClick={() => { setShowHeatmap(h => !h); setShowZonePanel(h => !h) }}>
          {showHeatmap ? '🔥 Heatmap ON' : 'Heatmap'}
        </LayerButton>
        <LayerButton active={showWeather} onClick={() => setShowWeather(w => !w)}>
          {showWeather ? '🌧 Weather ON' : 'Weather'}
        </LayerButton>
        <LayerButton active={showAgents} onClick={() => setShowAgents(a => !a)}>
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
