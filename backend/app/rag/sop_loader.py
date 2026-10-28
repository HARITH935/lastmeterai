"""
Index A — SOP/policy docs. Loads markdown files from RAG_SOP_DIR, chunks
them, and (re)writes them into the "sop_policy" Chroma collection.

SOP docs are small and change rarely, so this always does a full rebuild
(delete + re-add) rather than incremental upsert — simpler, and cheap at
this corpus size.
"""

from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger(__name__)

_CHUNK_SIZE = 800
_CHUNK_OVERLAP = 120


def _sop_dir() -> Path:
    from app.config import Config
    return Path(Config.RAG_SOP_DIR)


def load_and_chunk() -> list:
    """Read every .md file in RAG_SOP_DIR, split into chunks, return
    a list of langchain Document objects with source metadata."""
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_core.documents import Document

    sop_dir = _sop_dir()
    if not sop_dir.exists():
        log.warning("SOP directory %s does not exist — Index A will be empty.", sop_dir)
        return []

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=_CHUNK_SIZE,
        chunk_overlap=_CHUNK_OVERLAP,
        separators=["\n## ", "\n### ", "\n\n", "\n", " ", ""],
    )

    docs: list[Document] = []
    md_files = sorted(sop_dir.glob("*.md"))
    for path in md_files:
        text = path.read_text(encoding="utf-8")
        # Use the first line ("# Title") as a human-readable section label,
        # falling back to the filename.
        title_line = text.splitlines()[0].lstrip("# ").strip() if text.strip() else path.stem
        chunks = splitter.split_text(text)
        for i, chunk in enumerate(chunks):
            docs.append(Document(
                page_content=chunk,
                metadata={
                    "source": path.stem,
                    "source_title": title_line,
                    "chunk_index": i,
                    "citation": f"SOP:{path.stem}#{i}",
                },
            ))
    log.info("Loaded %d SOP chunks from %d files in %s.", len(docs), len(md_files), sop_dir)
    return docs


def reindex() -> int:
    """Full rebuild of Index A. Returns the number of chunks indexed."""
    from app.rag.vectorstore import get_vectorstore, SOP_COLLECTION

    docs = load_and_chunk()
    store = get_vectorstore(SOP_COLLECTION)

    # Clear existing entries before re-adding (full rebuild, not upsert).
    existing = store.get()
    if existing and existing.get("ids"):
        store.delete(ids=existing["ids"])

    if docs:
        ids = [f"sop-{d.metadata['source']}-{d.metadata['chunk_index']}" for d in docs]
        store.add_documents(docs, ids=ids)

    log.info("Index A (sop_policy) rebuilt: %d chunks.", len(docs))
    return len(docs)
