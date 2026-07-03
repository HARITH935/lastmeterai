"""
Route optimization service — B15.

Public API:
    get_optimized_route(current_user) → dict
        Compute optimized route for the authenticated agent. Never raises.
    get_optimized_route_for_agent(agent_id) → dict | None
        Internal variant used by socket emission after a status change.

Pipeline:
    1. Fetch agent's pending/in_transit orders (area-scoped, same isolation as list_orders).
    2. Resolve agent start position from AgentLocation (falls back to area centroid).
    3. Get NxN distance/duration matrix via OSRM table endpoint (free, no key).
    4. Get traffic congestion factor from TomTom Traffic Flow API (falls back to 1.0
       if TOMTOM_API_KEY is absent or the call fails — same defensive pattern as gemini_service).
    5. Get weather risk from existing decision_service helpers (same OWM integration).
    6. Build weighted cost matrix: duration × traffic_factor × (1 + weather_risk × 0.3).
    7. Nearest-neighbor construction starting from agent position (node 0).
    8. 2-opt improvement on the open-path route (start node fixed).
    9. Fetch OSRM road geometry for each consecutive segment.
   10. Compute per-stop ETA from cumulative durations.

Fallbacks (all non-fatal):
    OSRM failure       → haversine distance, 30 km/h assumed speed.
    TomTom failure     → congestion factor 1.0.
    Weather failure    → weather_risk 0.20 (mild Chennai default).
    Any other error    → returns _EMPTY_ROUTE dict so the endpoint never 500s.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone

import requests

log = logging.getLogger(__name__)

_OSRM_BASE = "http://router.project-osrm.org"
_TOMTOM_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
_TIMEOUT = 8  # seconds per external call

# Chennai area centroids — fallback start position when agent has no GPS fix.
_AREA_CENTROIDS: dict[str, tuple[float, float]] = {
    "Anna Nagar": (13.0891, 80.2110),
    "T Nagar":    (13.0358, 80.2333),
    "Velachery":  (12.9816, 80.2209),
    "Adyar":      (13.0063, 80.2574),
    "Porur":      (13.0324, 80.1570),
}
_CHENNAI_DEFAULT: tuple[float, float] = (13.0827, 80.2707)

_EMPTY_ROUTE: dict = {
    "stops":              [],
    "total_distance_km":  0.0,
    "total_duration_min": 0.0,
    "route_geometry":     [],
    "start_location":     None,
    "recalculated_at":    None,
    "traffic_factor":     1.0,
    "weather_risk":       0.0,
}


# ── Config helper ─────────────────────────────────────────────────────────────

def _tomtom_key() -> str | None:
    try:
        from flask import current_app
        return current_app.config.get("TOMTOM_API_KEY")
    except RuntimeError:
        import os
        return os.environ.get("TOMTOM_API_KEY")


# ── Geometry ──────────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return 2 * 6_371 * math.asin(math.sqrt(a))


# ── External API calls ────────────────────────────────────────────────────────

def _osrm_table(
    coords: list[tuple[float, float]],
) -> tuple[list[list[float]], list[list[float]]]:
    """
    NxN duration (seconds) and distance (meters) matrices via OSRM /table endpoint.
    Replaces any None values returned by OSRM with haversine estimates.
    Falls back entirely to haversine on network/API failure.
    """
    n = len(coords)
    coord_str = ";".join(f"{lon},{lat}" for lat, lon in coords)
    url = f"{_OSRM_BASE}/table/v1/driving/{coord_str}?annotations=duration,distance"
    try:
        r = requests.get(url, timeout=_TIMEOUT)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != "Ok":
            raise ValueError(f"OSRM: {data.get('message')}")
        dur  = data["durations"]
        dist = data["distances"]
        # Replace any None values (unreachable pairs) with haversine estimates.
        for i in range(n):
            for j in range(n):
                if dur[i][j] is None or dist[i][j] is None:
                    km = _haversine_km(coords[i][0], coords[i][1], coords[j][0], coords[j][1])
                    dist[i][j] = km * 1000
                    dur[i][j]  = (km / 30.0) * 3_600
        return dur, dist
    except Exception as exc:
        log.warning("OSRM table failed (%s) — falling back to haversine", exc)
        dur  = [[0.0] * n for _ in range(n)]
        dist = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                if i != j:
                    km = _haversine_km(
                        coords[i][0], coords[i][1],
                        coords[j][0], coords[j][1],
                    )
                    dist[i][j] = km * 1_000
                    dur[i][j]  = (km / 30.0) * 3_600
        return dur, dist


def _osrm_geometry(
    c1: tuple[float, float],
    c2: tuple[float, float],
) -> list[list[float]]:
    """
    Road-network polyline between two points as [[lat, lon], ...] for react-leaflet.
    Falls back to straight line on failure.
    """
    lat1, lon1 = c1
    lat2, lon2 = c2
    url = (
        f"{_OSRM_BASE}/route/v1/driving/{lon1},{lat1};{lon2},{lat2}"
        "?overview=full&geometries=geojson"
    )
    try:
        r = requests.get(url, timeout=_TIMEOUT)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != "Ok":
            raise ValueError(f"OSRM: {data.get('message')}")
        # OSRM returns [lon, lat] — convert to [lat, lon] for Leaflet.
        raw = data["routes"][0]["geometry"]["coordinates"]
        return [[c[1], c[0]] for c in raw]
    except Exception as exc:
        log.warning("OSRM geometry failed (%s) — using straight line", exc)
        return [[lat1, lon1], [lat2, lon2]]


def _tomtom_congestion(lat: float, lon: float) -> float:
    """
    Traffic congestion factor: freeFlowSpeed / currentSpeed ∈ [1.0, 3.0].
    Returns 1.0 (no adjustment) when TOMTOM_API_KEY is absent or call fails.
    """
    key = _tomtom_key()
    if not key:
        log.debug("TOMTOM_API_KEY absent — congestion factor 1.0")
        return 1.0
    try:
        r = requests.get(
            _TOMTOM_URL,
            params={"point": f"{lat},{lon}", "key": key},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        seg  = r.json().get("flowSegmentData", {})
        cur  = float(seg.get("currentSpeed",  0))
        free = float(seg.get("freeFlowSpeed", 0))
        if cur <= 0 or free <= 0:
            return 1.0
        return min(3.0, max(1.0, free / cur))
    except Exception as exc:
        log.warning("TomTom API failed (%s) — congestion factor 1.0", exc)
        return 1.0


def _weather_risk(lat: float, lon: float, area: str) -> float:
    """
    Weather risk [0, 1] for the agent's area, reusing decision_service helpers.
    Falls back to 0.20 on error.
    """
    try:
        from app.services.decision_service import _fetch_weather, _compute_weather_risk
        return _compute_weather_risk(_fetch_weather(lat, lon, area))
    except Exception as exc:
        log.warning("Weather fetch failed (%s) — using default risk 0.20", exc)
        return 0.20


# ── TSP solvers ───────────────────────────────────────────────────────────────

def _nearest_neighbor(cost: list[list[float]]) -> list[int]:
    """
    Nearest-neighbor construction starting from node 0 (agent position).
    Returns the full route as indices into the cost matrix, with 0 first.
    """
    n = len(cost)
    visited = [False] * n
    route = [0]
    visited[0] = True
    for _ in range(n - 1):
        cur = route[-1]
        nxt = min(
            (j for j in range(n) if not visited[j]),
            key=lambda j: cost[cur][j],
            default=None,
        )
        if nxt is None:
            break
        route.append(nxt)
        visited[nxt] = True
    return route


def _two_opt(route: list[int], cost: list[list[float]]) -> list[int]:
    """
    2-opt improvement on an open-path route.
    route[0] is the fixed start node (agent position) and is never moved.
    Reverses sub-segments [i..j] when doing so reduces total cost.
    """
    if len(route) <= 3:
        return route[:]
    best = route[:]
    n = len(best)
    improved = True
    while improved:
        improved = False
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                prev = best[i - 1]
                nxt  = best[j + 1] if j < n - 1 else None
                old  = cost[prev][best[i]] + (cost[best[j]][nxt] if nxt is not None else 0.0)
                new  = cost[prev][best[j]] + (cost[best[i]][nxt] if nxt is not None else 0.0)
                if new < old - 1e-6:
                    best[i : j + 1] = best[i : j + 1][::-1]
                    improved = True
    return best


# ── Core pipeline ─────────────────────────────────────────────────────────────

def _build_route(agent_id: int) -> dict:
    """
    Compute the optimized route for a given agent_id.
    All external API calls are non-fatal — fallbacks ensure a valid dict is always returned.
    """
    from app.extensions import db
    from app.models import User, Order, OrderStatus, AgentLocation

    agent = db.session.get(User, agent_id)
    if not agent:
        return {**_EMPTY_ROUTE}

    now = datetime.now(timezone.utc)

    # ── Pending + in_transit orders for this agent's area ─────────────────────
    orders = (
        db.session.query(Order)
        .filter(
            Order.area == agent.area,
            Order.status.in_([OrderStatus.PENDING, OrderStatus.IN_TRANSIT]),
        )
        .order_by(Order.deadline.asc())
        .all()
    )

    if not orders:
        return {
            **_EMPTY_ROUTE,
            "recalculated_at": now.isoformat(),
        }

    # ── Agent start position ──────────────────────────────────────────────────
    loc = db.session.query(AgentLocation).filter_by(agent_id=agent_id).first()
    if loc and loc.is_online:
        start: tuple[float, float] = (loc.latitude, loc.longitude)
    else:
        start = _AREA_CENTROIDS.get(agent.area, _CHENNAI_DEFAULT)

    # ── Traffic + weather for this area (single call each, area-level factors) ─
    t_factor  = _tomtom_congestion(start[0], start[1])
    w_risk    = _weather_risk(start[0], start[1], agent.area)
    w_overhead = 1.0 + w_risk * 0.3   # e.g. risk=0.90 → +27 % time

    # ── Coordinate list: [start, order_0, order_1, ...] ──────────────────────
    stop_coords: list[tuple[float, float]] = [(o.latitude, o.longitude) for o in orders]
    all_coords:  list[tuple[float, float]] = [start] + stop_coords
    n_all = len(all_coords)

    # ── OSRM distance / duration matrices ─────────────────────────────────────
    durations_s, distances_m = _osrm_table(all_coords)

    # ── Weighted cost: duration × traffic × weather overhead ──────────────────
    cost = [
        [durations_s[i][j] * t_factor * w_overhead for j in range(n_all)]
        for i in range(n_all)
    ]

    # ── TSP: nearest-neighbor + 2-opt ─────────────────────────────────────────
    if n_all == 2:
        ordered = [0, 1]           # trivial — one stop
    else:
        ordered = _two_opt(_nearest_neighbor(cost), cost)

    # Map back to orders list indices (ordered[0] == 0, the start node).
    stop_order = [idx - 1 for idx in ordered[1:]]

    # ── Build stops + geometry ────────────────────────────────────────────────
    stops_out:       list[dict]        = []
    geometry_points: list[list[float]] = []
    total_dist_m = 0.0
    total_dur_s  = 0.0
    prev_idx = 0  # index in all_coords (start node)

    for seq, orders_idx in enumerate(stop_order):
        cur_idx = orders_idx + 1   # index in all_coords

        seg_dur_s  = durations_s[prev_idx][cur_idx] * t_factor * w_overhead
        seg_dist_m = distances_m[prev_idx][cur_idx]

        # Road geometry for this segment.
        seg_geom = _osrm_geometry(all_coords[prev_idx], all_coords[cur_idx])
        if not geometry_points:
            geometry_points.extend(seg_geom)
        else:
            geometry_points.extend(seg_geom[1:])  # skip duplicate junction point

        total_dist_m += seg_dist_m
        total_dur_s  += seg_dur_s

        eta = now + timedelta(seconds=total_dur_s)
        o   = orders[orders_idx]
        dec = o.latest_decision

        stops_out.append({
            "order_id":               o.id,
            "order_number":           o.order_number,
            "sequence":               seq + 1,
            "customer_name":          o.customer_name,
            "customer_address":       o.customer_address,
            "latitude":               o.latitude,
            "longitude":              o.longitude,
            "area":                   o.area,
            "status":                 o.status.value,
            "risk_level":             dec.risk_level.value if dec else None,
            "is_urgent":              o.is_urgent,
            "eta":                    eta.isoformat(),
            "duration_from_prev_min": round(seg_dur_s / 60, 1),
            "distance_from_prev_km":  round(seg_dist_m / 1_000, 2),
        })

        prev_idx = cur_idx

    return {
        "stops":              stops_out,
        "total_distance_km":  round(total_dist_m / 1_000, 2),
        "total_duration_min": round(total_dur_s  / 60,    1),
        "route_geometry":     geometry_points,
        "start_location":     {"lat": start[0], "lon": start[1]},
        "recalculated_at":    now.isoformat(),
        "traffic_factor":     round(t_factor, 2),
        "weather_risk":       round(w_risk, 3),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def get_optimized_route(current_user) -> dict:
    """Compute optimized route for the authenticated agent. Never raises."""
    try:
        return _build_route(current_user.id)
    except Exception as exc:
        log.exception("Route optimization failed for user %s: %s", current_user.id, exc)
        return {**_EMPTY_ROUTE, "recalculated_at": datetime.now(timezone.utc).isoformat()}


def get_optimized_route_for_agent(agent_id: int) -> dict | None:
    """
    Internal: recompute route for an agent by ID after a status change.
    Returns None on error so callers can skip the socket emit gracefully.
    """
    try:
        result = _build_route(agent_id)
        # Only return if there are stops or the route has a timestamp
        # (always true for a non-None result from _build_route).
        return result
    except Exception as exc:
        log.warning("Background route recalculation failed for agent %s: %s", agent_id, exc)
        return None
