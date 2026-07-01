"""
Failure-reason text classifier — A8 backend integration.

Loads failure_reason_clf_v1.0.pkl (TF-IDF + LogisticRegression Pipeline)
trained in A7.  Classifies free-text delivery failure reasons into:
  weather | customer | traffic | other

These strings match the bucket keys used by the existing keyword bucketing
in analytics_service.get_area_analytics() exactly, making this a drop-in
replacement with no downstream API shape change.

Graceful fallback: if the model file is absent, predict_category() returns
None and the caller falls back to keyword bucketing (same philosophy as
predictor.py's placeholder fallback).

Accuracy caveat: trained on synthetic template-based data — see
docs/progress.md Known Issue #4.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

CATEGORIES = ["weather", "customer", "traffic", "other"]

_cached_model = None
_cached_version: str | None = None


def _load_model():
    _default = Path(__file__).parent.parent.parent.parent / "ml" / "models"
    models_dir = Path(os.environ.get("ML_MODELS_DIR", str(_default)))
    pkl_path = models_dir / "failure_reason_clf_v1.0.pkl"
    if not pkl_path.exists():
        log.info(
            "Failure-reason classifier not found at %s — falling back to keyword bucketing.",
            pkl_path,
        )
        return None, None
    try:
        import joblib
        obj = joblib.load(pkl_path)
        version = getattr(obj, "version", "v1.0")
        log.info(
            "Loaded failure-reason classifier from %s (version=%s)", pkl_path, version
        )
        return obj, version
    except Exception as exc:
        log.warning(
            "Could not load failure-reason classifier (%s) — falling back to keyword bucketing.",
            exc,
        )
        return None, None


def _ensure_model() -> None:
    global _cached_model, _cached_version
    if _cached_model is None and _cached_version is None:
        _cached_model, _cached_version = _load_model()


def predict_category(text: str) -> str | None:
    """
    Classify a failure-reason string into one of: weather, customer, traffic, other.
    Returns None if the model is not loaded; callers fall back to keyword bucketing.
    """
    _ensure_model()
    if _cached_model is None:
        return None
    return str(_cached_model.predict([text])[0])


def is_loaded() -> bool:
    _ensure_model()
    return _cached_model is not None
