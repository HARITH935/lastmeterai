"""
Model metadata service — admin/Model Comparison view (spec §2.10d).

Read-only queries over the model_metadata table so the manager dashboard can
compare training runs, inspect metrics/feature-importance, and see which
version of each model is live — without hitting MLflow directly.

All logic lives here; routes/models.py is a thin HTTP adapter.
"""

from __future__ import annotations

from app.extensions import db
from app.models import ModelMetadata


class NotFound(Exception):
    """Raised when a requested model row does not exist."""


def list_models(model_name: str | None = None) -> list[dict]:
    """
    Return all model_metadata rows, newest training run first.
    Optionally filter to a single model_name (e.g. "gonogo_lr") for the
    version-comparison view.
    """
    q = db.session.query(ModelMetadata)
    if model_name:
        q = q.filter(ModelMetadata.model_name == model_name)
    rows = q.order_by(
        ModelMetadata.model_name.asc(),
        ModelMetadata.trained_at.desc(),
    ).all()
    return [r.to_dict() for r in rows]


def get_model(model_id: int) -> dict:
    """Return a single model_metadata row by id, or raise NotFound."""
    row = db.session.get(ModelMetadata, model_id)
    if row is None:
        raise NotFound(f"No model metadata with id={model_id}.")
    return row.to_dict()


def get_production_models() -> list[dict]:
    """
    Return the currently-live row for each model_name (is_production=True).
    At most one production row exists per model_name (enforced at training time),
    so this is the "what's deployed right now" summary.
    """
    rows = (
        db.session.query(ModelMetadata)
        .filter(ModelMetadata.is_production.is_(True))
        .order_by(ModelMetadata.model_name.asc())
        .all()
    )
    return [r.to_dict() for r in rows]
