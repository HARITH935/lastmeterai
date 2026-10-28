"""
Cross-encoder reranking step (requirement 5: "optional but preferred") — on
by default (RAG_RERANK_ENABLED=true). Runs locally via sentence-transformers,
same as the embeddings — no extra API key or service, just a second small
local model loaded lazily on first use.

If the model fails to load for any reason (e.g. RAG_RERANK_ENABLED was
flipped off, or the model can't be fetched), rerank() falls back to a no-op
that just truncates to top_n, so callers never need to branch on whether
reranking actually happened.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)

_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import CrossEncoder
        from app.config import Config
        from app.rag import load_model_offline_first
        _model = load_model_offline_first(lambda: CrossEncoder(Config.RAG_RERANK_MODEL))
    return _model


def rerank(query: str, blocks: list[str], sources: list[dict], top_n: int) -> tuple[list[str], list[dict]]:
    from app.config import Config
    if not Config.RAG_RERANK_ENABLED or not blocks:
        return blocks[:top_n], sources[:top_n]

    try:
        model = _get_model()
        pairs = [(query, b) for b in blocks]
        scores = model.predict(pairs)
        ranked = sorted(zip(scores, blocks, sources), key=lambda t: t[0], reverse=True)
        top = ranked[:top_n]
        return [b for _, b, _ in top], [s for _, _, s in top]
    except Exception as exc:
        log.warning("Reranker unavailable (%s) — falling back to retrieval order.", exc)
        return blocks[:top_n], sources[:top_n]
