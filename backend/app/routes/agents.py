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
