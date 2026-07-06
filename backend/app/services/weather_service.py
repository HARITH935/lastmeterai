"""
Weather service — fetches live Chennai weather from OpenWeatherMap.

Public API:
    get_current_weather() → dict | None
        Returns a normalised weather dict or None on any failure.
    get_weather_risk_score() → float
        Returns a 0.0–1.0 risk score derived from current conditions.

Caches the result for CACHE_TTL_SECONDS to avoid hammering the free-tier API.
"""

from __future__ import annotations

import logging
import time
from typing import Any

log = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 1800  # 30 minutes — free tier allows 1,000 calls/day

_cache: dict[str, Any] = {"data": None, "fetched_at": 0.0}

CHENNAI_LAT = 13.0827
CHENNAI_LON = 80.2707

OWM_URL = (
    "https://api.openweathermap.org/data/2.5/weather"
    f"?lat={CHENNAI_LAT}&lon={CHENNAI_LON}&units=metric&appid="
)


def _fetch_from_api(api_key: str) -> dict | None:
    try:
        import urllib.request, json
        with urllib.request.urlopen(OWM_URL + api_key, timeout=8) as resp:
            raw = json.loads(resp.read())
        return raw
    except Exception as exc:
        log.warning("OpenWeatherMap fetch failed: %s", exc)
        return None


def _normalise(raw: dict) -> dict:
    weather = raw.get("weather", [{}])[0]
    main    = raw.get("main", {})
    wind    = raw.get("wind", {})
    rain    = raw.get("rain", {})
    clouds  = raw.get("clouds", {})

    condition   = weather.get("main", "Clear")
    description = weather.get("description", "clear sky")
    temp        = main.get("temp", 28.0)
    humidity    = main.get("humidity", 70)
    wind_kmh    = round((wind.get("speed", 0) or 0) * 3.6, 1)   # m/s → km/h
    rain_1h_mm  = rain.get("1h", 0.0) or 0.0
    cloud_pct   = clouds.get("all", 0) or 0

    risk = _compute_risk(condition, rain_1h_mm, wind_kmh, humidity)

    return {
        "condition":        condition,
        "description":      description,
        "temp_c":           round(temp, 1),
        "humidity_pct":     humidity,
        "wind_kmh":         wind_kmh,
        "rain_1h_mm":       round(rain_1h_mm, 2),
        "cloud_pct":        cloud_pct,
        "risk_score":       risk,
        "risk_level":       _risk_level(risk),
        "icon_code":        weather.get("icon", "01d"),
    }


def _compute_risk(condition: str, rain_mm: float, wind_kmh: float, humidity: int) -> float:
    cond_lower = condition.lower()

    # Base risk by weather category
    if "thunderstorm" in cond_lower:
        base = 0.90
    elif "heavy" in cond_lower or rain_mm >= 7.0:
        base = 0.75
    elif "rain" in cond_lower or "drizzle" in cond_lower or rain_mm >= 2.0:
        base = 0.50
    elif "fog" in cond_lower or "mist" in cond_lower:
        base = 0.35
    elif "cloud" in cond_lower:
        base = 0.15
    else:
        base = 0.05

    # Adjustments
    wind_bonus = min(wind_kmh / 80.0, 0.20)          # high wind adds up to 0.20
    humid_bonus = max(0, (humidity - 85) / 100.0)    # humidity > 85% adds a touch

    return round(min(base + wind_bonus + humid_bonus, 1.0), 3)


def _risk_level(score: float) -> str:
    if score >= 0.60:
        return "high"
    if score >= 0.30:
        return "medium"
    return "low"


def get_current_weather() -> dict | None:
    from app.config import Config

    api_key = Config.OPENWEATHER_API_KEY
    if not api_key:
        log.info("OPENWEATHER_API_KEY not configured — skipping weather fetch")
        return None

    now = time.time()
    if _cache["data"] and (now - _cache["fetched_at"]) < CACHE_TTL_SECONDS:
        return _cache["data"]

    raw = _fetch_from_api(api_key)
    if raw is None:
        return _cache["data"]   # return stale data rather than None

    normalised = _normalise(raw)
    _cache["data"]       = normalised
    _cache["fetched_at"] = now
    log.info("Weather updated: %s, risk=%s", normalised["condition"], normalised["risk_score"])
    return normalised


def get_weather_risk_score() -> float:
    w = get_current_weather()
    return w["risk_score"] if w else 0.20   # neutral default when API unavailable
