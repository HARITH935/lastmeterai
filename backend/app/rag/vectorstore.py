"""
Vector indexes for the two retrieval sources.

Index A ("sop_policy")   — chunked SOP/policy markdown docs (ml/rag/docs/).
Index B ("decision_log") — one document per historical Decision row, with
                            structured metadata for hybrid (semantic + filter)
                            retrieval.

A plain numpy matrix with cosine similarity, not a vector database. The whole
corpus is a few hundred vectors (~4MB), and chromadb + langchain cost ~55MB
of memory just to import — on Render's 512MB instance that overhead alone is
what ran the process out of memory. numpy is already resident for the ML
models, so this costs nothing extra. Brute-force search over a few hundred
rows is well under a millisecond; a real index only earns its keep at tens of
thousands.

Each collection persists as `<name>.npy` (vectors) + `<name>.json` (ids,
texts, metadata, and the embedding signature) under RAG_CHROMA_DIR. Render
has no persistent disk, so on a deploy the files don't survive and
service._ensure_indexed() rebuilds them on first use.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)

SOP_COLLECTION = "sop_policy"
DECISION_COLLECTION = "decision_log"

_embeddings = None
_stores: dict[str, "VectorStore"] = {}


@dataclass
class Document:
    """A retrievable chunk: the text, plus metadata used for filtering and
    citations. Same shape as the LangChain class it replaces."""
    page_content: str
    metadata: dict = field(default_factory=dict)


def get_embeddings():
    """The configured embedding backend, cached per process so a local model
    is loaded into memory once rather than per request."""
    global _embeddings
    if _embeddings is None:
        from app.rag.embeddings import build_embeddings
        _embeddings = build_embeddings()
    return _embeddings


def _embedding_signature() -> str:
    """Identifies which model produced a set of vectors. Vectors from different
    models aren't comparable (different dimensions, different geometry), so an
    index written by another model is discarded rather than silently queried —
    the failure mode a provider switch would otherwise hit."""
    from app.config import Config

    emb = get_embeddings()
    return getattr(emb, "signature", None) or f"local:{Config.RAG_EMBEDDING_MODEL}"


def _matches(metadata: dict, where: dict | None) -> bool:
    """Equality filter. Accepts a flat {key: value} dict (all keys must match)
    or Chroma's {"$and": [{key: value}, ...]} form."""
    if not where:
        return True
    if "$and" in where:
        return all(_matches(metadata, clause) for clause in where["$and"])
    return all(metadata.get(k) == v for k, v in where.items())


