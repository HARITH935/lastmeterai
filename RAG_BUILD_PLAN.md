# Advanced RAG — Build Plan

Locked-in decisions:
- Embeddings: local `sentence-transformers` (free, no API key)
- Generation: existing Gemini setup (reused, graceful fallback if no key)
- Reranker: **on** (cross-encoder)
- SOP content: real (6 sections, drafted and approved — see Phase 2)
- Frontend: chat panel on **both** manager and agent dashboards
- Tests: real pytest coverage, not just manual smoke tests

## Phase 1 — Environment & Dependencies ✅ DONE
- 1.1 ✅ Install LangChain core, text-splitters, langchain-chroma, langchain-huggingface (local embeddings), chromadb, sentence-transformers, pypdf
- 1.2 ✅ Pin versions into `backend/requirements.txt`
- 1.3 ✅ Add RAG config values to `app/config.py` (SOP dir, Chroma dir, embedding model, top-k, reranker on) — no `OPENAI_API_KEY`
- 1.4 ✅ Check for dependency conflicts (protobuf broke Gemini/MLflow last time) and pin if needed
- 1.5 ✅ Smoke-test imports: langchain, chromadb, sentence-transformers, and confirm existing Gemini/MLflow still import cleanly
  - **Extra fix found**: `sentence-transformers` 5.0.0 eagerly imports its full surface (training/ONNX/sparse) → downgraded to 3.0.1
  - **Extra fix found**: `transformers` auto-detects a leftover TensorFlow install on this machine and eagerly imports it, turning a ~5s import into 10+ minutes. Fixed by setting `USE_TF=0` / `USE_FLAX=0` in `app/rag/__init__.py` before sentence-transformers is ever imported. Confirmed: 4.9s cold import after the fix.

## Phase 2 — SOP Content (Index A) ✅ DONE
- 2.1 ✅ Write the 6 approved policy sections as markdown files into `ml/rag/docs/`:
  weather override, traffic/ETA conflict, manager override authority, postpone vs reassign, escalation, risk band reference
- 2.2 ✅ Build the vector store accessor (local embeddings client + Chroma collection)
- 2.3 ✅ Build the SOP loader — chunk + embed + store
- 2.4 ✅ Full reindex (6 chunks), sanity-checked with 4 manual policy queries — all returned the correct document as the top result

## Phase 3 — Decision Log Indexer (Index B) ✅ DONE
- 3.1 ✅ Convert each Decision+Order row into a searchable text doc (agent, area, date, decision, SHAP summary)
- 3.2 ✅ Full backfill function
- 3.3 ✅ Incremental upsert function, hooked into decision creation (decision_service.py step 10) so new decisions auto-index
- 3.4 ✅ Reindexed 120 seeded decisions; verified semantic search (3 queries) and hybrid metadata filtering (area + decision type combined) both work correctly

## Phase 4 — Router + Retrieval ✅ DONE
- 4.1 ✅ Build the router — 3-way classifier + filter extraction (order, agent, area, date, decision type)
- 4.2 ✅ Build the three retrieval functions (policy semantic search, historical hybrid search, live-decision direct DB+SHAP lookup)
- 4.3 ✅ Add role-scoping (agents see only their own area) to historical + live-decision paths — verified an agent is correctly blocked (empty result) from live-decision context on an order outside their area
- 4.4 ✅ Re-verified router against the original example queries — all 5 correct

## Phase 5 — Reranker + Grounded Generation ✅ DONE
- 5.1 ✅ Build the cross-encoder reranker (on by default, local sentence-transformers model)
- 5.2 ✅ Build grounded generation — citation-enforced prompt, refusal instructions, reuse existing Gemini call pattern
- 5.3 ✅ Build the orchestrator wiring route → retrieve → rerank → generate
- 5.4 ✅ End-to-end test, one query per route — all 3 correct with real citations (`GEMINI_API_KEY` not set locally, so answers used the grounded fallback format rather than synthesized prose — expected, still fully cited)

