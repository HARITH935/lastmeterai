"""
ETA predictor  ·  per-order delivery time estimation

Given a single order, predicts when it will be delivered by combining:
  1. Travel time    — haversine distance from depot ÷ time-of-day road speed
  2. Weather overhead— live weather risk slows travel (× 1 + risk × 0.4)
  3. Handling time   — package size + residence type (apartment = harder to find)
  4. Queue time      — orders already ahead of this one in the agent's day

Returns a point estimate, a confidence-scaled low–high window, an ISO arrival
time, and a human-readable factor breakdown for the UI.

No external calls except the cached weather service — safe to hit on every
order-detail load.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import Order, OrderStatus
from app.services import weather_service

# Depot: LastMeter Chennai hub (matches route_service._CHENNAI_DEFAULT)
_DEPOT: tuple[float, float] = (13.0827, 80.2707)

# Average city road speed (km/h) by delivery window — evenings are slowest.
_WINDOW_SPEED = {"morning": 24.0, "afternoon": 20.0, "evening": 15.0}

# On-site handling time (minutes) by package size.
_HANDLING_MIN = {"small": 3.0, "medium": 5.0, "large": 8.0}

# Extra minutes to locate the doorstep by residence type.
_RESIDENCE_MIN = {"apartment": 4.0, "independent": 2.0}

# Assumed minutes spent per order already queued ahead of this one.
_QUEUE_MIN_PER_ORDER = 11.0


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def predict_eta(order: Order) -> dict:
    """Predict delivery ETA for a single order. Pure read — never mutates."""
    window   = order.time_window.value
    pkg      = order.package_size.value
    res      = order.residence_type.value

    distance_km  = round(_haversine_km(_DEPOT, (order.latitude, order.longitude)), 2)
    speed        = _WINDOW_SPEED.get(window, 20.0)
    weather_risk = weather_service.get_weather_risk_score()  # 0.0–1.0

    # ── Component minutes ──────────────────────────────────────────────────────
    travel_min   = (distance_km / speed) * 60.0
    weather_min  = travel_min * weather_risk * 0.4
    handling_min = _HANDLING_MIN.get(pkg, 5.0) + _RESIDENCE_MIN.get(res, 3.0)

    # Queue: active orders already assigned to this agent (this one waits behind them).
    queue_ahead = 0
    if order.agent_id is not None:
        queue_ahead = (
            db.session.query(Order.id)
            .filter(
                Order.agent_id == order.agent_id,
                Order.id != order.id,
                Order.status.in_([OrderStatus.PENDING, OrderStatus.IN_TRANSIT]),
            )
            .count()
        )
    queue_min = queue_ahead * _QUEUE_MIN_PER_ORDER

    total_min = travel_min + weather_min + handling_min + queue_min

    # ── Confidence & window ────────────────────────────────────────────────────
    # Long distance and bad weather widen uncertainty.
    confidence = _clamp(
        0.95 - weather_risk * 0.25 - min(distance_km / 25.0, 1.0) * 0.12,
        0.55, 0.97,
    )
    spread_lo = total_min * (1.0 - confidence) * 0.5
    spread_hi = total_min * (1.0 - confidence) * 1.1
    eta_low_min  = round(total_min - spread_lo)
    eta_high_min = round(total_min + spread_hi)

    eta_time = datetime.now(timezone.utc) + timedelta(minutes=total_min)

    # ── Factor breakdown for the UI ────────────────────────────────────────────
    factors = [
        {"label": "Travel from depot", "minutes": round(travel_min, 1),
         "detail": f"{distance_km} km @ {speed:.0f} km/h ({window})"},
        {"label": "Weather overhead",  "minutes": round(weather_min, 1),
         "detail": f"{round(weather_risk * 100)}% weather risk"},
        {"label": "Handling on-site",  "minutes": round(handling_min, 1),
         "detail": f"{pkg} package · {res}"},
        {"label": "Queue ahead",       "minutes": round(queue_min, 1),
         "detail": f"{queue_ahead} order{'s' if queue_ahead != 1 else ''} before this"},
    ]

    return {
        "order_id":        order.id,
        "predicted_min":   round(total_min),
        "eta_low_min":     eta_low_min,
        "eta_high_min":    eta_high_min,
        "eta_time":        eta_time.isoformat(),
        "confidence":      round(confidence, 2),
        "distance_km":     distance_km,
        "weather_risk":    round(weather_risk, 2),
        "factors":         factors,
    }
