"""
Decision service — orchestrates the full GO/NO-GO prediction pipeline.

Pipeline (called per order):
  1. Fetch live weather from OpenWeatherMap (or deterministic mock if no key)
  2. Build 7-factor FeatureVector from order + weather data
  3. Run predictor.predict() → success_probability, model_version
  4. Compute risk_score / risk_level
  5. Run shap_explainer.explain() → % contributions toward NO-GO
  6. Build reschedule_suggestion if decision is NO-GO
  7. Persist Decision row via Decision.from_prediction() factory
  8. Write AuditLog entry
  9. Return Decision object (caller commits the session)

Public entry point consumed by order_service and the /predict route:
    predict_and_save(order: Order, commit: bool = False) -> Decision
"""

from __future__ import annotations

import hashlib
import logging
import math
import os

import requests

from app.extensions import db
from app.ml.predictor import FeatureVector, MODEL_NAME, predict as _predict
from app.ml.shap_explainer import explain as _explain, format_stored_top_factors
from app.models.audit_log import AuditLog, AuditAction, EntityType
from app.models.decision import Decision, DecisionType

log = logging.getLogger(__name__)

# ── Chennai reference point (city centre) ─────────────────────────────────────
_CHENNAI_LAT = 13.0827
_CHENNAI_LNG = 80.2707
_MAX_DELIVERY_KM = 15.0    # normalisation cap for distance_score

# ── Package base delivery cost (₹) — used for profit-margin calculation ────────
_PACKAGE_BASE_COST: dict[str, float] = {
    "small":  20.0,
    "medium": 50.0,
    "large":  120.0,
}

# ── Time-window feature values ─────────────────────────────────────────────────
_TIME_WINDOW_TRAFFIC: dict[str, float] = {
    "morning":   0.45,   # school + early-office commute
    "afternoon": 0.25,   # quietest period
    "evening":   0.75,   # office-return rush
}

_TIME_WINDOW_DIFFICULTY: dict[str, float] = {
    "morning":   0.15,   # customers usually home, cool temperature
    "afternoon": 0.35,   # mixed availability
    "evening":   0.65,   # fatigue, heat, security gates closed
}

# ── Mock weather (used when OPENWEATHER_API_KEY is absent) ────────────────────
# Keyed by Chennai area name.  Velachery gets heavy rain to produce varied tests.
_MOCK_WEATHER: dict[str, dict] = {
    "Anna Nagar": {
        "condition_id": 800, "condition": "Clear",
        "temp_c": 33.0, "humidity": 55, "wind_kmh": 10.0,
        "description": "clear sky",
    },
    "T Nagar": {
        "condition_id": 801, "condition": "Partly Cloudy",
        "temp_c": 31.0, "humidity": 65, "wind_kmh": 12.0,
        "description": "few clouds",
    },
    "Velachery": {
        "condition_id": 502, "condition": "Heavy Rain",
        "temp_c": 26.0, "humidity": 90, "wind_kmh": 28.0,
        "description": "heavy intensity rain",
    },
    "Adyar": {
        "condition_id": 500, "condition": "Light Rain",
        "temp_c": 28.0, "humidity": 78, "wind_kmh": 15.0,
        "description": "light rain",
    },
    "Porur": {
        "condition_id": 803, "condition": "Broken Clouds",
        "temp_c": 32.0, "humidity": 60, "wind_kmh": 8.0,
        "description": "broken clouds",
    },
}
_MOCK_WEATHER_DEFAULT = {
    "condition_id": 802, "condition": "Scattered Clouds",
    "temp_c": 30.0, "humidity": 68, "wind_kmh": 12.0,
    "description": "scattered clouds",
}


# ── Custom exceptions ──────────────────────────────────────────────────────────

class DecisionNotFound(Exception):
    pass

class Forbidden(Exception):
    pass


# ── Weather fetch ──────────────────────────────────────────────────────────────

