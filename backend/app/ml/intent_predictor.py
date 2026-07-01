"""
Chat intent classifier — A8 backend integration.

Loads intent_clf_v1.0.pkl (TF-IDF + LogisticRegression Pipeline)
trained in A7.  Classifies chat messages into one of 8 intents matching
ChatIntent labels in backend/app/models/chat_history.py:
  order_status | earnings_query | area_risk | reassign_suggestion |
  weather_query | agent_performance | postpone_query | general

CONFIDENCE THRESHOLD: 0.40
  If max(predict_proba) < 0.40, chat_service treats the message as
  "general" rather than acting on a low-confidence guess.
  Threshold derived from A7 hand-written test results: both observed
  misclassifications had confidence 0.276 and 0.510, sitting on either
  side of the weather/postpone and weather/area_risk boundary.  0.40
  catches the clear under-threshold case (0.276) without being so high
  that it discards good predictions.

Graceful fallback: if the model file is absent, predict_intent() returns
(None, None) and chat_service falls back to treating all messages as
"general".
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

# Messages with classifier confidence below this are reclassified as "general".
CONFIDENCE_THRESHOLD = 0.40

_cached_model = None
_cached_version: str | None = None


def _load_model():
    _default = Path(__file__).parent.parent.parent.parent / "ml" / "models"
    models_dir = Path(os.environ.get("ML_MODELS_DIR", str(_default)))
    pkl_path = models_dir / "intent_clf_v1.0.pkl"
    if not pkl_path.exists():
        log.info(
            "Intent classifier not found at %s — all messages will be treated as general.",
            pkl_path,
        )
        return None, None
    try:
        import joblib
        obj = joblib.load(pkl_path)
        version = getattr(obj, "version", "v1.0")
        log.info("Loaded intent classifier from %s (version=%s)", pkl_path, version)
        return obj, version
    except Exception as exc:
        log.warning(
            "Could not load intent classifier (%s) — treating all messages as general.",
            exc,
        )
        return None, None


def _ensure_model() -> None:
    global _cached_model, _cached_version
    if _cached_model is None and _cached_version is None:
        _cached_model, _cached_version = _load_model()


def predict_intent(text: str) -> tuple[str, float] | tuple[None, None]:
    """
    Classify a chat message, returning (intent_label, confidence).
    confidence = max(predict_proba) for the predicted class.
    Returns (None, None) if the model is not loaded.
    Callers should apply CONFIDENCE_THRESHOLD before acting on the intent.
    """
    _ensure_model()
    if _cached_model is None:
        return None, None
    label = str(_cached_model.predict([text])[0])
    conf  = float(max(_cached_model.predict_proba([text])[0]))
    return label, conf


def is_loaded() -> bool:
    _ensure_model()
    return _cached_model is not None
