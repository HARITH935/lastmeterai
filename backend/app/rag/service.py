"""
RAG orchestrator — public entrypoint for the /api/rag/query route.

Pipeline: route → retrieve (per-route) → rerank → grounded generate →
return {answer, sources, route, filters_applied}.

Lazy-indexes on first use: since Render's web service has no persistent
disk, the Chroma collections don't survive a restart, so rather than
requiring a manual reindex after every deploy, this checks each collection's
count() and rebuilds it automatically the first time it's queried after a
cold start. Subsequent queries in the same running instance reuse the
already-built index.
"""

from __future__ import annotations

import logging

from app.rag.router import QueryRoute, classify, extract_filters

log = logging.getLogger(__name__)


def _ensure_indexed() -> None:
    from app.rag.vectorstore import collection_count, SOP_COLLECTION, DECISION_COLLECTION
    from app.rag import sop_loader, decision_indexer

    if collection_count(SOP_COLLECTION) == 0:
        sop_loader.reindex()

    # Checking against 0 alone isn't enough for decisions: the incremental
    # upsert hook (decision_service.py) creates the Chroma collection the
    # first time ANY single decision is saved, which makes count() nonzero
    # while still missing every decision that existed before that moment —
    # a silently incomplete index that looks "already built" forever after.
    # Comparing against the real DB row count catches that partial state.
    # Compared against the *capped* expectation, not the raw row count: the
    # backfill only indexes the newest RAG_MAX_INDEXED_DECISIONS rows, so once
    # the table grows past the cap a raw comparison would never be satisfied
    # and every single query would trigger a full rebuild.
    from app.config import Config
    from app.models import Decision

    expected = Decision.query.count()
    if Config.RAG_MAX_INDEXED_DECISIONS:
        expected = min(expected, Config.RAG_MAX_INDEXED_DECISIONS)
    if collection_count(DECISION_COLLECTION) < expected:
        decision_indexer.reindex_all()


def answer_query(user, query: str) -> dict:
    """
    Parameters
    ----------
    user  : authenticated User ORM object (role-scopes historical/live retrieval)
    query : raw natural-language question

    Returns
    -------
    dict with keys: answer, route, filters_applied, sources, tokens_used
    """
    from app.config import Config

    filters = extract_filters(query)
    route = classify(query, filters)

    # Set when the user named a specific order that produced no record, so the
    # answer can say so instead of silently answering about different orders.
    unavailable_order = None

    try:
        blocks, sources = [], []

        # One concrete order with a stored decision is the only case worth
        # answering from a single source: the SHAP breakdown for that exact
        # record is the answer, and nothing else competes with it.
        if route == QueryRoute.LIVE_DECISION_EXPLANATION and filters.get("order_number"):
            from app.rag.retrievers import build_live_decision_context
            blocks, sources = build_live_decision_context(filters, user)
            if not blocks:
                unavailable_order = filters.get("order_number")

        if not blocks:
            # Otherwise search BOTH indexes and let the reranker choose.
            # Routing used to be a hard switch, so any misroute guaranteed a
            # refusal: the keyword lists can't cover real phrasing, and the
            # policy answer simply isn't in the decision log (or vice versa).
            # Measured on 21 realistic questions, this took the share whose
            # answering source actually reached the model from 15 to 20.
            _ensure_indexed()
            from app.rag.retrievers import retrieve_policy, retrieve_historical
            p_blocks, p_sources = retrieve_policy(query, Config.RAG_TOP_K)
            h_blocks, h_sources = retrieve_historical(query, filters, Config.RAG_TOP_K, user)

            if Config.RAG_RERANK_ENABLED:
                # Let the cross-encoder allocate all the slots.
                blocks, sources = p_blocks + h_blocks, p_sources + h_sources
            else:
                # Without a reranker, concatenating and truncating would hand
                # every slot to whichever list came first — all policy docs,
                # no decisions. Split the budget instead, so both sources
                # reach the model. Scored identically (20/21) to reranking.
                half = max(1, Config.RAG_TOP_K // 2)
                blocks = p_blocks[:half] + h_blocks[:half]
                sources = p_sources[:half] + h_sources[:half]
    except Exception as exc:
        log.warning("RAG retrieval failed for route %s: %s", route.value, exc)
        return {
            "answer": "Search is temporarily unavailable — please try again shortly.",
            "route": route.value,
            "filters_applied": filters,
            "sources": [],
            "tokens_used": None,
        }

    from app.rag.reranker import rerank
    blocks, sources = rerank(query, blocks, sources, top_n=Config.RAG_TOP_K)


    # The historical fallback above searches on everything *except* the order
    # number, so without this an agent asking about an order outside their area
    # gets a confident answer about a different order, with nothing saying so.
    if unavailable_order:
        is_agent = user is not None and not user.is_manager
        notice = (
            f"I don't have a decision record for {unavailable_order} that you can "
            f"access — it may not exist, or it may be outside your area."
            if is_agent
            else f"I couldn't find a decision record for {unavailable_order}."
        )
        if not sources:
            answer, tokens_used = notice, None
        else:
            # Deliberately not synthesized. The question names an order that
            # isn't there, so asking the model to answer it over *other* orders
            # produces either a second refusal (contradicting the heading right
            # above it) or prose about the wrong order — the exact confusion
            # this notice exists to prevent. Listing them plainly is honest,
            # and costs no generation quota.
            from app.rag.generation import _fallback_answer
            heading = "Related decisions from your area:" if is_agent else "Related decisions:"
            answer = f"{notice}\n\n{heading}\n\n{_fallback_answer(blocks, sources, lead_in=False)}"
            tokens_used = None
    else:
        from app.rag.generation import generate_answer
        answer, tokens_used = generate_answer(query, blocks, sources)

    return {
        "answer": answer,
        "route": route.value,
        "filters_applied": filters,
        "sources": sources,
        "tokens_used": tokens_used,
    }