def _condition_id_to_base_risk(condition_id: int) -> float:
    """Map OpenWeatherMap condition code to a base weather_risk score [0, 1]."""
    if 200 <= condition_id < 300:
        return 0.90   # Thunderstorm
    if 300 <= condition_id < 400:
        return 0.45   # Drizzle
    if condition_id == 500:
        return 0.48   # Light rain
    if condition_id == 501:
        return 0.65   # Moderate rain
    if 502 <= condition_id < 505:
        return 0.85   # Heavy / very heavy / extreme rain
    if 510 <= condition_id < 600:
        return 0.62   # Shower rain
    if 600 <= condition_id < 700:
        return 0.78   # Snow / sleet (rare in Chennai)
    if 700 <= condition_id < 800:
        return 0.38   # Atmosphere: mist, fog, haze
    if condition_id == 800:
        return 0.05   # Clear sky
    if condition_id == 801:
        return 0.10   # Few clouds
    if condition_id == 802:
        return 0.18   # Scattered clouds
    if condition_id in (803, 804):
        return 0.28   # Broken / overcast clouds
    return 0.20       # Unknown


def _compute_weather_risk(weather: dict) -> float:
    base = _condition_id_to_base_risk(weather.get("condition_id", 802))
    adj = 0.0
    if weather.get("humidity", 0) > 85:
        adj += 0.04   # high humidity increases delivery difficulty
    if weather.get("wind_kmh", 0) > 30:
        adj += 0.04   # strong wind makes large packages dangerous
    return round(min(0.98, base + adj), 3)


def _fetch_weather(lat: float, lng: float, area: str) -> dict:
    """
    Returns a weather dict with keys:
        condition_id, condition, temp_c, humidity, wind_kmh, description
    Uses OWM API when OPENWEATHER_API_KEY is set; falls back to mock otherwise.
    """
    api_key = os.environ.get("OPENWEATHER_API_KEY")

    if not api_key:
        log.debug("OPENWEATHER_API_KEY not set — using mock weather for area=%r", area)
        return _MOCK_WEATHER.get(area, _MOCK_WEATHER_DEFAULT).copy()

    log.debug("Fetching live weather for (%.4f, %.4f)", lat, lng)
    try:
        url = (
            "https://api.openweathermap.org/data/2.5/weather"
            f"?lat={lat}&lon={lng}&appid={api_key}&units=metric"
        )
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()

        wind_mps = data.get("wind", {}).get("speed", 0)
        return {
            "condition_id":  data["weather"][0]["id"],
            "condition":     data["weather"][0]["main"],
            "temp_c":        round(data["main"]["temp"], 1),
            "humidity":      data["main"]["humidity"],
            "wind_kmh":      round(wind_mps * 3.6, 1),
            "description":   data["weather"][0]["description"],
        }
    except Exception as exc:
        log.warning(
            "OWM API call failed (%s) — falling back to mock weather for area=%r", exc, area
        )
        return _MOCK_WEATHER.get(area, _MOCK_WEATHER_DEFAULT).copy()


# ── Feature engineering ────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return 2 * 6_371 * math.asin(math.sqrt(a))


def _distance_score(lat: float, lng: float) -> float:
    """Normalised distance from Chennai city centre [0, 1]."""
    km = _haversine_km(lat, lng, _CHENNAI_LAT, _CHENNAI_LNG)
    return round(min(1.0, km / _MAX_DELIVERY_KM), 3)


def _customer_history_score(phone: str | None) -> float:
    """
    Estimated customer reliability score [0, 1].
    1 = highly reliable (low historical failure rate).
    0 = unreliable (always fails or unknown).
    Convention matches the trained model: positive LR coefficient means reliable → GO.
    Deterministic hash stands in for a real feature store lookup.
    """
    if not phone:
        return 0.65   # unknown customer → moderate reliability assumed
    h = int(hashlib.md5(phone.encode()).hexdigest()[:6], 16)
    # Most customers have 10-40% historical failure rate; reliability = 1 - failure_rate
    failure_rate = 0.10 + (h % 30) / 100.0
    return round(1.0 - failure_rate, 2)   # returns 0.60 to 0.90


def _agent_profit_score(order) -> float:
    """
    Profitability ratio: (payment - estimated_delivery_cost) / payment.
    Clamped to [0, 1].  Low value means agent earns little → less motivated.
    """
    dist_km = _haversine_km(order.latitude, order.longitude, _CHENNAI_LAT, _CHENNAI_LNG)
    cost = dist_km * 15.0 + _PACKAGE_BASE_COST.get(order.package_size.value, 50.0)
    if order.payment_amount <= 0:
        return 0.0
    ratio = (order.payment_amount - cost) / order.payment_amount
    return round(max(0.0, min(1.0, ratio)), 3)


