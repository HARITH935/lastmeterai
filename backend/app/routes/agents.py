"""
Agents blueprint  ·  /api/agents/*

Manager-only. Agents are always pre-created by a Manager — no self-signup
(see app/models/user.py). Thin HTTP adapters — logic lives in agent_service.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User
from app.services import agent_service

bp = Blueprint("agents", __name__, url_prefix="/api/agents")


def _err(code: str, msg: str, status: int, details: dict | None = None):
    return jsonify({"error": code, "message": msg, "details": details or {}}), status


def _current_user() -> User:
    return db.session.get(User, int(get_jwt_identity()))


def _require_manager(user: User):
    if not user.is_manager:
        return _err("FORBIDDEN", "Manager access required.", 403)
    return None


# ── GET /api/agents ───────────────────────────────────────────────────────────

@bp.get("")
@jwt_required()
def list_agents():
    user = _current_user()
    if err := _require_manager(user):
        return err
    return jsonify({"agents": agent_service.list_agents()}), 200


# ── POST /api/agents ──────────────────────────────────────────────────────────

@bp.post("")
@jwt_required()
def create_agent():
    user = _current_user()
    if err := _require_manager(user):
        return err

    body = request.get_json(silent=True) or {}
    username = str(body.get("username") or "")
    password = str(body.get("password") or "")
    name     = str(body.get("name") or "")
    area     = str(body.get("area") or "")
    phone    = body.get("phone")

    try:
        agent = agent_service.create_agent(
            manager_id=get_jwt_identity(),
            username=username,
            password=password,
            name=name,
            area=area,
            phone=phone,
        )
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)

    return jsonify(agent), 201


# ── PATCH /api/agents/<id> ────────────────────────────────────────────────────
# Deactivate (is_active: false) or reactivate (is_active: true) an agent.
# Soft-delete only — see agent_service.set_agent_active for why.

@bp.patch("/<int:agent_id>")
@jwt_required()
def set_agent_active(agent_id: int):
    user = _current_user()
    if err := _require_manager(user):
        return err

    body = request.get_json(silent=True) or {}
    if "is_active" not in body or not isinstance(body["is_active"], bool):
        return _err("VALIDATION_ERROR", "is_active (boolean) is required.", 400)

    try:
        agent = agent_service.set_agent_active(
            manager_id=get_jwt_identity(),
            agent_id=agent_id,
            is_active=body["is_active"],
        )
    except ValueError as exc:
        msg = str(exc)
        code = "NOT_FOUND" if "not found" in msg.lower() else "VALIDATION_ERROR"
        status = 404 if code == "NOT_FOUND" else 400
        return _err(code, msg, status)

    return jsonify(agent), 200
