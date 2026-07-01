"""
Chat service — AI Chat pipeline (spec §2.11).

Pipeline per message:
  1. NLP intent classifier → (intent, confidence)
  2. If confidence < CONFIDENCE_THRESHOLD → reclassify as "general"
  3. Persist user ChatHistory row (intent + confidence stored)
  4. Fetch relevant context data for the detected intent
  5. Generate Gemini reply (falls back to intent template on any error)
  6. Persist assistant ChatHistory row (context_data + reply + token count)
  7. Return response dict

Role-scoping rules (mirrors the pattern in analytics_service.py):
  - Agent user  → data fetches filtered to their area (Order.area == user.area)
  - Manager     → unfiltered / full-team view
"""

from __future__ import annotations

import uuid
import logging

from sqlalchemy import func

from app.extensions import db
from app.models import Order, Decision, User
from app.models.chat_history import ChatHistory, MessageRole, ChatIntent
from app.models.decision import DecisionType
from app.models.order import OrderStatus
from app.ml import intent_predictor
from app.ml.intent_predictor import CONFIDENCE_THRESHOLD

log = logging.getLogger(__name__)


# ── Context fetchers (one per intent) ─────────────────────────────────────────

def _ctx_order_status(user) -> dict:
    """
    Return the 5 most recent orders scoped by role.
    Agent: own area only.  Manager: all areas.
    """
    q = db.session.query(Order).order_by(Order.created_at.desc())
    if not user.is_manager:
        q = q.filter(Order.area == user.area)
    orders = q.limit(5).all()
    return {
        "scope": "all_areas" if user.is_manager else f"own_area ({user.area})",
        "recent_orders": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "customer_name": o.customer_name,
                "area": o.area,
                "status": o.status.value,
                "time_window": o.time_window.value,
                "is_urgent": o.is_urgent,
            }
            for o in orders
        ],
    }


def _ctx_earnings_query(user) -> dict:
    from app.services import analytics_service
    return analytics_service.get_cost_savings(user, "week")


def _ctx_area_risk(_user) -> dict:
    from app.services import analytics_service
    return analytics_service.get_heatmap()


def _ctx_reassign_suggestion(_user) -> dict:
    """
    Return pending-order count per area — workload map a manager can use to
    decide where to redistribute.  Not filtered by role; this intent is only
    meaningful to managers, but the data itself is not sensitive.
    """
    rows = (
        db.session.query(Order.area, func.count(Order.id).label("pending"))
        .filter(Order.status == OrderStatus.PENDING)
        .group_by(Order.area)
        .order_by(func.count(Order.id).desc())
        .all()
    )
    return {
        "workload_by_area": [
            {"area": r.area, "pending_orders": r.pending}
            for r in rows
        ],
    }


def _ctx_weather_query(_user) -> dict:
    from app.services import analytics_service
    return analytics_service.get_weather_impact("week")


def _ctx_agent_performance(_user) -> dict:
    from app.services import analytics_service
    return analytics_service.get_kpi("week")


def _ctx_postpone_query(user) -> dict:
    """
    Return recent NO-GO orders still in a PENDING or IN_TRANSIT state —
    these are the clearest candidates for postponement.
    Agent: own area.  Manager: all areas.
    """
    q = (
        db.session.query(Order)
        .join(Decision, Decision.order_id == Order.id)
        .filter(Decision.decision == DecisionType.NO_GO)
        .filter(Order.status.in_([OrderStatus.PENDING]))
        .order_by(Decision.created_at.desc())
    )
    if not user.is_manager:
        q = q.filter(Order.area == user.area)
    orders = q.limit(10).all()
    return {
        "scope": "all_areas" if user.is_manager else f"own_area ({user.area})",
        "no_go_candidates": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "area": o.area,
                "status": o.status.value,
                "time_window": o.time_window.value,
                "risk_level": (
                    o.latest_decision.risk_level.value if o.latest_decision else None
                ),
                "success_probability": (
                    o.latest_decision.success_probability if o.latest_decision else None
                ),
            }
            for o in orders
        ],
    }