## Phase 6 — API Layer ✅ DONE
- 6.1 ✅ Build `POST /api/rag/query` route
- 6.2 ✅ Register the blueprint
- 6.3 ✅ Add `flask rag-reindex` CLI command
- 6.4 ✅ curl smoke-tested all 3 routes (200 + correct citations), plus 400 on empty query and 401 on missing auth

## Phase 7 — Frontend ✅ DONE
- 7.1 ✅ Build the `rag.ts` API client
- 7.2 ✅ Build the chat panel component (per the approved mockup — https://claude.ai/code/artifact/a9c9adf0-852e-4cd0-a03c-a8e7472095de)
- 7.3 ✅ Wire into the manager Dashboard
- 7.4 ✅ Wire into the Agent Dashboard
- 7.5 ✅ Typecheck clean, production build clean

## Phase 8 — Tests ✅ DONE
- 8.1 ✅ Router: classification + filter extraction (9 tests)
- 8.2 ✅ Retrievers: role-scoping correctness, incl. the critical "agent blocked from other area" case (6 tests)
- 8.3 ✅ Generation: refusal-on-empty-context, citation presence, Gemini-failure fallback (3 tests)
- 8.4 ✅ API route: auth, validation, happy path × 3 routes, agent scoping (6 tests)
- 8.5 ✅ 24/24 pass. Real pytest (fixtures in `tests/rag/conftest.py`, hermetic — throwaway SQLite DB + throwaway Chroma dir, seeded via the project's own seed.py, torn down per session) — unlike the rest of `backend/tests/`, which are hand-rolled scripts pytest doesn't actually collect. Also re-ran `tests/test_decisions.py` (existing hand-rolled suite) to confirm the new RAG indexing hook in `decision_service.py` doesn't break the prediction pipeline — all pass.

## Phase 9 — End-to-end verification ✅ DONE
- 9.1 ✅ Seeded fresh test data
- 9.2 ✅ Live curl test all 3 routes — correct
- 9.3 ✅ Citations confirmed real; refusal mechanism confirmed at the unit level (Phase 8) and the graceful-fallback design confirmed live (unmatched order → broader historical search rather than a hard stop)
- 9.4 ✅ Frontend typecheck + production build clean. No browser automation tool was available in this environment, so the chat panel was not visually verified in a real browser — worth a manual click-through.
- 9.5 ✅ Final report delivered

## BUILD COMPLETE — all 9 phases done.

---

# Hardening phases (post-build)

## Phase 10 — Real Gemini generation ✅ DONE
- 10.1 ✅ `GEMINI_API_KEY` set in `backend/.env` (gitignored)
- 10.2 ✅ All 3 routes verified live — synthesized prose with correct citations, not the fallback format
- 10.3 ✅ Refusal verified live ("What is the capital of France?" → "the provided context blocks do not contain information about…")
- 10.4 ✅ Failure fallback verified with a bad key — degrades to cited raw context, never raises
  - **Finding**: the Gemini free tier allows only **20 generate requests/day** for `gemini-2.5-flash`, shared by chat and RAG. Past the cap both silently degrade to the cited-context fallback. The model is now `GEMINI_MODEL`-configurable so a higher-limit model can be swapped in without a code change.

## Phase 11 — Chat panel browser check ✅ DONE
- 11.1 ✅ Manager policy + historical queries verified in-browser; answers correct and correctly cited. Live-decision route also verified in-browser after the 12.1 fix — `"Why was order #12 marked NO-GO?"` now resolves to LM-0012 and returns the right record + SHAP breakdown with a single correct citation (shown via the quota fallback, since the day's Gemini requests were spent)
- 11.2 ✅ Agent out-of-area blocking verified against the live API as `ravi.kumar` (Adyar) — and it surfaced a **real bug**, see 11.5
- 11.3 ✅ Checked at 390×844 (iPhone 14 Pro) in Chrome device mode — no overflow, layout holds. The CSS was already mobile-first (`max-width: 78%` bubbles, `90vw` guards, a `min-width: 768px` breakpoint). Noted but not hit: neither stylesheet sets `overflow-wrap`, so an unbroken citation longer than today's (`SOP:traffic-eta-conflict-policy#0`, 33 chars) could overflow a narrow bubble.
- 11.4 ✅ Two UI bugs found and fixed in `Chat.tsx`:
  - RAG answers showed the **intent classifier's** confidence ("Low confidence · 21%") on a well-grounded answer — meaningless for a RAG reply. Replaced with a "Knowledge base" badge.
  - The source list showed all 6 retrieved sources even when the answer cited only 3. Now lists only cited sources (falling back to all if none are cited).
- 11.5 ✅ **Silent wrong-order answers (found by 11.2, fixed)**: `service.py` fell back to a historical search when a named order produced no live record — but that fallback drops the order-number filter. An agent asking "Why was LM-0012 NO-GO?" (T Nagar, outside their area) got a confident, correctly-cited answer about **LM-0002** instead, with nothing indicating their order wasn't used. Not a data leak — scoping held, no out-of-area record was ever returned — but highly misleading, since a dispatcher would read it as the answer about LM-0012. Now the answer leads with an explicit notice ("I don't have a decision record for LM-0012 that you can access — it may not exist, or it may be outside your area") followed by "Related decisions you do have access to:", with manager-specific wording for the plain not-found case. 3 tests added, including one asserting the notice does **not** fire on the happy path. **Tests: 36 → 39.**

## Phase 12 — Quality hardening ✅ DONE
- 12.1 ✅ Router edge cases — 18-case batch (typos, one-word, gibberish, multi-intent, bare order numbers). Started at 4 mismatches, now **0**:
  - **Bug**: `"order #12"` / `"order 12"` didn't parse — only `LM-0012` form did, so a natural phrasing got refused. Now normalized to `LM-%04d`, and `LM-12` zero-pads too.
  - **Bug**: a named order with no "why" (`"tell me about LM-0012"`) routed to *historical search* instead of the live decision. A specific order number now wins unless the wording is comparative ("similar to … before?").
  - **Bug**: plain-language policy questions hit no keyword at all and fell through to the historical default — `"what do we do in heavy rain?"`, `"can agent X override a NO-GO?"`, `"what is the risk band for 75?"`. Policy markers widened to natural phrasings + SOP domain terms.
  - **Bug**: typo'd queries (`"wat is the polcy for raine"`) had no signal. Added a `difflib` near-match pass that runs **only when every score is zero**, so exact matches are never second-guessed.
  - Tie-breaking was `max()` over a dict (iteration-order dependent). Now explicit: live needs a concrete order, historical needs a data filter, else policy.
- 12.2 ✅ Policy retrieval quality — 12 realistic questions, **12/12 correct** (2 apparent misses were wrong expectations on my part: the dispatcher NO-GO→GO rule genuinely lives in the weather doc; and no SOP covers unreachable customers at all)
  - **Content gap (not code)**: the 6 SOPs don't cover customer-unreachable / failed-contact scenarios. Also, with 6 docs at 1 chunk each and `RAG_TOP_K=6`, policy retrieval returns essentially the whole corpus — the reranker does the real ordering. Fine at this scale; revisit if the SOP set grows.
- 12.3 ✅ Latency measured: **cold first query 15.5s** (≈11s of it loading the two local models), warm 2–4s. Added `RAG_WARM_ON_BOOT` (default on): both models are warmed in a background daemon thread at boot, so startup isn't blocked. Verified on the real dev server — **first query 6.2s instead of 15.5s** (the remainder is Gemini).
- 12.4 ✅ Indexing-hook containment — the hook was already post-commit and wrapped, but logged at `debug`, so a persistently broken index would never surface. Raised to `warning` and added `tests/rag/test_indexing_hook.py`, which forces the indexer to raise and asserts the decision is still created, committed and readable.
- 12.5 ✅ **Test hermeticity bug found**: `tests/rag/` asserted on *answer prose*, which only passed because no `GEMINI_API_KEY` was present — adding a real key broke `test_agent_historical_query_is_area_scoped`. Scoping was never actually broken (verified: 6/6 retrieved decisions in the agent's own area, 0 leaks). Fixed both causes: conftest now pins `GEMINI_API_KEY=""` for determinism, and the scoping assertion is now structural (maps each cited source back to its order's area) rather than string-matching prose.
- **Tests: 24 → 32, all passing.** Existing `tests/test_decisions.py` smoke suite re-run clean.

## Phase 12b — Fallback readability ✅ DONE
Prompted by 10.4: on the free tier (20 generate requests/day, shared with chat) the fallback is the *routine* path, not a rare error path, so it had to read as an answer rather than a log dump.
- 12b.1 ✅ Rewrote `_fallback_answer` to format by source type:
  - **Policy blocks** keep their wording **verbatim** (the SOPs quote `weather_risk` etc. deliberately — precision beats prose in a policy quote). Only the markdown `#` heading is lifted into a section label and `**bold**` markers stripped, since both render literally in a plain-text bubble.
  - **Decision blocks** get the internal vocabulary translated: `risk_score=53` → "risk score 53", `success_probability=0.47` → "47% predicted success", `SHAP factor breakdown (signed % contribution toward NO-GO):` → "Main factors:", and `(agent_id=…)` / `(model gonogo_lr vv1.0)` dropped.
  - Lead-in is now "From the policy docs:" / "From the decision log:" / both — no "AI synthesis unavailable" jargon.
  - Each cleanup is a plain substitution, so an unmatched pattern leaves text untouched: nothing is ever silently dropped.
- 12b.2 ✅ Two bugs caught while building it: `success_probability=0.8.` swallowed the sentence period into the float (crash), and `agent_id=None` on unassigned orders slipped past a digits-only pattern.
- 12b.3 ✅ 4 new tests covering jargon translation, policy-verbatim preservation, the two regressions above, and the mixed-source lead. **Tests: 32 → 36, all passing.** Verified live through the API.

## Full verification sweep (2026-10-28) ✅ ALL GREEN
Run end-to-end before committing, against the live server rather than mocks.
- ✅ **39/39 pytest** (`tests/rag/`)
- ✅ **10/10 live HTTP checks** through `POST /api/rag/query`: all 3 routes returning real synthesized prose, bare `order #12` parsing, typo'd query, off-topic refusal, agent area-scoping, agent blocked from an out-of-area order, 401 without a token, 400 on an empty query. Latency 1.8–5.0s.
- ✅ **Frontend production build** clean (2.4s)
- ✅ **`flask rag-reindex`** — 6 SOP chunks, 124 decisions. **Use `FLASK_APP="app:create_app"`**, not `run.py`: the latter's `eventlet.monkey_patch()` floods the output with monkey-patch warnings and teardown tracebacks around an otherwise successful run, which on a deploy log reads like a failure.
- ✅ **Incremental auto-indexing** — created a live decision (id 125, LM-0043/Guindy), confirmed `decision-125` landed in Chroma with correct metadata, and that it came back as the **top result** for "What GO decisions have we made in Guindy?" with no manual reindex. (A first, unfiltered semantic search did *not* surface it — 125 decision texts are near-identical, so broad queries rank poorly. Not a bug, but a reminder that this index answers filtered questions far better than vague ones.)
- ✅ **Mobile** — 390×844, no overflow (user-verified)
- Side effect: decision id 125 now exists in the local dev DB.

## Phase 12c — Semantic re-routing ✅ DONE
Found by the user running the suggested check questions in the browser: three plainly-worded policy questions were answered out of the **decision log** and refused — "What does a risk score of 75 mean?", "Should I postpone or reassign?", "TomTom shows heavy congestion but the ETA is still fine — what wins?".

**Why 12.1 missed it.** My own router batch used phrasings like "what is the risk *band* for 75?" and "what's our *policy* when TomTom…" — i.e. queries containing the keywords I had just added. I validated the markers rather than real phrasing. Keyword lists cannot cover how people actually write; the no-signal default (historical) is the worst possible guess for a policy question.

- 12c.1 ✅ Measured the real separation instead of guessing more keywords: SOP-index distance is **0.77–1.26** for genuine policy questions vs **1.34+** for genuine data questions. Threshold `RAG_POLICY_PROBE_MAX_DISTANCE` = **1.30** sits in the gap.
- 12c.2 ✅ Added `router.has_keyword_signal()` + `retrievers.policy_match_distance()`, wired through `service._resolve_unrouted()`: when the router matched **nothing** and the query carries **no data filter**, the query is measured against the SOP index and re-routed to policy if close enough. Deliberately narrow — a keyword match or a data filter keeps its route.
- 12c.3 ✅ Rejected the alternative on evidence: routing by *whichever index is nearer* scored **5 misses vs 2** on the same 15 queries. The decision index holds 125 near-identical docs, so generic data questions aren't close to any one of them and the comparison skews to policy. Absolute threshold wins.
- 12c.4 ✅ 17-query batch: **15/17**, all 3 reported bugs fixed, every data query still correct. Verified live: "risk score of 75" now returns the HIGH band answer, "postpone or reassign" returns the real rule.
- 12c.5 ✅ 6 tests, incl. a scope guard (keyword matches and filtered queries are untouched) and a failure-containment test — which caught that `service.py` was relying on the callee's internal try/except rather than guaranteeing it locally. Now wrapped at the call site.
- **Known limits (fail safely — they refuse, never hallucinate)**: heavily paraphrased policy questions still miss, e.g. "who signs off on overriding the AI?" (1.307) and "is it ok to deliver when it's pouring?" (1.573). Also unchanged: no SOP covers customer-unreachable scenarios.
- **Tests: 39 → 45.**

## Phase 12d — Unavailable-order wording ✅ DONE
Found by the user running the trap questions. All four behaved correctly (no "Paris"; the customer-phone gap honestly reported as not covered by the SOPs — and correctly re-routed to the SOP index by 12c's probe), but **LM-9999 read as a contradiction**: the notice promised "Related decisions you do have access to:" and the text under it was itself a refusal about LM-9999.

Cause: the fallback still sent the *original* question to Gemini, which correctly refused — it can't find LM-9999 in context about other orders.
- 12d.1 ✅ The related list is now **presented, not synthesized**. Asking the model to answer a question about a missing order over *other* orders yields either a second refusal (contradicting the heading) or prose about the wrong order — exactly what the notice exists to prevent. Also costs no generation quota.
- 12d.2 ✅ Heading now role-accurate: "Related decisions from your area:" (agent) vs "Related decisions:" (manager); `_fallback_answer(..., lead_in=False)` drops its own "From the decision log:" opener so the two headings don't stack.
- 12d.3 ✅ Assertions tightened: the manager test now pins `tokens_used is None` and that no refusal text appears under the heading.

## Phase 12e — Hybrid retrieval (the real fix for "mostly gives no answer") ✅ DONE
User report: the assistant refuses far too often. Measured it properly — 21 realistic dispatcher questions, scoring whether the document that actually answers each one reaches the model: **15/21**. That is the refusal rate, and it had nothing to do with generation.

**Root cause.** Routing was a *hard switch* between the SOP index and the decision log. Any misroute guaranteed a refusal, because the policy answer simply isn't in the decision log. The keyword lists can't cover real phrasing, and 12c's semantic probe was too narrow to rescue it: it only ran when *no* keyword matched, so "how many NO-GOs before I involve a manager" was blocked by the single word "before" (a historical marker) and never got probed.

**Fix.** Stop choosing. Every question except a named live decision now searches **both** indexes; the cross-encoder picks from the merged pool. A concrete order number remains single-source — its own SHAP breakdown is the answer and nothing competes with it.
- 12e.1 ✅ **15/21 → 20/21.** Every one of the user's reported failures now retrieves its answering document.
- 12e.2 ✅ Measured four merge strategies rather than guessing: merge+rerank **20/21**, no-rerank 3+3 **20/21**, rerank-each-then-3+3 **19/21**. Raising the reranker's `top_n` to 8 or 10 changed nothing. Kept merge+rerank — simplest, and it keeps slot allocation adaptive.
- 12e.3 ✅ Deleted 12c's probe (`_resolve_unrouted`, `policy_match_distance`, `has_keyword_signal`, `RAG_POLICY_PROBE_MAX_DISTANCE`) — hybrid retrieval subsumes it entirely, and keeping both would be dead complexity.
- 12e.4 ✅ Dropped the idea of relabelling `route` by top reranked source: it made "Have we had similar NO-GO decisions before?" report `policy_lookup`, i.e. the label would flap with reranker noise. `route` stays the classifier's read of intent; `sources` already shows what actually answered.
- 12e.5 ✅ 4 tests, including that data questions still reach the decision log (the policy half must not crowd them out) and that **agent area-scoping still holds across both indexes**.
- **Finding — the cross-encoder is not trustworthy here.** For "can I ignore the AI if I know the area better", `manager-override-authority` is retrieved at **rank 2 by embedding** and the reranker pushes it to **12th of 12**, promoting verbose decision records above short policy docs. Classic length bias. It's the one remaining miss (20/21). Worth evaluating `RAG_RERANK_ENABLED=false` against a larger question set before trusting it further.
- **Tests: 39 → 43.**

## Phase 12f — Offline model loading 🔶 UNVERIFIED
Hit during 12e: with the network down, loading the embedding model **failed outright** — despite both models being cached on disk — because sentence-transformers calls huggingface.co for metadata regardless.
- 12f.1 ✅ Added `HF_HUB_ETAG_TIMEOUT`/`HF_HUB_DOWNLOAD_TIMEOUT` caps and `load_model_offline_first()`, which attempts the load with `HF_HUB_OFFLINE=1` and retries online so a first-ever download still works.
- 12f.2 🔶 **Not proven.** The verification run took **3058s** to load both models during the outage, so the offline path did not deliver a fast cached load. Normal operation is unaffected (the suite loads both models in ~25s), but the outage behaviour still needs testing against a deliberately blocked host.
- 12f.3 ⬜ **Deployment risk**: on Render this means an HF outage can hang or kill RAG on cold start. Pre-baking the model cache into the image, or forcing `HF_HUB_OFFLINE=1` once cached, should be settled in Phase 13.1.

## Phase 13 — RAG deployment readiness ⬜ TODO
- 13.1 ⬜ Confirm the host can run the RAG deps (first-run model download ≈180MB, memory per process, `USE_TF=0`)
- 13.2 ⬜ Chroma persistence on Render (no persistent disk — index rebuilds per restart) + `flask rag-reindex` on deploy
- 13.3 ⬜ Add RAG env vars to production
- 13.4 ⬜ Short RAG section in the docs
- **Open question for 13.1**: `run.py` calls `eventlet.monkey_patch()`, so the warmup "thread" is a greenthread — an 11s CPU-bound load will block the loop during startup. Harmless on the dev server (verified), but needs checking against Render's health-check timeout with `gunicorn -k gthread -w 1`.

## Phase 14 — Final RAG regression & commit ⬜ TODO
