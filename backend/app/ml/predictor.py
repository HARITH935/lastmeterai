"""
GO/NO-GO delivery predictor.

Loads a trained scikit-learn LogisticRegression from ML_MODELS_DIR/lr_gonogo_v1.0.pkl.
Falls back to a hand-coded placeholder when the model file is absent (dev/CI without
the trained artefact).

Feature encoding (all values in [0, 1]):
  weather_risk          — 0=clear sky, 1=severe storm
  customer_history_score— 0=unreliable (high historical failure rate), 1=reliable (low failure rate)
  traffic_impact        — 0=free flow, 1=gridlock
  agent_profit_score    — 0=unprofitable order, 1=high margin (higher = better)
  distance_score        — 0=near depot, 1=at delivery range limit
  time_of_day_score     — 0=easy window (morning), 1=difficult (evening)
  package_size_score    — 0=small parcel, 1=large/bulky
"""

from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


# ── Feature vector ─────────────────────────────────────────────────────────────

@dataclass
class FeatureVector:
    weather_risk:            float
    customer_history_score:  float
    traffic_impact:          float
    agent_profit_score:      float
    distance_score:          float
    time_of_day_score:       float
    package_size_score:      float

    def as_dict(self) -> dict[str, float]:
        return {
            "weather_risk":           self.weather_risk,
            "customer_history_score": self.customer_history_score,
            "traffic_impact":         self.traffic_impact,
            "agent_profit_score":     self.agent_profit_score,
            "distance_score":         self.distance_score,
            "time_of_day_score":      self.time_of_day_score,
            "package_size_score":     self.package_size_score,
        }


# ── Placeholder model: hand-coded logistic regression ─────────────────────────
#
# Used only when ml/models/lr_gonogo_v1.0.pkl is absent (dev/CI fallback).
# Sign convention: negative weight = more of this feature → lower success probability.
# customer_history_score uses new convention: 1 = reliable customer (positive weight).

_INTERCEPT = 1.80

_WEIGHTS: dict[str, float] = {
    "weather_risk":           -3.20,  # bad weather → NO-GO
    "customer_history_score": +1.80,  # reliable customer → GO (1=reliable, updated convention)
    "traffic_impact":         -1.10,  # congestion → NO-GO
    "agent_profit_score":     +1.40,  # higher margin → GO
    "distance_score":         -0.70,  # farther → more risk
    "time_of_day_score":      -0.55,  # evening → harder
    "package_size_score":     -0.85,  # large items → harder
}

# Baseline feature values (training data means) used for SHAP delta computation.
# customer_history_score baseline reflects new convention (1=reliable, mean≈0.61).
_BASELINE: dict[str, float] = {
    "weather_risk":           0.26,   # training mean
    "customer_history_score": 0.61,   # training mean (1=reliable)
    "traffic_impact":         0.47,   # training mean
    "agent_profit_score":     0.67,   # training mean
    "distance_score":         0.35,
    "time_of_day_score":      0.38,   # training mean (uniform across 3 windows)
    "package_size_score":     0.45,   # training mean (uniform across 3 sizes)
}

MODEL_NAME = "gonogo_lr"
PLACEHOLDER_VERSION = "v1.0-placeholder"


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


# Deliberate fallback — kept by design, not legacy code awaiting removal.
# This path runs only when lr_gonogo_v1.0.pkl is absent (dev/CI without the
# trained artifact) or when the real model's predict_proba call raises.
def _predict_placeholder(features: FeatureVector) -> float:
    fdict = features.as_dict()
    logit = _INTERCEPT + sum(_WEIGHTS[k] * fdict[k] for k in _WEIGHTS)
    return round(_sigmoid(logit), 4)


# ── Real model loader (swap point) ────────────────────────────────────────────

_cached_model = None
_cached_version: str | None = None


