"""
Area/time failure rate predictor — A6 backend integration.

Loads rf_area_time_v1.0.pkl (RandomForestRegressor) trained in A5.
Predicts delivery failure rate (0–1) for a given area + contextual conditions.

Feature encoding (must match train_area_model.py FEATURES order):
  19 area one-hot columns (all AREAS except Anna Nagar, the reference/baseline
  category) + time_morning, time_evening — one-hot, afternoon = ref
  is_weekend        — 0/1
  weather_severity  — float [0, 1]
  is_festival_day   — 0/1
  is_monsoon_month  — 0/1 (June–September)

Graceful fallback: if the model file is absent, all predict_* functions
return None and callers fall back to SQL-aggregated live failure rates.

Note on accuracy: R²=0.879 (20-area retrain, 2026-07-13) is a synthetic
self-consistency result, not a real-world generalization result (see
docs/progress.md Known Issue #3). Predictions are appropriate as a stable
ranking/coloring lookup but should not be presented as validated field accuracy.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

AREAS = [
    "Anna Nagar", "T Nagar", "Velachery", "Adyar", "Porur",
    "Mylapore", "Nungambakkam", "Guindy", "Tambaram", "Sholinganallur",
    "Thiruvanmiyur", "Besant Nagar", "Kilpauk", "Egmore", "Vadapalani",
    "Koyambedu", "Ambattur", "Perambur", "Chromepet", "Saidapet",
]
TIME_WINDOWS = ["morning", "afternoon", "evening"]

# All areas except Anna Nagar (the one-hot reference/baseline category) —
# order must match ml/src/training/train_area_model.py's _NONREF_AREAS exactly.
_NONREF_AREAS = [a for a in AREAS if a != "Anna Nagar"]

# Must match FEATURES list in ml/src/training/train_area_model.py exactly.
_FEATURE_ORDER = [f"area_{a.lower().replace(' ', '_')}" for a in _NONREF_AREAS] + [
    "time_morning",
    "time_evening",
    "is_weekend",
    "weather_severity",
    "is_festival_day",
    "is_monsoon_month",
]

_cached_model = None
_cached_version: str | None = None


def _load_model():
    _default = Path(__file__).parent.parent.parent.parent / "ml" / "models"
    models_dir = Path(os.environ.get("ML_MODELS_DIR", str(_default)))
    pkl_path = models_dir / "rf_area_time_v1.0.pkl"
    if not pkl_path.exists():
        log.info("Area model not found at %s — falling back to SQL aggregation.", pkl_path)
        return None, None
    try:
        import joblib
        obj = joblib.load(pkl_path)
        version = getattr(obj, "version", "v1.0")
        log.info("Loaded area model from %s (version=%s)", pkl_path, version)
        return obj, version
    except Exception as exc:
        log.warning("Could not load area model (%s) — falling back to SQL aggregation.", exc)
        return None, None


def _ensure_model() -> None:
    global _cached_model, _cached_version
    if _cached_model is None and _cached_version is None:
        _cached_model, _cached_version = _load_model()


def _fvec(
    area: str,
    time_window: str,
    weather_severity: float,
    is_weekend: int,
    is_festival_day: int,
    is_monsoon_month: int,
) -> list[float]:
    area_onehot = [int(area == a) for a in _NONREF_AREAS]
    return area_onehot + [
        int(time_window == "morning"),
        int(time_window == "evening"),
        is_weekend,
        float(weather_severity),
        is_festival_day,
        is_monsoon_month,
    ]


def _current_is_monsoon() -> int:
    """June–September is monsoon season in Chennai."""
    return int(datetime.now(timezone.utc).month in (6, 7, 8, 9))


def predict_failure_rate(
    area: str,
    time_window: str,
    weather_severity: float = 0.15,
    is_weekend: int = 0,
    is_festival_day: int = 0,
    is_monsoon_month: int | None = None,
) -> float | None:
    """
    Predict failure rate for a single area + time_window combination.
    Returns float [0, 1] or None if model not loaded.
    is_monsoon_month defaults to the current calendar month.
    """
    _ensure_model()
    if _cached_model is None:
        return None
    if is_monsoon_month is None:
        is_monsoon_month = _current_is_monsoon()
    fvec = np.array([_fvec(area, time_window, weather_severity,
                            is_weekend, is_festival_day, is_monsoon_month)])
    pred = float(_cached_model.predict(fvec)[0])
    return round(max(0.0, min(1.0, pred)), 4)


def predict_area_aggregate(
    area: str,
    weather_severity: float = 0.15,
    is_weekend: int = 0,
    is_festival_day: int = 0,
    is_monsoon_month: int | None = None,
) -> float | None:
    """
    Average predicted failure rate across all three time windows.
    Used for the default heatmap view (no time_slot filter).
    Returns None if model not loaded.
    """
    _ensure_model()
    if _cached_model is None:
        return None
    if is_monsoon_month is None:
        is_monsoon_month = _current_is_monsoon()
    rates = [
        predict_failure_rate(area, tw, weather_severity, is_weekend,
                             is_festival_day, is_monsoon_month)
        for tw in TIME_WINDOWS
    ]
    return round(sum(rates) / len(rates), 4)  # type: ignore[arg-type]


def is_loaded() -> bool:
    _ensure_model()
    return _cached_model is not None
