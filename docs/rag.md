# Advanced RAG — operations notes

Natural-language questions answered from two sources: the SOP policy docs in
`ml/rag/docs/`, and the GO/NO-GO decision log. Questions about one specific
order are answered from that order's own stored SHAP factors instead.

Entry points: `POST /api/rag/query`, the chat panel on both dashboards, and
the `/chat` page (any message the intent classifier can't place falls through
to RAG rather than a canned reply).

## How a question is answered

1. **Router** (`app/rag/router.py`) — rule-based. Extracts filters (order
   number, agent, area, date, decision) and picks a route.
2. **Retrieval** — *both* indexes are searched for every question except one
   naming a specific order. Routing used to be a hard switch, which meant any
   misroute guaranteed a refusal: a policy answer simply isn't in the decision
   log. Over 21 realistic questions, searching both took the share whose
   answering document actually reached the model from 15 to 20.
3. **Role scoping** — enforced *at retrieval*, not after. An agent only ever
   sees their own area. A named order they can't access returns an explicit
   "not available to you" rather than a confident answer about a different one.
4. **Generation** (`app/rag/generation.py`) — every claim must carry a
   citation, and the model is instructed to refuse rather than guess.

## Vector storage

Plain numpy, not a vector database (`app/rag/vectorstore.py`). The corpus is a
few hundred vectors — about 4MB — and chromadb + LangChain cost ~55MB of memory
just to import, which is what ran the 512MB instance out of memory in
production. Search is brute-force cosine similarity, well under a millisecond
at this size; a real index only pays off at tens of thousands of rows.

Each index records which embedding model built it. If that doesn't match the
current model — say after switching `RAG_EMBEDDING_PROVIDER` — the stale index
is discarded and rebuilt automatically, instead of comparing vectors from two
incompatible models.

## Configuration that matters

| Variable | Default | Why |
|---|---|---|
| `RAG_EMBEDDING_PROVIDER` | `gemini` | `local` loads ~365MB of torch. Measured peak RSS against Render's 512MB cap: **463MB** local models + Chroma, **~200MB** Gemini + Chroma (still OOM'd in production), **134MB** Gemini + the numpy store. |
| `RAG_RERANK_ENABLED` | `false` | The cross-encoder is the only thing that still pulls torch in. It also showed length bias here, ranking a short policy doc last behind verbose decision records. |
| `RAG_WARM_ON_BOOT` | `true` | Only does anything with local models. Harmless (and skipped) on the API provider. |
| `RAG_MAX_INDEXED_DECISIONS` | `300` | Bounds cold-start rebuild time. `0` indexes everything. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Generation model. Production sets `gemini-3.5-flash-lite`. |

**Switching embedding provider changes vector dimensions** (3072 vs 384). The
store detects this and rebuilds on first use, so no manual step is needed —
but that first query pays for the rebuild.

## Reindexing

```sh
cd backend
FLASK_APP="app:create_app" python3 -m flask rag-reindex
```

Use `app:create_app`, **not** `run.py` — the latter calls
`eventlet.monkey_patch()`, which buries the result under monkey-patch warnings
and teardown tracebacks that read like a crash on a deploy log.

The index also rebuilds itself lazily on first query whenever it's missing or
short, so a deploy doesn't strictly need this.

## Known limits

- **Free-tier generation is 20 requests/day per model**, shared with the chat
  assistant. Past the cap, answers stay grounded and cited but are no longer
  synthesised into prose — they're presented as a formatted list of the
  retrieved sources. This is routine, not an error path.
- **Embeddings are rate-limited per minute** (~100 texts). Reindexing paces
  itself to stay under; queries embed one text and never come close.
- **No persistent disk on Render**, so the index rebuilds on every cold start.
  With API embeddings that costs roughly a minute for 300 decisions, paid by
  whoever asks the first question. A persistent disk would remove this.
- **The SOP corpus is six documents, ~476 words.** Anything outside those
  topics is correctly refused — coverage is limited by content, not by code.
  Customer-unreachable scenarios, for example, aren't covered anywhere.
- **`chat_service` routes only the `general` intent to RAG.** Every other
  intent keeps its existing structured reply.

## Tests

`backend/tests/rag/` — 43 tests, real pytest (unlike the hand-rolled scripts
elsewhere in `backend/tests/`). Hermetic: throwaway SQLite DB, throwaway index
directory, and `GEMINI_API_KEY` pinned empty so generation takes the
deterministic fallback path and embeddings stay local — no network, no quota.

That means tests measure the *local* embedding model. Production uses Gemini
embeddings, which score slightly better (21/21 vs 20/21 on the same set), so a
couple of assertions are deliberately scoped to what local can do.

```sh
cd backend && python3 -m pytest tests/rag -q
```
