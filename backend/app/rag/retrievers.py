"""
Per-route retrieval.

- retrieve_policy            → Index A, pure semantic search (no structured
                                filters apply to policy text).
- retrieve_historical         → Index B, hybrid: semantic search + a Chroma
                                metadata `where` filter built from the
                                router's extracted filters, then always
                                intersected with the caller's role scope
                                (agent → own area only, mirroring
                                chat_service.py).
- build_live_decision_context → No retrieval at all — queries Order/Decision
                                directly and returns the SHAP breakdown
                                verbatim, per the "SHAP fed directly into
                                context, not retrieved" requirement.

Every function returns (context_blocks, sources) where context_blocks is a
list of plain-text strings to feed the generation prompt and sources is a
list of {citation, description} dicts for the response's cited-sources list.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def retrieve_policy(query: str, k: int) -> tuple[list[str], list[dict]]:
    from app.rag.vectorstore import get_vectorstore, SOP_COLLECTION

    store = get_vectorstore(SOP_COLLECTION)
    results = store.similarity_search(query, k=k)

    blocks, sources = [], []
    for doc in results:
        citation = doc.metadata.get("citation", "SOP:unknown")
        blocks.append(f"[{citation}] {doc.page_content}")
        sources.append({
            "citation": citation,
            "description": doc.metadata.get("source_title", doc.metadata.get("source", "SOP")),
        })
    return blocks, sources


def _apply_role_scope(where: dict, user) -> dict:
    if user is not None and not user.is_manager and user.area:
        where = dict(where)
        where["area"] = user.area
    return where


def retrieve_historical(query: str, filters: dict, k: int, user=None) -> tuple[list[str], list[dict]]:
    from app.rag.vectorstore import get_vectorstore, DECISION_COLLECTION

    where: dict = {}
    if filters.get("agent_id"):
        where["agent_id"] = filters["agent_id"]
    if filters.get("area"):
        where["area"] = filters["area"]
    if filters.get("decision"):
        where["decision"] = filters["decision"]
    where = _apply_role_scope(where, user)

    # Every key must match. Scoping is applied here, before ranking, so an
    # agent's results are drawn only from their own area rather than filtered
    # down afterwards from a pool that included everyone's.
    store = get_vectorstore(DECISION_COLLECTION)
    results = store.similarity_search(query, k=k, filter=where or None)

    # Date range is a post-filter: the store only does equality matching.
    date_from = filters.get("date_from")
    date_to = filters.get("date_to")
    if date_from or date_to:
        results = [
            d for d in results
            if (not date_from or d.metadata.get("date", "") >= date_from)
            and (not date_to or d.metadata.get("date", "") <= date_to)
        ]

    blocks, sources = [], []
    for doc in results:
        citation = doc.metadata.get("citation", "decision_log:unknown")
        blocks.append(f"[{citation}] {doc.page_content}")
        sources.append({
            "citation": citation,
            "description": f"Order {doc.metadata.get('order_number', '?')} — {doc.metadata.get('decision', '?')}",
        })
    return blocks, sources


def build_live_decision_context(filters: dict, user=None) -> tuple[list[str], list[dict]]:
    """Direct DB lookup — no vector retrieval. Finds the single most relevant
    Order/Decision matching the filters and returns its SHAP breakdown
    verbatim, exactly as computed by the model (not paraphrased/retrieved)."""
    from sqlalchemy import func
    from app.extensions import db
    from app.models import Order, Decision

    q = db.session.query(Order).join(Decision, Decision.order_id == Order.id)

    if filters.get("order_number"):
        q = q.filter(Order.order_number == filters["order_number"])
    if filters.get("agent_id"):
        q = q.filter(Order.agent_id == filters["agent_id"])
    if filters.get("area"):
        q = q.filter(Order.area == filters["area"])
    if filters.get("decision"):
        from app.models.decision import DecisionType
        q = q.filter(Decision.decision == DecisionType(filters["decision"]))
    if filters.get("date_from"):
        q = q.filter(func.date(Decision.created_at) >= filters["date_from"])
    if filters.get("date_to"):
        q = q.filter(func.date(Decision.created_at) <= filters["date_to"])

    if user is not None and not user.is_manager and user.area:
        q = q.filter(Order.area == user.area)

    order = q.order_by(Decision.created_at.desc()).first()
    if not order:
        return [], []

    decision = order.latest_decision
    if decision is None:
        return [], []

    top_factors = decision.top_shap_factors
    factors_text = "; ".join(
        f"{name}: {'+' if val >= 0 else ''}{val:.1f}% toward NO-GO" for name, val in top_factors
    ) or "no individually significant factors (all under 5% contribution)"

    citation = f"decision_log:{decision.id}"
    block = (
        f"[{citation}] LIVE DECISION — Order {order.order_number}, {order.area}, "
        f"agent {order.agent.name if order.agent else 'unassigned'}. "
        f"Decision: {decision.decision.value} "
        f"(risk_score={decision.risk_score}, {decision.risk_level.value} risk, "
        f"success_probability={round(decision.success_probability, 2)}). "
        f"SHAP factor breakdown (signed % contribution toward NO-GO): {factors_text}. "
        f"Decided {decision.created_at.date().isoformat()}."
    )

    return [block], [{
        "citation": citation,
        "description": f"Live SHAP explanation — Order {order.order_number}",
    }]
