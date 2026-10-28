"""
RAG blueprint  ·  /api/rag/*

Natural-language Q&A over SOP policy docs, historical GO/NO-GO decisions,
and live SHAP explanations. Both agent and manager roles can access this
endpoint; role-based data scoping is applied inside app.rag.retrievers
(agents see own-area decisions only, mirroring chat_service.py).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db, limiter
from app.models import User
from app.rag import service

bp = Blueprint("rag", __name__, url_prefix="/api/rag")


def _err(code: str, msg: str, status: int):
    return jsonify({"error": code, "message": msg}), status


def _current_user() -> User:
    return db.session.get(User, int(get_jwt_identity()))


# ── POST /api/rag/query ────────────────────────────────────────────────────

@bp.post("/query")
@jwt_required()
@limiter.limit("10 per minute")
def query():
    """
    Ask a natural-language question grounded in SOP docs / decision history.

    Request body (JSON):
        query : str — the question (required)

    Response body:
        answer          : str  — grounded, cited answer (or explicit refusal)
        route           : str  — policy_lookup | historical_lookup | live_decision_explanation
        filters_applied : dict — structured filters extracted from the query
        sources         : list[{citation, description}] — cited sources
        tokens_used     : int | None
    """
    body = request.get_json(silent=True) or {}
    question = (body.get("query") or "").strip()
    if not question:
        return _err("VALIDATION_ERROR", "Field 'query' is required and must not be empty.", 400)

    user = _current_user()
    result = service.answer_query(user, question)
    return jsonify(result), 200
