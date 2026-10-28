"""CLI-facing full reindex — `flask rag-reindex` (registered in app/__init__.py)."""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def reindex_all() -> dict:
    from app.rag import sop_loader, decision_indexer

    sop_count = sop_loader.reindex()
    decision_count = decision_indexer.reindex_all()
    return {"sop_chunks": sop_count, "decisions": decision_count}
