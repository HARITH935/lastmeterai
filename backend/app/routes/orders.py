"""
Orders blueprint  ·  /api/orders/*

Thin HTTP adapters — all logic in order_service.
Follows docs/api/contract.md §2 exactly.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from marshmallow import ValidationError

from app.extensions import db
from app.models import User
from app.schemas.order_schema import (
    OrderCreateSchema, OrderUpdateSchema, OrderStatusSchema, parse_list_filters
)
from app.services import order_service, route_service
from app.services.order_service import (
    OrderNotFound, Forbidden, AreaMismatch, InvalidTransition
)

bp = Blueprint("orders", __name__, url_prefix="/api/orders")

_create_schema = OrderCreateSchema()
_update_schema = OrderUpdateSchema()
_status_schema = OrderStatusSchema()


def _err(code: str, msg: str, status: int, details: dict | None = None):
    return jsonify({"error": code, "message": msg, "details": details or {}}), status


def _current_user() -> User:
    """Fetch the authenticated User from the JWT identity."""
    return db.session.get(User, int(get_jwt_identity()))


def _require_manager(current_user: User):
    if not current_user.is_manager:
        return _err("FORBIDDEN", "Manager access required.", 403)
    return None


def _require_agent(current_user: User):
    if not current_user.is_agent:
        return _err("FORBIDDEN", "This endpoint is for agents only.", 403)
    return None


# ── GET /api/orders ────────────────────────────────────────────────────────────

@bp.get("")
@jwt_required()
def list_orders():
    """
    👔🧢 Role-scoped
    Manager: all orders with full filter set.
    Agent: own area only — enforced in service layer.
    """
    current_user = _current_user()

    try:
        filters = parse_list_filters(request.args)
    except ValidationError as exc:
        return _err("INVALID_PARAM", "Invalid query parameters.", 400, exc.messages)

    result = order_service.list_orders(current_user, filters)
    return jsonify(result), 200


# ── POST /api/orders ───────────────────────────────────────────────────────────

@bp.post("")
@jwt_required()
def create_order():
    """👔 Manager only. Creates order and runs GO/NO-GO prediction stub."""
    current_user = _current_user()
    if err := _require_manager(current_user):
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _create_schema.load(body)
    except ValidationError as exc:
        return _err("VALIDATION_ERROR", "Invalid request body.", 400, exc.messages)

    try:
        order_dict, prediction_failed = order_service.create_order(current_user, data)
    except AreaMismatch as exc:
        return _err("AREA_MISMATCH", str(exc), 400)
    except ValueError as exc:
        if "AGENT_NOT_FOUND" in str(exc):
            return _err("AGENT_NOT_FOUND", "Agent not found or is not an agent account.", 404)
        return _err("VALIDATION_ERROR", str(exc), 400)

    if prediction_failed:
        # Order created but prediction failed — 503 per contract §2 POST /api/orders.
        return jsonify({**order_dict, "_warning": "PREDICTION_UNAVAILABLE"}), 503

    return jsonify(order_dict), 201


# ── GET /api/orders/optimized-route ──────────────────────────────────────────

@bp.get("/optimized-route")
@jwt_required()
def get_optimized_route():
    """🧢 Agent only. TSP-optimized route for today's pending/in_transit orders."""
    current_user = _current_user()
    if err := _require_agent(current_user):
        return err

    result = route_service.get_optimized_route(current_user)
    return jsonify(result), 200


# ── GET /api/orders/:id ────────────────────────────────────────────────────────

@bp.get("/<int:order_id>")
@jwt_required()
def get_order(order_id: int):
    """👔🧢 Full detail with nested latest_decision and SHAP factors."""
    current_user = _current_user()

    try:
        result = order_service.get_order(order_id, current_user)
    except OrderNotFound:
        return _err("ORDER_NOT_FOUND", f"Order {order_id} not found.", 404)
    except Forbidden:
        return _err("FORBIDDEN", "You do not have access to this order.", 403)

    return jsonify(result), 200


# ── PUT /api/orders/:id ────────────────────────────────────────────────────────

@bp.put("/<int:order_id>")
@jwt_required()
def update_order(order_id: int):
    """👔 Manager only. Full update; re-runs prediction if factor inputs changed."""
    current_user = _current_user()
    if err := _require_manager(current_user):
        return err

    body = request.get_json(silent=True) or {}

    # At least one recognised field must be present.
    recognised = {
        "customer_name", "customer_phone", "customer_address", "area",
        "latitude", "longitude", "residence_type", "agent_id",
        "package_size", "time_window", "deadline", "payment_amount",
    }
    if not any(k in body for k in recognised):
        return _err("VALIDATION_ERROR", "At least one field must be provided.", 400)

    try:
        data = _update_schema.load(body)
    except ValidationError as exc:
        return _err("VALIDATION_ERROR", "Invalid request body.", 400, exc.messages)

    try:
        result = order_service.update_order(order_id, current_user, data)
    except OrderNotFound:
        return _err("ORDER_NOT_FOUND", f"Order {order_id} not found.", 404)
    except AreaMismatch as exc:
        return _err("AREA_MISMATCH", str(exc), 400)
    except ValueError as exc:
        if "AGENT_NOT_FOUND" in str(exc):
            return _err("AGENT_NOT_FOUND", "Agent not found.", 404)
        return _err("VALIDATION_ERROR", str(exc), 400)

    return jsonify(result), 200