def _ctx_general(_user) -> dict:
    return {}


_CONTEXT_FETCHERS = {
    ChatIntent.ORDER_STATUS:          _ctx_order_status,
    ChatIntent.EARNINGS_QUERY:        _ctx_earnings_query,
    ChatIntent.AREA_RISK:             _ctx_area_risk,
    ChatIntent.REASSIGN_SUGGESTION:   _ctx_reassign_suggestion,
    ChatIntent.WEATHER_QUERY:         _ctx_weather_query,
    ChatIntent.AGENT_PERFORMANCE:     _ctx_agent_performance,
    ChatIntent.POSTPONE_QUERY:        _ctx_postpone_query,
    ChatIntent.GENERAL:               _ctx_general,
}


# ── Main handler ───────────────────────────────────────────────────────────────

def handle_chat_message(user, message_text: str, session_id: str | None = None) -> dict:
    """
    Process one chat message.

    Parameters
    ----------
    user        : authenticated User ORM object
    message_text: raw message string from the request body
    session_id  : optional UUID string (frontend groups messages by session).
                  If None, a new session UUID is generated.

    Returns
    -------
    dict with keys:
        user_message_id : int    — ChatHistory.id of the stored user row
        session_id      : str    — UUID used (generated if not supplied)
        intent          : str    — detected intent label (may be "general" via threshold)
        intent_confidence: float — raw classifier confidence (before threshold reclassification)
        threshold_applied: bool  — True if raw_intent was overridden to "general"
        context_data    : dict   — intent-relevant data fetched from the DB
        reply           : str    — Gemini-generated reply, or intent fallback template if Gemini unavailable
        model_loaded    : bool   — whether the intent classifier was available
    """
    if not session_id:
        session_id = str(uuid.uuid4())

    # 1. Classify intent
    raw_intent, confidence = intent_predictor.predict_intent(message_text)
    model_loaded = raw_intent is not None

    if raw_intent is None:
        # model absent — fall through to general
        effective_intent = ChatIntent.GENERAL
        confidence = 0.0
        threshold_applied = False
    elif confidence < CONFIDENCE_THRESHOLD:
        # low confidence — reclassify as general
        effective_intent = ChatIntent.GENERAL
        threshold_applied = True
    else:
        effective_intent = raw_intent
        threshold_applied = False

    # 2. Persist user message
    user_row = ChatHistory(
        user_id=user.id,
        role=MessageRole.USER,
        message=message_text,
        intent=effective_intent,
        intent_confidence=round(confidence, 4) if confidence else None,
        session_id=session_id,
    )
    db.session.add(user_row)
    db.session.flush()  # assign .id without committing yet

    # 3. Fetch context data
    fetcher = _CONTEXT_FETCHERS.get(effective_intent, _ctx_general)
    try:
        context_data = fetcher(user)
    except Exception as exc:
        log.warning("Context fetch failed for intent %r: %s", effective_intent, exc)
        context_data = {"error": "context fetch failed", "detail": str(exc)}

    # 4. Generate Gemini reply (falls back to intent template on any error)
    from app.services import gemini_service
    user_role = "manager" if user.is_manager else "agent"
    reply, gemini_tokens = gemini_service.generate_reply(
        user_role, effective_intent, context_data, message_text
    )

    # 5. Persist assistant row
    assistant_row = ChatHistory(
        user_id=user.id,
        role=MessageRole.ASSISTANT,
        message=reply,
        intent=None,
        intent_confidence=None,
        context_data=context_data,
        gemini_tokens_used=gemini_tokens,
        session_id=session_id,
    )
    db.session.add(assistant_row)
    db.session.commit()

    return {
        "user_message_id":   user_row.id,
        "session_id":        session_id,
        "intent":            effective_intent,
        "intent_confidence": round(confidence, 4) if confidence else 0.0,
        "threshold_applied": threshold_applied,
        "context_data":      context_data,
        "reply":             reply,
        "model_loaded":      model_loaded,
    }