def _build_features(order, weather: dict) -> FeatureVector:
    return FeatureVector(
        weather_risk           = _compute_weather_risk(weather),
        customer_history_score = _customer_history_score(order.customer_phone),
        traffic_impact         = _TIME_WINDOW_TRAFFIC.get(order.time_window.value, 0.40),
        agent_profit_score     = _agent_profit_score(order),
        distance_score         = _distance_score(order.latitude, order.longitude),
        time_of_day_score      = _TIME_WINDOW_DIFFICULTY.get(order.time_window.value, 0.30),
        package_size_score     = {"small": 0.10, "medium": 0.40, "large": 0.85}.get(
                                    order.package_size.value, 0.40
                                ),
    )


# ── Reschedule suggestion ──────────────────────────────────────────────────────

def _build_reschedule(order, features: FeatureVector, shap_pct: dict[str, float]) -> dict:
    """
    Build a reschedule suggestion for NO-GO orders.
    Identifies the top contributing risk factor and suggests the best alternative.
    Re-runs the predictor with improved feature values to compute the expected gain.
    """
    from datetime import datetime, timedelta, timezone  # noqa: PLC0415

    now = datetime.now(timezone.utc)

    # Find which factor is pushing hardest toward NO-GO (largest positive contribution).
    worst = max(shap_pct, key=lambda k: shap_pct[k])

    if worst == "weather_risk":
        suggested_date   = (now + timedelta(days=2)).strftime("%Y-%m-%d")
        suggested_window = order.time_window.value   # same window, wait for weather
        reason = "Adverse weather conditions expected to clear in 2 days."
        improved = FeatureVector(
            weather_risk           = 0.05,            # clear sky assumed
            customer_history_score = features.customer_history_score,
            traffic_impact         = _TIME_WINDOW_TRAFFIC.get(suggested_window, 0.40),
            agent_profit_score     = features.agent_profit_score,
            distance_score         = features.distance_score,
            time_of_day_score      = _TIME_WINDOW_DIFFICULTY.get(suggested_window, 0.30),
            package_size_score     = features.package_size_score,
        )
    elif worst in ("traffic_impact", "time_of_day_score"):
        suggested_date   = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        suggested_window = "morning"
        reason = "Morning window has significantly lower traffic impact in this area."
        improved = FeatureVector(
            weather_risk           = features.weather_risk,
            customer_history_score = features.customer_history_score,
            traffic_impact         = _TIME_WINDOW_TRAFFIC["morning"],
            agent_profit_score     = features.agent_profit_score,
            distance_score         = features.distance_score,
            time_of_day_score      = _TIME_WINDOW_DIFFICULTY["morning"],
            package_size_score     = features.package_size_score,
        )
    elif worst == "agent_profit_score":
        suggested_date   = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        suggested_window = order.time_window.value
        reason = "Consider increasing payment amount or assigning a local agent to improve margin."
        improved = FeatureVector(
            weather_risk           = features.weather_risk,
            customer_history_score = features.customer_history_score,
            traffic_impact         = features.traffic_impact,
            agent_profit_score     = 0.75,            # assume margin improved
            distance_score         = features.distance_score,
            time_of_day_score      = features.time_of_day_score,
            package_size_score     = features.package_size_score,
        )
    else:
        suggested_date   = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        suggested_window = "morning"
        reason = "Rescheduling to optimal morning window improves multiple delivery factors."
        improved = FeatureVector(
            weather_risk           = max(0.05, features.weather_risk - 0.10),
            customer_history_score = features.customer_history_score,
            traffic_impact         = _TIME_WINDOW_TRAFFIC["morning"],
            agent_profit_score     = features.agent_profit_score,
            distance_score         = features.distance_score,
            time_of_day_score      = _TIME_WINDOW_DIFFICULTY["morning"],
            package_size_score     = features.package_size_score,
        )

    predicted_prob, _ = _predict(improved)
    return {
        "suggested_date":                suggested_date,
        "suggested_window":              suggested_window,
        "predicted_success_probability": predicted_prob,
        "reason":                        reason,
    }


# ── Decision serialisation ─────────────────────────────────────────────────────

def format_decision(decision: Decision) -> dict:
    """
    Full API response dict for a Decision row.
    Converts top_shap_factors tuples to {factor, contribution} dicts.
    """
    d = decision.to_dict()
    d["top_factors"] = format_stored_top_factors(decision.shap_values)
    return d


# ── Core pipeline ──────────────────────────────────────────────────────────────

