"""
Chat blueprint  ·  /api/chat/*

Implements the AI Chat endpoint (spec §2.11).
Both agent and manager roles can access this endpoint.
Role-based data scoping is applied inside chat_service (agents see own area).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db, limiter
from app.models import User
from app.services import chat_service

bp = Blueprint("chat", __name__, url_prefix="/api/chat")


def _err(code: str, msg: str, status: int):
    return jsonify({"error": code, "message": msg}), status


def _current_user() -> User:
    return db.session.get(User, int(get_jwt_identity()))


# ── POST /api/chat/message ─────────────────────────────────────────────────────

@bp.post("/message")
@jwt_required()
@limiter.limit("10 per minute")
def send_message():
    """
    Send a chat message and receive a classified, context-enriched reply.

    Request body (JSON):
        message    : str  — the user's chat message (required)
        session_id : str  — UUID grouping messages into a conversation (optional)

    Response body:
        user_message_id  : int   — ChatHistory.id of the stored user row
        session_id       : str   — UUID used for this session
        intent           : str   — detected intent label
        intent_confidence: float — raw classifier confidence [0, 1]
        threshold_applied: bool  — True if low confidence forced fallback to "general"
        context_data     : dict  — backend data fetched for this intent
        reply            : str   — Gemini-generated reply, or intent fallback template
        model_loaded     : bool  — whether the intent classifier was available
    """
    body = request.get_json(silent=True) or {}
    message_text = (body.get("message") or "").strip()
    if not message_text:
        return _err("VALIDATION_ERROR", "Field 'message' is required and must not be empty.", 400)

    session_id = (body.get("session_id") or "").strip() or None

    user = _current_user()
    result = chat_service.handle_chat_message(user, message_text, session_id)
    return jsonify(result), 200
