"""
Index B — historical GO/NO-GO decision logs. One Chroma document per
Decision row, with structured metadata (date, agent_id, area, decision,
risk_level, order_number) for hybrid semantic + filter retrieval.

Supports a full backfill (reindex_all) and incremental upsert of a single
decision (upsert_decision), so new decisions can be indexed as they're
created without a full rebuild.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def _decision_to_document(decision):
    """Build a langchain Document from a Decision row + its parent Order."""
    from langchain_core.documents import Document

    order = decision.order
    top_factors = decision.top_shap_factors
    factors_text = "; ".join(
        f"{name} {'+' if val >= 0 else ''}{val:.1f}%" for name, val in top_factors
    ) or "no individually significant factors (all |contribution| < 5%)"

    reschedule = decision.reschedule_suggestion or {}
    reschedule_text = ""
    if reschedule:
        reschedule_text = (
            f" Reschedule suggested: {reschedule.get('suggested_date', '?')}"
            f" ({reschedule.get('suggested_window', '?')}),"
            f" predicted success {round((reschedule.get('predicted_success_probability') or 0) * 100)}%"
            f" — {reschedule.get('reason', '')}"
        )

    weather = decision.weather_snapshot or {}
    weather_text = f" Weather at prediction time: {weather.get('description', 'unknown')}." if weather else ""

    text = (
        f"Order {order.order_number} in {order.area}, {order.city}. "
        f"Agent: {order.agent.name if order.agent else 'unassigned'}"
        f" (agent_id={order.agent_id}). "
        f"Decision: {decision.decision.value}, risk_score={decision.risk_score}"
        f" ({decision.risk_level.value} risk), "
        f"success_probability={round(decision.success_probability, 2)}. "
        f"Package: {order.package_size.value}, time window: {order.time_window.value},"
        f" residence: {order.residence_type.value}. "
        f"Top contributing factors: {factors_text}."
        f"{weather_text}{reschedule_text} "
        f"Decision made {decision.created_at.date().isoformat()} "
        f"(model {decision.model_name} v{decision.model_version})."
    )

    return Document(
        page_content=text,
        metadata={
            "decision_id": decision.id,
            "order_id": order.id,
            "order_number": order.order_number,
            "agent_id": order.agent_id or 0,
            "area": order.area,
            "decision": decision.decision.value,
            "risk_level": decision.risk_level.value,
            "date": decision.created_at.date().isoformat(),
            "citation": f"decision_log:{decision.id}",
        },
    )


def upsert_decision(decision) -> None:
    """Incrementally index a single decision — call this after a new
    Decision row is created, so Index B stays current without a full
    reindex. Silently no-ops on any embedding/index failure so it can never
    break the actual GO/NO-GO prediction pipeline."""
    from app.rag.vectorstore import get_vectorstore, DECISION_COLLECTION

    try:
        store = get_vectorstore(DECISION_COLLECTION)
        doc = _decision_to_document(decision)
        store.add_documents([doc], ids=[f"decision-{decision.id}"])
    except Exception as exc:
        log.warning("Could not index decision %s into RAG Index B: %s", decision.id, exc)


def reindex_all(batch_size: int = 200) -> int:
    """Full backfill of Index B from every Decision row currently in the
    database. Returns the number of decisions indexed."""
    from app.models import Decision
    from app.rag.vectorstore import get_vectorstore, DECISION_COLLECTION

    store = get_vectorstore(DECISION_COLLECTION)

    existing = store.get()
    if existing and existing.get("ids"):
        store.delete(ids=existing["ids"])

    # Newest first, capped. Without a persistent disk the index is rebuilt on
    # every cold start, and with API embeddings that cost scales with the row
    # count — at the free tier's ~90 texts/minute an unbounded backfill would
    # eventually take longer than anyone will wait for their first answer.
    # Historical questions are about recent patterns, so older rows earn their
    # keep least. Set RAG_MAX_INDEXED_DECISIONS=0 to index everything.
    from app.config import Config

    total = 0
    query = Decision.query.order_by(Decision.id.desc())
    if Config.RAG_MAX_INDEXED_DECISIONS:
        query = query.limit(Config.RAG_MAX_INDEXED_DECISIONS)
    batch_docs, batch_ids = [], []
    for decision in query.yield_per(batch_size):
        batch_docs.append(_decision_to_document(decision))
        batch_ids.append(f"decision-{decision.id}")
        if len(batch_docs) >= batch_size:
            store.add_documents(batch_docs, ids=batch_ids)
            total += len(batch_docs)
            batch_docs, batch_ids = [], []
    if batch_docs:
        store.add_documents(batch_docs, ids=batch_ids)
        total += len(batch_docs)

    log.info("Index B (decision_log) rebuilt: %d decisions.", total)
    return total
