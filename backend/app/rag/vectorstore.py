"""
Chroma collection accessors for the two retrieval indexes.

Index A ("sop_policy")   — chunked SOP/policy markdown docs (ml/rag/docs/).
Index B ("decision_log") — one document per historical Decision row, with
                            structured metadata for hybrid (semantic + filter)
                            retrieval.

Embeddings run locally via sentence-transformers (no API key, no cost) — see
app/rag/__init__.py for why USE_TF/USE_FLAX are disabled before that import.

Render's web service has no persistent disk, so RAG_CHROMA_DIR only survives
for the lifetime of the running instance — the collections are rebuilt lazily
(service.py checks collection.count() == 0 and reindexes on first use) rather
than assumed to exist across deploys/restarts.
"""

from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger(__name__)

SOP_COLLECTION = "sop_policy"
DECISION_COLLECTION = "decision_log"

_client = None
_embeddings = None


def get_embeddings():
    """Local sentence-transformers embeddings — no API key, runs on-device.
    Cached at module level so the model is loaded into memory once per
    process, not once per request."""
    global _embeddings
    if _embeddings is None:
        from app.rag.embeddings import build_embeddings
        _embeddings = build_embeddings()
    return _embeddings


def _get_client():
    global _client
    if _client is None:
        import chromadb
        from app.config import Config
        persist_dir = Path(Config.RAG_CHROMA_DIR)
        persist_dir.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(persist_dir))
    return _client


def get_vectorstore(collection_name: str):
    from langchain_chroma import Chroma
    return Chroma(
        client=_get_client(),
        collection_name=collection_name,
        embedding_function=get_embeddings(),
    )


def collection_count(collection_name: str) -> int:
    try:
        return _get_client().get_or_create_collection(collection_name).count()
    except Exception as exc:
        log.warning("Could not read collection count for %s: %s", collection_name, exc)
        return 0
