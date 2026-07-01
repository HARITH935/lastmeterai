"""
SHAP explainer — formats factor contributions for API responses and Decision storage.

Delegates raw computation to predictor.compute_shap_pct().
This layer owns: sorting, threshold filtering, and dict serialisation.
"""

from __future__ import annotations

from app.ml.predictor import FeatureVector, compute_shap_pct


def explain(features: FeatureVector) -> dict[str, float]:
    """
    Return raw SHAP dict {factor_name: pct_contribution_toward_no_go}.
    Positive = pushes delivery toward NO-GO.
    Negative = pushes delivery toward GO.
    Sum of |values| = 100.
    """
    return compute_shap_pct(features)


def top_factors(features: FeatureVector) -> list[dict]:
    """
    Return factors sorted by absolute contribution (descending),
    filtered to those with |contribution| >= 5.0 (i.e. ≥5% of explanation).

    Returns list of {"factor": str, "contribution": float} dicts,
    matching the contract's top_factors response shape.
    """
    raw = explain(features)
    return [
        {"factor": name, "contribution": contrib}
        for name, contrib in sorted(raw.items(), key=lambda x: abs(x[1]), reverse=True)
        if abs(contrib) >= 5.0
    ]


def format_stored_top_factors(shap_values: dict[str, float]) -> list[dict]:
    """
    Convert a stored shap_values dict (from Decision.shap_values) to the
    top_factors response shape, applying the same 5% threshold.
    This avoids re-computing SHAP when serialising an existing Decision row.
    """
    return [
        {"factor": name, "contribution": round(contrib, 1)}
        for name, contrib in sorted(shap_values.items(), key=lambda x: abs(x[1]), reverse=True)
        if abs(contrib) >= 5.0
    ]
