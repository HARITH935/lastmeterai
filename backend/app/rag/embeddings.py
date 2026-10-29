"""
Embedding backends.

Two providers, chosen by RAG_EMBEDDING_PROVIDER:

- "gemini" (default): embeddings via the Gemini API. No model is loaded into
  the process, which matters because the local backend costs ~365MB of torch
  runtime — on a 512MB instance that is the difference between running and
  being OOM-killed. It also removes the 175MB model download on every cold
  start, and with it the dependency on huggingface.co being reachable.
- "local": sentence-transformers, run on-device. No API key, no per-query
  network call, but heavy. Still the right choice where memory is plentiful
  or the host has no outbound network.

Both expose the LangChain Embeddings interface (embed_documents / embed_query)
so Chroma can use either interchangeably.

Vectors from the two providers are NOT comparable — they have different
dimensions (3072 vs 384) and different geometry. Switching provider requires
a full reindex, which `flask rag-reindex` does.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)

# Gemini's embedding endpoint distinguishes the two sides of a retrieval pair,
# and using the matching type on each measurably improves ranking over
# embedding both as plain text.
_DOCUMENT_TASK = "retrieval_document"
_QUERY_TASK = "retrieval_query"

# Keeps a single request well clear of the API's per-call payload limit while
# still cutting a full reindex down to a handful of round trips.
_BATCH_SIZE = 20

# The free tier's embedding quota counts each *text*, not each HTTP call, and
# is enforced per minute — so a full reindex (6 SOPs + every decision) blows
# through it in one go unless paced. Query-time embedding is a single text and
# never comes close.
_ITEMS_PER_MINUTE = 90
_RETRY_DELAYS = (15, 30, 60)

_TRANSIENT_SIGNS = ("quota", "deadline", "unavailable", "timeout", "503", "504", "429")


def _is_transient(exc: Exception) -> bool:
    return any(sign in str(exc).lower() for sign in _TRANSIENT_SIGNS)


class GeminiEmbeddings:
    """LangChain-compatible embeddings backed by the Gemini API."""

    def __init__(self, model: str, api_key: str):
        self._model = model if model.startswith("models/") else f"models/{model}"
        self._api_key = api_key
        self._recent: list[float] = []  # timestamps of recently embedded texts

    def _throttle(self, count: int) -> None:
        """Hold the rolling rate under the per-minute quota before spending it,
        rather than relying on retries to absorb an overrun."""
        import time

        now = time.monotonic()
        self._recent = [t for t in self._recent if now - t < 60]
        if len(self._recent) + count > _ITEMS_PER_MINUTE and self._recent:
            wait = 60 - (now - self._recent[0]) + 1
            if wait > 0:
                log.info("Embedding rate limit — pausing %.0fs.", wait)
                time.sleep(wait)
                now = time.monotonic()
                self._recent = [t for t in self._recent if now - t < 60]
        self._recent.extend([time.monotonic()] * count)

    def _embed(self, content, task_type: str):
        import time

        import google.generativeai as genai

        # REST, not the default gRPC: production runs a gunicorn eventlet
        # worker, and run.py monkey-patches the stdlib for green threads.
        # gRPC's native C threading doesn't cooperate with that and hangs the
        # worker until it's killed (a 502 with no traceback). REST goes through
        # the patched socket layer and behaves.
        genai.configure(api_key=self._api_key, transport="rest")
        for attempt, delay in enumerate((*_RETRY_DELAYS, None)):
            try:
                result = genai.embed_content(
                    model=self._model, content=content, task_type=task_type
                )
                return result["embedding"]
            except Exception as exc:
                # Retry only what waiting can actually fix: a per-minute quota
                # clears on its own, and deadlines/unavailability are transient.
                # A malformed request would fail identically however long we
                # wait, so it propagates immediately.
                if delay is None or not _is_transient(exc):
                    raise
                log.warning("Embedding call failed (%s) — retrying in %ss.", exc, delay)
                time.sleep(delay)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), _BATCH_SIZE):
            batch = texts[start:start + _BATCH_SIZE]
            self._throttle(len(batch))
            vectors.extend(self._embed(batch, _DOCUMENT_TASK))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text, _QUERY_TASK)


def build_embeddings():
    """The configured embedding backend. Falls back to the local model when
    the Gemini provider is selected without a key — a missing key should
    degrade retrieval to a slower path, not take RAG down entirely."""
    from app.config import Config

    provider = (Config.RAG_EMBEDDING_PROVIDER or "gemini").lower()

    if provider == "gemini":
        api_key = Config.GEMINI_API_KEY
        if api_key:
            return GeminiEmbeddings(Config.RAG_GEMINI_EMBEDDING_MODEL, api_key)
        log.warning(
            "RAG_EMBEDDING_PROVIDER=gemini but GEMINI_API_KEY is unset — "
            "falling back to the local embedding model."
        )

    from langchain_huggingface import HuggingFaceEmbeddings
    from app.rag import load_model_offline_first

    return load_model_offline_first(
        lambda: HuggingFaceEmbeddings(model_name=Config.RAG_EMBEDDING_MODEL)
    )
