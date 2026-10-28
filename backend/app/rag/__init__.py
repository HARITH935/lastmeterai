"""
Advanced RAG layer — natural-language Q&A over SOP policy docs and the
historical GO/NO-GO decision log, with live SHAP explanations injected
directly for recent-decision questions.

Public entrypoint: app.rag.service.answer_query(user, message)
"""

import os

# transformers (pulled in by sentence-transformers) auto-detects any
# TensorFlow/Flax install on the machine and eagerly imports TF integration
# code even though we only use the PyTorch backend — if TF happens to be
# installed (as an unrelated leftover, not a project dependency), that
# turns a ~5s import into a 10+ minute one due to TF's own heavy native
# init. Setting these before sentence-transformers is ever imported (which
# happens lazily, inside app.rag.vectorstore) skips that probe entirely.
os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("USE_FLAX", "0")

# Even with both models already in the local cache, loading them makes a
# metadata call to huggingface.co — with no connect timeout, so an unreachable
# or slow network hangs for ~75s and then fails the load outright, taking all
# of RAG down on an otherwise fine instance. These caps make it give up fast
# and fall back to the cache. A first-ever load still downloads normally; only
# the stall case changes.
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "5")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "20")


def load_model_offline_first(load):
    """Run `load()` against the local model cache first.

    Loading a cached sentence-transformers model still calls huggingface.co for
    metadata, so an unreachable host fails the load outright — taking all of RAG
    down on an instance whose models are sitting right there on disk. Timeouts
    alone don't help: a DNS failure raises rather than falling back.

    Offline first, then one online attempt so a first-ever run can still
    download. Returns whatever `load()` returns.
    """
    import logging

    previous = os.environ.get("HF_HUB_OFFLINE")
    os.environ["HF_HUB_OFFLINE"] = "1"
    try:
        return load()
    except Exception as exc:
        logging.getLogger(__name__).info(
            "Model not in local cache (%s) — retrying with network.", exc
        )
        if previous is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = previous
        return load()
    finally:
        if previous is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = previous