class VectorStore:
    """In-memory vectors for one collection, mirrored to disk on every write."""

    def __init__(self, name: str):
        import numpy as np

        from app.config import Config

        self.name = name
        self._dir = Path(Config.RAG_CHROMA_DIR)
        self._ids: list[str] = []
        self._texts: list[str] = []
        self._metadatas: list[dict] = []
        self._vectors = np.zeros((0, 0), dtype=np.float32)
        self._signature = _embedding_signature()
        self._load()

    # ── persistence ──────────────────────────────────────────────────────────

    @property
    def _vec_path(self) -> Path:
        return self._dir / f"{self.name}.npy"

    @property
    def _meta_path(self) -> Path:
        return self._dir / f"{self.name}.json"

    def _load(self) -> None:
        import numpy as np

        if not (self._vec_path.exists() and self._meta_path.exists()):
            return
        try:
            meta = json.loads(self._meta_path.read_text(encoding="utf-8"))
            if meta.get("signature") != self._signature:
                log.info(
                    "Index %s was built with %s, now using %s — discarding it.",
                    self.name, meta.get("signature"), self._signature,
                )
                return
            vectors = np.load(self._vec_path)
            if len(vectors) != len(meta["ids"]):
                log.warning("Index %s is inconsistent on disk — discarding it.", self.name)
                return
            self._ids, self._texts, self._metadatas = meta["ids"], meta["texts"], meta["metadatas"]
            self._vectors = vectors.astype(np.float32, copy=False)
        except Exception as exc:
            log.warning("Could not load index %s (%s) — starting empty.", self.name, exc)

    def _save(self) -> None:
        """Write both files to temporary names, then rename into place, so a
        crash mid-write can't leave vectors and metadata out of step."""
        import numpy as np

        self._dir.mkdir(parents=True, exist_ok=True)
        vec_tmp = self._vec_path.with_name(self._vec_path.name + ".tmp")
        meta_tmp = self._meta_path.with_name(self._meta_path.name + ".tmp")
        with open(vec_tmp, "wb") as fh:
            np.save(fh, self._vectors)
        meta_tmp.write_text(json.dumps({
            "signature": self._signature,
            "ids": self._ids,
            "texts": self._texts,
            "metadatas": self._metadatas,
        }), encoding="utf-8")
        os.replace(vec_tmp, self._vec_path)
        os.replace(meta_tmp, self._meta_path)

    # ── writes ───────────────────────────────────────────────────────────────

    @staticmethod
    def _normalise(vectors):
        import numpy as np

        arr = np.asarray(vectors, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr[None, :]
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return arr / norms

    def add_documents(self, docs: list[Document], ids: list[str]) -> None:
        """Upsert: an id that already exists is replaced, not duplicated."""
        import numpy as np

        if not docs:
            return
        new_vectors = self._normalise(get_embeddings().embed_documents([d.page_content for d in docs]))

        replacing = set(ids)
        keep = [i for i, existing in enumerate(self._ids) if existing not in replacing]
        self._ids = [self._ids[i] for i in keep] + list(ids)
        self._texts = [self._texts[i] for i in keep] + [d.page_content for d in docs]
        self._metadatas = [self._metadatas[i] for i in keep] + [dict(d.metadata) for d in docs]
        kept = self._vectors[keep] if len(self._vectors) else np.zeros((0, new_vectors.shape[1]), dtype=np.float32)
        self._vectors = np.vstack([kept, new_vectors]) if len(kept) else new_vectors
        self._save()

    def delete(self, ids: list[str]) -> None:
        drop = set(ids)
        keep = [i for i, existing in enumerate(self._ids) if existing not in drop]
        self._ids = [self._ids[i] for i in keep]
        self._texts = [self._texts[i] for i in keep]
        self._metadatas = [self._metadatas[i] for i in keep]
        self._vectors = self._vectors[keep] if len(self._vectors) else self._vectors
        self._save()

    # ── reads ────────────────────────────────────────────────────────────────

    def get(self, ids: list[str] | None = None) -> dict:
        if ids is None:
            picked = range(len(self._ids))
        else:
            wanted = set(ids)
            picked = [i for i, existing in enumerate(self._ids) if existing in wanted]
        return {
            "ids": [self._ids[i] for i in picked],
            "documents": [self._texts[i] for i in picked],
            "metadatas": [self._metadatas[i] for i in picked],
        }

    def count(self) -> int:
        return len(self._ids)

    def similarity_search_with_score(self, query: str, k: int = 4, filter: dict | None = None):
        """(Document, distance) pairs, nearest first. Distance is 1 - cosine
        similarity, so lower is closer — the same convention Chroma used."""
        import numpy as np

        candidates = [i for i, meta in enumerate(self._metadatas) if _matches(meta, filter)]
        if not candidates or k <= 0:
            return []
        query_vec = self._normalise(get_embeddings().embed_query(query))[0]
        sims = self._vectors[candidates] @ query_vec
        order = np.argsort(-sims)[:k]
        return [
            (Document(page_content=self._texts[candidates[j]], metadata=dict(self._metadatas[candidates[j]])),
             float(1.0 - sims[j]))
            for j in order
        ]

    def similarity_search(self, query: str, k: int = 4, filter: dict | None = None) -> list[Document]:
        return [doc for doc, _ in self.similarity_search_with_score(query, k=k, filter=filter)]


def get_vectorstore(collection_name: str) -> VectorStore:
    """One store per collection per process, so the vectors are read from disk
    once and every write is visible to the next query immediately."""
    store = _stores.get(collection_name)
    if store is None:
        store = _stores[collection_name] = VectorStore(collection_name)
    return store


def collection_count(collection_name: str) -> int:
    try:
        return get_vectorstore(collection_name).count()
    except Exception as exc:
        log.warning("Could not read collection count for %s: %s", collection_name, exc)
        return 0
