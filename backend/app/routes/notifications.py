"""
Notifications blueprint  ·  /api/notifications/*

Thin HTTP adapters — all logic in notification_service.
Implements docs/api/contract.md §6 — Notifications.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User
from app.services import notification_service
from app.services.notification_service import (
    NotificationNotFound,
    Forbidden,
    InvalidCategory,
)

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def _err(code: str, msg: str, status: int, details: dict | None = None):
    return jsonify({"error": code, "message": msg, "details": details or {}}), status


def _current_user() -> User:
    return db.session.get(User, int(get_jwt_identity()))


# ── GET /api/notifications ────────────────────────────────────────────────────

@bp.get("")
@jwt_required()
def list_notifications():
    """
    👔🧢 Any authenticated user — own notifications only.
    """
    user = _current_user()

    is_read_str = request.args.get("is_read")
    is_read = None
    if is_read_str is not None:
        is_read = is_read_str.lower() in ("true", "1", "yes")

    filters = {
        "page":     request.args.get("page",     1),
        "per_page": request.args.get("per_page", 20),
        "category": request.args.get("category") or None,
        "is_read":  is_read,
    }

    try:
        result = notification_service.list_notifications(user, filters)
    except InvalidCategory as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)

    return jsonify(result), 200


# ── PATCH /api/notifications/read-all ────────────────────────────────────────

@bp.patch("/read-all")
@jwt_required()
def read_all():
    """
    👔🧢 Any authenticated user — marks own notifications read.
    Optional body: {"category": "<category>"} to restrict to one category.
    Single bulk UPDATE — not a loop.
    """
    user  = _current_user()
    body  = request.get_json(silent=True) or {}
    cat   = body.get("category") or None

    try:
        result = notification_service.mark_all_read(user, cat)
    except InvalidCategory as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)

    return jsonify(result), 200


# ── PATCH /api/notifications/:id/read ────────────────────────────────────────

@bp.patch("/<int:notification_id>/read")
@jwt_required()
def mark_read(notification_id: int):
    """
    👔🧢 Any authenticated user — own notifications only.
    Idempotent: marking an already-read notification returns 200.
    """
    user = _current_user()

    try:
        result = notification_service.mark_read(notification_id, user)
    except NotificationNotFound:
        return _err("NOTIFICATION_NOT_FOUND", f"Notification {notification_id} not found.", 404)
    except Forbidden:
        return _err("FORBIDDEN", "You do not have access to this notification.", 403)

    return jsonify(result), 200


# ── DELETE /api/notifications/:id ────────────────────────────────────────────

@bp.delete("/<int:notification_id>")
@jwt_required()
def delete_notification(notification_id: int):
    """
    👔🧢 Any authenticated user — own notifications only.
    """
    user = _current_user()

    try:
        notification_service.delete_notification(notification_id, user)
    except NotificationNotFound:
        return _err("NOTIFICATION_NOT_FOUND", f"Notification {notification_id} not found.", 404)
    except Forbidden:
        return _err("FORBIDDEN", "You do not have access to this notification.", 403)

    return jsonify({"message": f"Notification {notification_id} deleted."}), 200
