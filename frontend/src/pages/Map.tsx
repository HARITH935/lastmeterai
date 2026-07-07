import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { getHeatmap, type HeatmapZone } from '../api/analytics'
import {
  getAllOrders, getAgentOrders, getOptimizedRoute,
  type OrderListItem, type OptimizedRoute,
} from '../api/orders'
import { MapboxManager } from './MapboxManager'
import { MapboxAgent } from './MapboxAgent'

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

  const [route,    setRoute]    = useState<OptimizedRoute | null>(null)
  const [agentPos, setAgentPos] = useState<[number, number] | null>(null)
  const [optimize, setOptimize] = useState<'time' | 'distance'>('time')

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

    getOptimizedRoute(access_token, optimize)
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
  }, [isAgent, access_token, optimize])

  // ── Socket: route_updated (agent) ──────────────────────────────────────────
  useEffect(() => {
    if (!socket || !isAgent) return
    const onRouteUpdated = (data: OptimizedRoute) => {
      setRoute(data)
      if (data.start_location) {
        setAgentPos([data.start_location.lat, data.start_location.lon])
      }
    }
    socket.on('route_updated', onRouteUpdated)
    return () => { socket.off('route_updated', onRouteUpdated) }
  }, [socket, isAgent])

  // ── Simulated moving GPS along the route (agent only) ─────────────────────
  // Walks the agent position through the route polyline so managers see it
  // travel live. In production, replace with navigator.geolocation.watchPosition().
  useEffect(() => {
    if (!isAgent || !socket) return

    const geometry = route?.route_geometry ?? []
    if (geometry.length < 2) {
      const start = route?.start_location
      if (!start) return
      const { lat, lon } = start
      socket.emit('agent_location_update', { lat, lon })
      const id = setInterval(() => socket.emit('agent_location_update', { lat, lon }), 15_000)
      return () => clearInterval(id)
    }

    const stride = Math.max(1, Math.round(geometry.length / 60))
    let i = 0
    const step = () => {
      const [lat, lon] = geometry[i]
      setAgentPos([lat, lon])
      socket.emit('agent_location_update', { lat, lon })
      i = (i + stride) % geometry.length
    }
    step()
    const id = setInterval(step, 3_000)
    return () => clearInterval(id)
  }, [isAgent, socket, route])

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

  if (isManager) {
    return <MapboxManager orders={state.orders} zones={state.zones} />
  }

  return (
    <MapboxAgent
      orders={state.orders}
      route={route}
      agentPos={agentPos}
      optimize={optimize}
      onOptimizeChange={setOptimize}
    />
  )
}