# ── DELETE /api/orders/:id ─────────────────────────────────────────────────────

@bp.delete("/<int:order_id>")
@jwt_required()
def delete_order(order_id: int):
    """👔 Manager only. Hard delete with CASCADE on decisions."""
    current_user = _current_user()
    if err := _require_manager(current_user):
        return err

    try:
        order_number = order_service.delete_order(order_id, current_user)
    except OrderNotFound:
        return _err("ORDER_NOT_FOUND", f"Order {order_id} not found.", 404)

    return jsonify({"message": f"Order {order_number} deleted successfully."}), 200


# ── PATCH /api/orders/:id/status ──────────────────────────────────────────────

@bp.patch("/<int:order_id>/status")
@jwt_required()
def update_status(order_id: int):
    """🧢 Agent only. Mark delivered / failed / postponed."""
    current_user = _current_user()
    if err := _require_agent(current_user):
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _status_schema.load(body)
    except ValidationError as exc:
        return _err("VALIDATION_ERROR", "Invalid request body.", 400, exc.messages)

    try:
        result = order_service.update_status(
            order_id,
            current_user,
            data["status"],
            data.get("failure_reason"),
        )
    except OrderNotFound:
        return _err("ORDER_NOT_FOUND", f"Order {order_id} not found.", 404)
    except Forbidden:
        return _err("FORBIDDEN", "You do not have access to this order.", 403)
    except InvalidTransition as exc:
        return _err("INVALID_TRANSITION", str(exc), 400)

    return jsonify(result), 200


# ── GET /api/orders/:id/reassign-suggestion ───────────────────────────────────

@bp.get("/<int:order_id>/reassign-suggestion")
@jwt_required()
def reassign_suggestion(order_id: int):
    """👔 Manager only. Returns top 3 agent suggestions for reassigning a failed order."""
    current_user = _current_user()
    if err := _require_manager(current_user):
        return err

    order = db.session.get(Order, order_id)
    if not order:
        return _err("ORDER_NOT_FOUND", f"Order {order_id} not found.", 404)

    from app.models.user import UserRole
    from sqlalchemy import func, case
    from app.models.order import OrderStatus

    # Score every active agent
    agents = (
        db.session.query(User)
        .filter(User.role == UserRole.AGENT, User.is_active == True)  # noqa: E712
        .all()
    )

    suggestions = []
    for agent in agents:
        # Pending order workload (fewer = better)
        pending_count = (
            db.session.query(func.count(Order.id))
            .filter(Order.agent_id == agent.id, Order.status == OrderStatus.PENDING)
            .scalar() or 0
        )

        # Area familiarity: delivered in same area
        area_delivered = (
            db.session.query(func.count(Order.id))
            .filter(
                Order.agent_id == agent.id,
                Order.area == order.area,
                Order.status == OrderStatus.DELIVERED,
            )
            .scalar() or 0
        )

        # Overall success rate
        total = db.session.query(func.count(Order.id)).filter(Order.agent_id == agent.id).scalar() or 0
        delivered = db.session.query(func.count(Order.id)).filter(
            Order.agent_id == agent.id, Order.status == OrderStatus.DELIVERED
        ).scalar() or 0
        success_rate = round(delivered / total, 3) if total else 0.5

        # Score: 50% success rate + 30% area familiarity (capped) + 20% availability (inverse workload)
        familiarity = min(area_delivered / 5.0, 1.0)          # cap at 5 orders
        availability = max(0, 1.0 - pending_count / 10.0)     # 0 workload = 1.0

        score = round(0.50 * success_rate + 0.30 * familiarity + 0.20 * availability, 3)

        suggestions.append({
            "agent_id":       agent.id,
            "agent_name":     agent.name,
            "area":           agent.area,
            "pending_orders": pending_count,
            "area_delivered": area_delivered,
            "success_rate":   success_rate,
            "score":          score,
            "reason": (
                f"{round(success_rate * 100)}% success rate"
                + (f", {area_delivered} prior deliveries in {order.area}" if area_delivered else "")
                + (f", {pending_count} pending order{'s' if pending_count != 1 else ''} today" if pending_count else ", free today")
            ),
        })

    suggestions.sort(key=lambda x: x["score"], reverse=True)
    return jsonify({"order_id": order_id, "area": order.area, "suggestions": suggestions[:3]}), 200


# ── GET /api/orders/:id/decision ──────────────────────────────────────────────

@bp.get("/<int:order_id>/decision")
@jwt_required()
def get_decision_history(order_id: int):
    """👔🧢 Paginated decision history for an order, newest-first."""
    current_user = _current_user()

    try:
        page     = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 5))))
    except (TypeError, ValueError):
        return _err("INVALID_PARAM", "page and per_page must be integers.", 400)

    try:
        result = order_service.get_decision_history(order_id, current_user, page, per_page)
    except OrderNotFound:
        return _err("ORDER_NOT_FOUND", f"Order {order_id} not found.", 404)
    except Forbidden:
        return _err("FORBIDDEN", "You do not have access to this order.", 403)

    return jsonify(result), 200