def _load_real_model():
    """
    Load trained LR model from ML_MODELS_DIR/lr_gonogo_v1.0.pkl.
    Returns (model, version_str) or (None, None) if file absent.
    Only called once; result cached in module globals.
    ML_MODELS_DIR env var overrides the default absolute path.
    """
    _default = Path(__file__).parent.parent.parent.parent / "ml" / "models"
    models_dir = Path(os.environ.get("ML_MODELS_DIR", str(_default)))
    pkl_path = models_dir / "lr_gonogo_v1.0.pkl"
    if not pkl_path.exists():
        log.info("Model file not found at %s — using placeholder.", pkl_path)
        return None, None
    try:
        import joblib  # noqa: PLC0415
        obj = joblib.load(pkl_path)
        version = getattr(obj, "version", "v1.0")
        log.info("Loaded real model from %s (version=%s)", pkl_path, version)
        return obj, version
    except Exception as exc:
        log.warning(
            "Could not load model from %s (%s) — using placeholder.", pkl_path, exc
        )
        return None, None


def _ensure_model():
    global _cached_model, _cached_version
    if _cached_model is None and _cached_version is None:
        _cached_model, _cached_version = _load_real_model()


def _predict_real(model, features: FeatureVector) -> float:
    """
    Interface contract for the real trained model.
    Expected: sklearn-style model with predict_proba([[f1..f7]]) -> [[p_no_go, p_go]].
    Feature order must match the training pipeline's column order.
    """
    import numpy as np  # noqa: PLC0415

    # Feature order is alphabetical to match training pipeline convention.
    fdict = features.as_dict()
    fvec = [[fdict[k] for k in sorted(fdict)]]
    return float(model.predict_proba(np.array(fvec))[0][1])


# ── Public API ─────────────────────────────────────────────────────────────────

def predict(features: FeatureVector) -> tuple[float, str]:
    """
    Run GO/NO-GO prediction.
    Returns (success_probability, model_version).
    Uses real .pkl if available; otherwise uses placeholder.
    """
    _ensure_model()
    if _cached_model is not None:
        try:
            return round(_predict_real(_cached_model, features), 4), _cached_version or "v1.0"
        except Exception as exc:
            log.warning("Real model predict failed (%s) — falling back to placeholder.", exc)
    return _predict_placeholder(features), PLACEHOLDER_VERSION


def compute_shap_pct(features: FeatureVector) -> dict[str, float]:
    """
    Compute SHAP-style percentage contributions toward NO-GO.

    Uses the analytical SHAP formula for linear models:
        shap_logit_i = w_i * (f_i - baseline_i)

    When the real LR model is loaded, w_i comes from model.coef_[0] (alphabetical
    feature order, matching the training pipeline). When absent, falls back to the
    hand-coded _WEIGHTS approximation.

    Positive shap_logit = factor pushes toward GO (reduces NO-GO pressure).
    We flip the sign so the stored values are "% contribution toward NO-GO":
        positive in the output = pushes toward NO-GO  (bad for delivery)
        negative in the output = pushes toward GO     (good for delivery)

    Values are normalized so sum of |values| = 100 (interpretable as percentages).
    """
    _ensure_model()
    fdict = features.as_dict()

    if _cached_model is not None:
        # Real model: coef_ is ordered by sorted(feature_names) = alphabetical order,
        # matching _predict_real() which also uses sorted(fdict).
        weights = dict(zip(sorted(fdict.keys()), _cached_model.coef_[0]))
    else:
        weights = _WEIGHTS

    # Raw logit SHAP: positive = helps success, negative = hurts success
    logit_shap = {
        name: weights[name] * (fdict[name] - _BASELINE[name])
        for name in weights
    }

    # Flip to NO-GO contribution space
    no_go = {name: -v for name, v in logit_shap.items()}

    # Normalize to sum of absolute values = 100
    total_abs = sum(abs(v) for v in no_go.values()) or 1.0
    return {name: round(v / total_abs * 100, 1) for name, v in no_go.items()}
