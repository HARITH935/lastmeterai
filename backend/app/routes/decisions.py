"""
Decisions blueprint  ·  /api/decisions/*

Thin HTTP adapters — all logic in decision_service.
Implements docs/api/contract.md §4 — Decisions.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User, Order
from app.services import decision_service
from app.services.decision_service import DecisionNotFound, Forbidden

bp = Blueprint("decisions", __name__, url_prefix="/api/decisions")


def _err(code: str, msg: str, status: int, details: dict | None = None):
    return jsonify({"error": code, "message": msg, "details": details or {}}), status


def _current_user() -> User:
    return db.session.get(User, int(get_jwt_identity()))


# ── POST /api/decisions/predict ───────────────────────────────────────────────

@bp.post("/predict")
@jwt_required()
def predict():
    """
    👔 Manager only.
    Runs the full GO/NO-GO pipeline for an existing order.
    Creates a new Decision row (re-prediction is always allowed — e.g. after
    weather changes or manual manager review).
    """
    current_user = _current_user()
    if not current_user.is_manager:
        return _err("FORBIDDEN", "Manager access required.", 403)

    body = request.get_json(silent=True) or {}
    order_id = body.get("order_id")
    if not order_id or not isinstance(order_id, int):
        return _err("VALIDATION_ERROR", "'order_id' (integer) is required.", 400)

    order = db.session.get(Order, order_id)
    if not order:
        return _err("ORDER_NOT_FOUND", f"Order {order_id} not found.", 404)

    try:
        decision = decision_service.predict_and_save(order)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return _err(
            "PREDICTION_FAILED",
            "GO/NO-GO prediction pipeline failed. Check model and weather configuration.",
            503,
            {"detail": str(exc)},
        )

    return jsonify(decision_service.format_decision(decision)), 201


# ── GET /api/decisions/:id ────────────────────────────────────────────────────

@bp.get("/<int:decision_id>")
@jwt_required()
def get_decision(decision_id: int):
    """
    👔🧢 Role-scoped.
    Manager: any decision.
    Agent: only decisions for orders in their own area.
    """
    current_user = _current_user()

    try:
        result = decision_service.get_decision(decision_id, current_user)
    except DecisionNotFound:
        return _err("DECISION_NOT_FOUND", f"Decision {decision_id} not found.", 404)
    except Forbidden:
        return _err("FORBIDDEN", "You do not have access to this decision.", 403)

    return jsonify(result), 200
