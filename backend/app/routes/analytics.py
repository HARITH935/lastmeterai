"""
Analytics blueprint  ·  /api/analytics/*

Thin HTTP adapters — all logic in analytics_service.
Implements docs/api/contract.md §5 — Analytics.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User, Order
from app.services import analytics_service
from app.services.analytics_service import NotFound, Forbidden

bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")


def _err(code: str, msg: str, status: int, details: dict | None = None):
    return jsonify({"error": code, "message": msg, "details": details or {}}), status


def _current_user() -> User:
    return db.session.get(User, int(get_jwt_identity()))


def _require_manager(user: User):
    if not user.is_manager:
        return _err("FORBIDDEN", "Manager access required.", 403)
    return None


# ── GET /api/analytics/dashboard ─────────────────────────────────────────────

@bp.get("/dashboard")
@jwt_required()
def dashboard():
    user = _current_user()
    if err := _require_manager(user):
        return err
    return jsonify(analytics_service.get_dashboard()), 200


# ── GET /api/analytics/kpi ───────────────────────────────────────────────────

@bp.get("/kpi")
@jwt_required()
def kpi():
    user = _current_user()
    if err := _require_manager(user):
        return err
    period = request.args.get("period", "week")
    if period not in ("today", "week", "month"):
        return _err("VALIDATION_ERROR", "period must be today, week, or month.", 400)
    return jsonify(analytics_service.get_kpi(period)), 200


# ── GET /api/analytics/cost-savings ─────────────────────────────────────────

@bp.get("/cost-savings")
@jwt_required()
def cost_savings():
    user = _current_user()
    period = request.args.get("period", "all")
    if period not in ("today", "week", "month", "all"):
        return _err("VALIDATION_ERROR", "period must be today, week, month, or all.", 400)
    return jsonify(analytics_service.get_cost_savings(user, period)), 200


# ── GET /api/analytics/area/<area> ───────────────────────────────────────────

@bp.get("/area/<string:area>")
@jwt_required()
def area_analytics(area: str):
    user = _current_user()
    if err := _require_manager(user):
        return err
    if area not in Order.VALID_AREAS:
        return _err("INVALID_AREA", f"'{area}' is not a valid delivery area.", 400)
    time_slot = request.args.get("time_slot") or None
    if time_slot and time_slot not in ("morning", "afternoon", "evening"):
        return _err("VALIDATION_ERROR", "time_slot must be morning, afternoon, or evening.", 400)
    return jsonify(analytics_service.get_area_analytics(area, time_slot)), 200


# ── GET /api/analytics/customer ──────────────────────────────────────────────

@bp.get("/customer")
@jwt_required()
def customer_analytics():
    user = _current_user()
    if err := _require_manager(user):
        return err
    address = request.args.get("address", "").strip()
    if not address:
        return _err("VALIDATION_ERROR", "Query parameter 'address' is required.", 400)
    try:
        result = analytics_service.get_customer_analytics(address)
    except NotFound:
        return _err("NO_HISTORY_FOUND", "No order history found for this address.", 404)
    return jsonify(result), 200


# ── GET /api/analytics/heatmap ───────────────────────────────────────────────

@bp.get("/heatmap")
@jwt_required()
def heatmap():
    user = _current_user()
    if err := _require_manager(user):
        return err
    time_slot = request.args.get("time_slot") or None
    if time_slot and time_slot not in ("morning", "afternoon", "evening"):
        return _err("VALIDATION_ERROR", "time_slot must be morning, afternoon, or evening.", 400)
    return jsonify(analytics_service.get_heatmap(time_slot)), 200


# ── GET /api/analytics/area-intelligence/<area> ──────────────────────────────

@bp.get("/area-intelligence/<string:area_name>")
@jwt_required()
def area_intelligence(area_name: str):
    user = _current_user()
    if err := _require_manager(user):
        return err
    result = analytics_service.get_area_intelligence(area_name)
    if result is None:
        return _err("AREA_NOT_FOUND",
                    f"'{area_name}' is not a known delivery area. "
                    "Valid areas: Anna Nagar, T Nagar, Velachery, Adyar, Porur.", 404)
    return jsonify(result), 200


# ── GET /api/analytics/weather-impact ────────────────────────────────────────

@bp.get("/weather-impact")
@jwt_required()
def weather_impact():
    user = _current_user()
    if err := _require_manager(user):
        return err
    period = request.args.get("period", "week")
    if period not in ("week", "month"):
        return _err("VALIDATION_ERROR", "period must be week or month.", 400)
    return jsonify(analytics_service.get_weather_impact(period)), 200


# ── GET /api/analytics/leaderboard ───────────────────────────────────────────

@bp.get("/leaderboard")
@jwt_required()
def leaderboard():
    user = _current_user()
    if err := _require_manager(user):
        return err
    period = request.args.get("period", "week")
    if period not in ("today", "week", "month"):
        return _err("VALIDATION_ERROR", "period must be today, week, or month.", 400)
    return jsonify(analytics_service.get_leaderboard(period)), 200


# ── GET /api/analytics/daily-summary ─────────────────────────────────────────

@bp.get("/daily-summary")
@jwt_required()
def daily_summary():
    user = _current_user()
    if err := _require_manager(user):
        return err
    return jsonify(analytics_service.get_daily_summary()), 200


# ── GET /api/weather/current ─────────────────────────────────────────────────

from flask import Blueprint as _BP  # noqa: E402  (already imported above — re-used here)

weather_bp = Blueprint("weather", __name__, url_prefix="/api/weather")


@weather_bp.get("/current")
@jwt_required()
def current_weather():
    from app.services import weather_service
    data = weather_service.get_current_weather()
    if data is None:
        return jsonify({"error": "WEATHER_UNAVAILABLE",
                        "message": "Weather data is currently unavailable."}), 503
    return jsonify(data), 200