def predict_and_save(order, commit: bool = False) -> Decision:
    """
    Run the full GO/NO-GO pipeline for an order and persist the result.

    Called by:
      - order_service._run_prediction_stub()  (commit=False, outer tx commits)
      - /api/decisions/predict route           (commit=True or caller commits)

    Returns the saved Decision object.
    Raises on hard failure — callers should catch and handle.
    """
    from flask import current_app  # noqa: PLC0415

    threshold = current_app.config.get("GONOGO_THRESHOLD", 0.5)

    # 1 — Fetch weather
    weather = _fetch_weather(order.latitude, order.longitude, order.area)

    # 2 — Build feature vector
    features = _build_features(order, weather)

    # 3 — Run prediction
    success_prob, model_version = _predict(features)

    # 4 — SHAP explanation
    shap_pct = _explain(features)

    # 5 — Reschedule suggestion (NO-GO only)
    is_go = success_prob >= threshold
    reschedule = None if is_go else _build_reschedule(order, features, shap_pct)

    # 6 — Persist Decision row using factory (risk_score, risk_level, decision derived inside)
    decision = Decision.from_prediction(
        order_id              = order.id,
        model_name            = MODEL_NAME,
        model_version         = model_version,
        success_probability   = success_prob,
        factor_scores         = features.as_dict(),
        shap_values           = shap_pct,
        weather_snapshot      = {
            "condition":   weather.get("condition", "Unknown"),
            "temp_c":      weather.get("temp_c", 0),
            "humidity":    weather.get("humidity", 0),
            "wind_kmh":    weather.get("wind_kmh", 0),
            "description": weather.get("description", ""),
        },
        reschedule_suggestion = reschedule,
        threshold             = threshold,
    )
    db.session.add(decision)

    # 7 — Audit log
    AuditLog.log(
        entity_type = EntityType.ORDER,
        entity_id   = order.id,
        action      = AuditAction.AI_FLAGGED_GO if is_go else AuditAction.AI_FLAGGED_NO_GO,
        description = (
            f"Order {order.order_number} → "
            f"{'GO' if is_go else 'NO-GO'} "
            f"(probability={success_prob:.2%}, risk_score={round((1-success_prob)*100)})"
        ),
        actor_id  = None,   # ML pipeline is the actor
        new_value = {
            "decision":           "GO" if is_go else "NO-GO",
            "success_probability": success_prob,
            "model_version":      model_version,
        },
    )

    # 8 — Emit ai_decision to managers room (non-fatal; in-memory fields, no flush needed)
    try:
        from app.sockets.events import emit_ai_decision  # noqa: PLC0415
        emit_ai_decision(order, decision)
    except Exception as exc:
        log.debug("Failed to emit ai_decision for order %s: %s", order.order_number, exc)

    # 9 — Notify assigned agent on NO-GO (non-fatal; same transaction)
    if not is_go and order.agent_id:
        try:
            from app.services import notification_service  # noqa: PLC0415
            top_factor = max(shap_pct, key=lambda k: shap_pct[k])
            top_value  = shap_pct[top_factor]
            risk_score_int = round((1 - success_prob) * 100)
            notification_service.create_notification(
                user_id  = order.agent_id,
                category = "ai_alert",
                title    = f"Order {order.order_number} flagged NO-GO",
                message  = (
                    f"AI flagged {order.order_number} as NO-GO "
                    f"(risk score: {risk_score_int}). "
                    f"Top risk factor: {top_factor.replace('_', ' ')} "
                    f"({top_value:+.1f}%). "
                    + ("Reschedule suggested." if reschedule else "")
                ),
                order_id = order.id,
                extra    = {
                    "top_shap_factor": top_factor,
                    "risk_score":      risk_score_int,
                },
            )
        except Exception as exc:
            log.warning(
                "Failed to stage NO-GO notification for order %s: %s",
                order.order_number, exc,
            )

    if commit:
        db.session.commit()

    return decision


# ── get_decision ───────────────────────────────────────────────────────────────

def get_decision(decision_id: int, current_user) -> dict:
    """
    Fetch a single Decision with area-based access control.
    Raises: DecisionNotFound, Forbidden.
    """
    decision = db.session.get(Decision, decision_id)
    if not decision:
        raise DecisionNotFound()

    order = decision.order
    if current_user.is_agent and order.area != current_user.area:
        raise Forbidden()

    return format_decision(decision)
