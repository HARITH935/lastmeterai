"""
Model metadata blueprint  ·  /api/models/*

Admin / Model Comparison view (spec §2.10d). Manager-only, read-only.
Thin HTTP adapters — all logic in model_metadata_service.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User
from app.services import model_metadata_service
from app.services.model_metadata_service import NotFound

bp = Blueprint("models", __name__, url_prefix="/api/models")


def _err(code: str, msg: str, status: int, details: dict | None = None):
    return jsonify({"error": code, "message": msg, "details": details or {}}), status


def _current_user() -> User:
    return db.session.get(User, int(get_jwt_identity()))


def _require_manager(user: User):
    if not user.is_manager:
        return _err("FORBIDDEN", "Manager access required.", 403)
    return None


# ── GET /api/models ──────────────────────────────────────────────────────────
# Optional ?model_name=gonogo_lr filters to one model's version history.

@bp.get("")
@jwt_required()
def list_models():
    user = _current_user()
    if err := _require_manager(user):
        return err
    model_name = (request.args.get("model_name") or "").strip() or None
    return jsonify({"models": model_metadata_service.list_models(model_name)}), 200


# ── GET /api/models/production ───────────────────────────────────────────────
# Must be declared before /<int:model_id> so "production" isn't parsed as an id.

@bp.get("/production")
@jwt_required()
def production_models():
    user = _current_user()
    if err := _require_manager(user):
        return err
    return jsonify({"models": model_metadata_service.get_production_models()}), 200


# ── GET /api/models/<id> ─────────────────────────────────────────────────────

@bp.get("/<int:model_id>")
@jwt_required()
def get_model(model_id: int):
    user = _current_user()
    if err := _require_manager(user):
        return err
    try:
        return jsonify(model_metadata_service.get_model(model_id)), 200
    except NotFound as exc:
        return _err("NOT_FOUND", str(exc), 404)
