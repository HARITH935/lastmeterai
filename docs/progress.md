# LastMeter AI — Progress

## Completed Milestones

### Backend — 12/12 modules complete
| Module | Files | Tests |
|--------|-------|-------|
| Auth (JWT, bcrypt, roles) | `routes/auth.py`, `services/auth_service.py` | ✓ |
| Orders CRUD | `routes/orders.py`, `services/order_service.py` | ✓ |
| Decision Engine | `routes/decisions.py`, `services/decision_service.py` | ✓ |
| ML Predictor | `ml/predictor.py`, `ml/shap_explainer.py` | ✓ |
| DB Models | `models/user.py`, `order.py`, `decision.py`, `notification.py`, `audit_log.py`, `agent_location.py`, `model_metadata.py`, `chat_history.py` | ✓ |
| Seed data | `seed.py` — 1 manager, 5 agents (1 per Chennai area), 30 orders | ✓ |
| Analytics | `services/analytics_service.py`, `routes/analytics.py` | 67/67 |
| Notifications | `services/notification_service.py`, `routes/notifications.py` | 47/47 |
| Socket.IO | `sockets/events.py`, `sockets/__init__.py` | 50/50 |

### ML Pipeline — A1–A8 complete
| Step | Description | Status |
|------|-------------|--------|
| A1 | ML directory structure, requirements, feature contract | ✓ |
| A2 | Synthetic dataset generator (5,000 train + 1,000 val rows) + verification | ✓ |
| A3 | Model training — LR (91.6% acc) + RF (91.6% acc), MLflow runs, SHAP analysis | ✓ |
| A4 | Real model wired into predictor; `customer_history_score` convention fixed | ✓ |
| A4 cleanup | `explain_model.py` `PLACEHOLDER_W["customer_history_score"]` corrected to `+1.80`; explicit design comment added above `_predict_placeholder()` in `predictor.py` | ✓ |
| A5 | Area/time failure rate model (RF Regressor, MAE 3.03pp, R²=0.935) + MLflow run | ✓ |
| A6 | `rf_area_time_v1.0.pkl` wired into backend; heatmap uses ML predictions; `GET /api/analytics/area-intelligence/<area>` added | ✓ |
| A7 | NLP pipeline — failure-reason classifier (100% val acc) + intent classifier (98.6% val acc); both TF-IDF+LR; datasets generated; MLflow runs; model artifacts saved | ✓ |
| A8 | Both NLP models wired into backend; `POST /api/chat/message` live; failure-reason classifier replaces keyword bucketing; Gemini reply stubbed pending A9 | ✓ |
| A9 | Gemini reply generation wired; per-intent fallback templates for all 8 intents; `gemini_tokens_used` tracked; `[STUB]` sentinel fully removed | ✓ |

---

## Current Project Status

**Backend:** Fully functional at `localhost:5000`. All 251 smoke tests passing (6 suites — `test_chat.py` now at 47 checks).

**ML — all four models wired:**
- `lr_gonogo_v1.0.pkl` (LogisticRegression) — loaded by `ml/predictor.py`; GO/NO-GO decisions + SHAP.
- `rf_area_time_v1.0.pkl` (RF Regressor) — loaded by `ml/area_predictor.py`; heatmap + area intelligence.
- `failure_reason_clf_v1.0.pkl` (TF-IDF + LR pipeline) — loaded by `ml/failure_reason_predictor.py`; replaces keyword bucketing in `analytics_service.get_area_analytics()`.
- `intent_clf_v1.0.pkl` (TF-IDF + LR pipeline) — loaded by `ml/intent_predictor.py`; classifies chat messages at `POST /api/chat/message`; confidence threshold 0.40.

**AI Chat (A9):** `POST /api/chat/message` live. Intent → context fetch → Gemini reply (or per-intent fallback template if Gemini is unavailable). `[STUB]` sentinel fully removed. `gemini_tokens_used` tracked on assistant `ChatHistory` rows. **Live Gemini call not yet verified** — no `GEMINI_API_KEY` is configured in this environment; all replies use the deterministic fallback templates. The fallback path is fully verified (see A9 section below). Set `GEMINI_API_KEY` in `.env` to enable real Gemini calls.

**Feature convention (A4):** `customer_history_score` = reliability score. `1 = reliable customer (low failure rate), 0 = unreliable`. All layers consistent.

**Frontend:** Not started.
**Deployment:** Not started.

---

## MLflow Runs

| Experiment | Run ID | Metric |
|------------|--------|--------|
| `gonogo_logistic_regression` | `f37459702b23402aa23a88b5f14cca4e` | Accuracy 91.60% |
| `gonogo_random_forest` | `0162a7aaece64ecea19be950706e1721` | Accuracy 91.60% |
| `area_time_failure_rate` | `1b325f807eb14889bbbf7151a198c3c9` | MAE 3.03pp, R²=0.935 (synthetic self-consistency — see Known Issues) |
| `failure_reason_classifier` | `6fe942db63a848a986fa8a3730e432c5` | Val acc 100% (see Known Issues) |
| `chat_intent_classifier` | `87041bb40bbe474884f4f71c9d6523cd` | Val acc 98.59%, macro F1 0.9821 (see Known Issues) |

Tracking store: `ml/mlruns/`

---

## Latest Test Results (all suites, post-A4)

| Suite | Tests | Result |
|-------|-------|--------|
| `test_chat.py` | 47 | ✅ All pass (updated A9: STUB assertions flipped, gemini_tokens_used check, section 14 forced-failure) |
| `test_decisions.py` | 35 | ✅ All pass |
| `test_orders.py` | ~22 | ✅ All pass |
| `test_analytics.py` | 82 | ✅ All pass |
| `test_notifications.py` | 47 | ✅ All pass |
| `test_sockets.py` | 50 | ✅ All pass |

Post-A9: `test_chat.py` updated to 47 checks (was 37). All 6 suites remain green.

Key A4 verification in `test_decisions.py`:
- `model_version == "v1.0"` (real model loaded, confirmed)
- Anna Nagar / morning / small → GO, low risk, success_probability > 0.60 ✓
- Velachery / evening / large / heavy rain → NO-GO, high risk, success_probability < 0.50 ✓
- ≥3 top_factors with |contribution| ≥ 5.0 ✓
- SHAP values sum to ~100% (±2) ✓
- reschedule predicted_success_probability > current NO-GO probability ✓

---

## Remaining Milestones

### ML Pipeline
Complete through A9. No remaining ML/backend milestones.

### Frontend (not started)
- React + Vite project scaffold
- Design system (Inter font, liquid blue `#2563EB`, Stripe-style cards)
- Auth pages (login split-screen)
- Agent pages: Dashboard, Map, Order history, AI Chat, Earnings, Profile, Settings, Notifications
- Manager pages: Dashboard (Executive), Map (Command Center), All Orders, Reports/KPI, Agent Management, Model Health, Customer Insights, Area Intelligence, AI Operations Center
- Leaflet map: dark tiles, route lines, risk-colored pins, heatmap overlay, weather layer
- Socket.IO client: live order updates, notification badges, activity feed

### Deployment (not started)
- Docker — containerise Flask backend + ML serving environment
- Backend → Render or Railway
- Frontend → Vercel
- SQLite → hosted DB (or PostgreSQL migration)

---

## Files Created/Modified in A9

| File | Change |
|------|--------|
| `backend/app/services/gemini_service.py` | **New** — Gemini reply generation module; `generate_reply()` → `(reply_text, tokens_used)`; `_build_context_summary()` per-intent plain-English formatter; `_build_prompt()` role-aware system instruction; `_fallback_reply()` per-intent templates (8 total); `_get_api_key()` and `_call_gemini()` are module-level and patchable for tests |
| `backend/app/services/chat_service.py` | Modified — stub replaced with `gemini_service.generate_reply()` call; `gemini_tokens_used` stored on assistant `ChatHistory` row; docstring updated |
| `backend/tests/test_chat.py` | Modified — "reply is STUB" → "reply is not STUB"; "assistant row message is STUB" → "not STUB"; new check for `gemini_tokens_used is None` (fallback convention); new section 14 (9 checks): monkeypatches `_call_gemini` to force failure, verifies fallback templates for earnings_query, area_risk, and general; total checks 37 → 47 |
| `docs/progress.md` | Updated — A9 milestone, current status, file list |

**A9 verification status: PARTIALLY VERIFIED (fallback path fully verified; live Gemini call pending a real API key)**

No `GEMINI_API_KEY` is configured in this environment. Every chat reply uses the deterministic fallback path in `generate_reply()`. The fallback is verified via:
1. Normal path: all 8 intent tests in sections 2–10 produce non-STUB replies with the correct structure.
2. Forced-failure path (section 14): `_call_gemini` monkeypatched to raise `RuntimeError`; verified for earnings_query, area_risk, and general — all return intent-relevant, non-STUB, non-empty fallback strings.

**Follow-up action required:** Set `GEMINI_API_KEY=your_real_key_here` in `backend/.env` (file listed in `.env.example`, gitignored) and re-run `test_chat.py`. The fallback guard in `generate_reply()` will then only activate on actual API errors.

**`gemini_tokens_used` convention:**
- `int ≥ 1` — real Gemini API call succeeded; value is `response.usage_metadata.total_token_count`
- `None` — fallback path used (key absent, any exception, or SDK missing usage metadata)

**Prompt template examples (actual strings sent to Gemini when a key is present):**

*Intent: `earnings_query`, role: `manager`*
```
You are an analytics assistant for a last-mile delivery operations manager in Chennai, India. Your tone is professional and business-focused. Provide concise, data-driven insights that support operational decisions.

Detected intent: earnings_query

System context:
This week (all): 45 GO deliveries completed, 12 NO-GO decisions made. Estimated cost savings: ₹3,180.00. AI-assisted success rate: 78.9% vs 65.0% baseline (+21.4%).

User asked: "How much did the team earn this week?"

Instructions: Answer based only on the context provided above. Do not invent data, figures, or area names not mentioned. Keep your reply to 2-4 sentences and reference the actual numbers when available.
```

*Intent: `area_risk`, role: `manager`*
```
You are an analytics assistant for a last-mile delivery operations manager in Chennai, India. Your tone is professional and business-focused. Provide concise, data-driven insights that support operational decisions.

Detected intent: area_risk

System context:
Area risk overview (5 zones). Highest risk: Velachery (high risk, 34.2% failure rate). Also elevated: T Nagar (medium risk, 22.1% failure rate), Anna Nagar (medium risk, 18.5% failure rate). Safest area: Adyar (9.8% failure rate).

User asked: "Which area has the most delivery failures today?"

Instructions: Answer based only on the context provided above. Do not invent data, figures, or area names not mentioned. Keep your reply to 2-4 sentences and reference the actual numbers when available.
```

**Fallback template output examples (actual strings from forced-failure test in section 14):**

*earnings_query fallback:*
> Earnings summary for week (all): 45 deliveries completed, 12 skipped by the AI. Estimated savings from avoided failed deliveries: ₹3,180.00.

*area_risk fallback:*
> Highest risk area: Velachery (high risk, 34.2% failure rate). Check the heatmap for all 5 zones.

*general fallback:*
> I'm the LastMeter AI assistant. I can help with order status, earnings, area risk, reassignment suggestions, weather impact, agent performance, and postponement decisions. What would you like to know?

---

## Files Created/Modified in A8

| File | Change |
|------|--------|
| `backend/app/ml/failure_reason_predictor.py` | New — loader for `failure_reason_clf_v1.0.pkl`; mirrors `area_predictor.py` pattern; returns `None` on file absent (fallback to keyword bucketing) |
| `backend/app/ml/intent_predictor.py` | New — loader for `intent_clf_v1.0.pkl`; returns `(label, confidence)` or `(None, None)`; `CONFIDENCE_THRESHOLD = 0.40` |
| `backend/app/services/chat_service.py` | New — `handle_chat_message(user, text, session_id)`: classify intent, fetch context data per intent, persist 2 `ChatHistory` rows, return stub reply |
| `backend/app/routes/chat.py` | New — `POST /api/chat/message` (both roles); validates message, delegates to chat_service |
| `backend/app/routes/__init__.py` | Added `chat_bp` registration |
| `backend/app/services/analytics_service.py` | `get_area_analytics()` keyword-bucketing block replaced with `failure_reason_predictor.predict_category()` call; keyword logic kept as graceful fallback |
| `backend/tests/test_chat.py` | New — 37 checks across 13 sections (role access, all 8 intents, threshold fallback, DB row creation, validation) |
| `docs/progress.md` | Updated — A8 milestone, current status, files list |

**Failure-reason swap — before/after behaviour:**
The same `Order.failure_reason` text is now categorised by the TF-IDF+LR classifier instead of keyword matching. Category strings (`weather`, `customer`, `traffic`, `other`) are identical so the API response shape is unchanged. The classifier handles novel phrasings that don't contain the keyword list's exact words; it falls back to keyword matching only if the `.pkl` file is absent.

**Two test bugs found and fixed during A8:**
1. `get_cost_savings()` returns `{"metrics": {...}, "period": ..., "scope": ..., "assumptions": ...}` — `go_count` is nested at `metrics.go_count`, not top-level. Test assertion corrected to check `"metrics" in ctx`.
2. "What is the status of my recent orders?" → intent classifier confidence 0.384 (< 0.40 threshold) → correctly reclassified as `general` by the service. Test message changed to "Where is order #124?" (conf=0.676) which comfortably clears the threshold and tests the same agent-scoping logic.

---

## Files Created in A7

| File | Change |
|------|--------|
| `ml/src/training/train_nlp.py` | New — training script for both NLP classifiers; generates datasets, trains pipelines, logs to MLflow, saves pkls |
| `ml/data/raw/failure_reasons.csv` | New — 540 labeled (text, category) rows for failure-reason classifier |
| `ml/data/raw/chat_intents.csv` | New — 707 labeled (text, intent) rows for intent classifier |
| `ml/models/failure_reason_clf_v1.0.pkl` | New — TF-IDF + LR pipeline (56,669 bytes); 4 categories: weather/customer/traffic/other |
| `ml/models/intent_clf_v1.0.pkl` | New — TF-IDF + LR pipeline (100,013 bytes); 8 intents matching ChatIntent labels |
| `docs/progress.md` | Updated — A7 milestone, MLflow runs, Known Issue #4, file list |

**Dataset generation approach:** Per-category sentence templates × lexical substitution dicts, cross-product expansion. Failure reasons: 15 templates × 9 replacement dicts × 4 categories = 540 rows (perfectly balanced at 135/category). Intents: 15 templates × 5–8 replacement dicts × 7 structured intents + 75 standalone general examples = 707 rows. No randomness — fully deterministic and reproducible.

**Intent category rationale (8 labels, matching `ChatIntent` in `backend/app/models/chat_history.py`):**
| Intent | Trigger framing | Audience |
|--------|----------------|----------|
| `order_status` | "where is / status of [specific order]" | Agent + Manager |
| `earnings_query` | "how much did I earn / total payout" | Agent (own) + Manager (team) |
| `area_risk` | "which area is failing / risk level in [area]" | Manager |
| `reassign_suggestion` | "reassign / redistribute / move orders to" | Manager |
| `weather_query` | "is it raining / weather conditions in [area]" | Agent + Manager |
| `agent_performance` | "how is [agent] doing / success rate / top agents" | Manager |
| `postpone_query` | "which orders to postpone / delay / defer / reschedule" | Agent + Manager |
| `general` | greetings, capability questions, off-topic | Agent + Manager |

Note: The 8 labels come from `ChatIntent` in `backend/app/models/chat_history.py`, written during the original backend build (2026-06-24, before this A7 session — file mtime confirmed). That file already contained a comment "must match the classifier's training labels in `ml/src/training/train_nlp.py`", naming this training script by name in advance. The spec (§2.11) does not enumerate intent categories; the backend schema is the real source of the label list, not A7. The spec's illustrative `order_priority` label does not appear there; `order_status` + `postpone_query` cover that semantic space in the schema.

---

## Files Created/Modified in A6

| File | Change |
|------|--------|
| `backend/app/ml/area_predictor.py` | New — loader module for `rf_area_time_v1.0.pkl`; mirrors `predictor.py` pattern (absolute path, caching, graceful fallback to SQL if model absent) |
| `backend/app/services/analytics_service.py` | `get_heatmap()` updated: ML model now provides `failure_rate` for zone coloring; SQL rate kept as `live_failure_rate`; added `get_area_intelligence()` function |
| `backend/app/routes/analytics.py` | Added `GET /api/analytics/area-intelligence/<area>` route (manager-only) |
| `backend/tests/test_analytics.py` | Added 15 tests for area-intelligence endpoint in section 7b; added endpoint to role-enforcement list in section 8 |
| `docs/progress.md` | Updated status, current project status, remaining milestones |

**Replace vs. supplement decision:** The existing SQL heatmap aggregation is kept for `order_count` and `live_failure_rate` (actual live data). The ML model's prediction is the primary `failure_rate` used for zone coloring, per spec: *"Intensity/color driven directly by the Random Forest Regressor's area/time failure-rate output."* Both are returned in the response. The ML model provides stable, area-representative predictions that work from day 1 of the demo; the SQL rate is available alongside for operational transparency.

## Files Created/Modified in A5

| File | Change |
|------|--------|
| `ml/src/training/train_area_model.py` | New — RF Regressor training script for area/time failure rate |
| `ml/models/rf_area_time_v1.0.pkl` | New — trained model artifact (673KB) |
| `ml/src/training/explain_model.py` | Fixed stale `PLACEHOLDER_W["customer_history_score"]` from `-1.80` → `+1.80` |
| `backend/app/ml/predictor.py` | Added explicit design comment above `_predict_placeholder()` |
| `docs/progress.md` | Updated status, MLflow table, next tasks |

## Files Modified in A4

| File | Change |
|------|--------|
| `backend/app/ml/predictor.py` | Updated docstring; flipped `_WEIGHTS["customer_history_score"]` sign (+1.80); updated `_BASELINE` to training means; `_load_real_model()` now loads `lr_gonogo_v1.0.pkl` via absolute path; `compute_shap_pct()` uses real model coefficients when loaded |
| `backend/app/services/decision_service.py` | `_customer_history_score()` now returns reliability score (1=reliable); unknown customer default 0.35 → 0.65 |
| `backend/tests/test_decisions.py` | Updated `model_version` assertion from `"v1.0-placeholder"` → `"v1.0"` |
| `docs/progress.md` | Created (this file) |

---

## Next Task — A6: Wire Area/Time Model into Backend

`rf_area_time_v1.0.pkl` exists and is validated. The next step mirrors A4's pattern for the GO/NO-GO model:

1. Load `rf_area_time_v1.0.pkl` in a new `backend/app/ml/area_predictor.py` module (same pattern as `predictor.py`: absolute path from `__file__`, graceful fallback to SQL-aggregate heatmap if model file absent)
2. Replace `analytics_service.get_heatmap()` to use the ML model predictions per area/time-slot instead of raw SQL counts
3. Add `GET /api/analytics/area-intelligence/<area>` endpoint returning: success_rate, rain_impact (clear vs rainy weather comparison), best_delivery_time (lowest predicted failure rate across time windows), risk_level (low/medium/high band)
4. Update `test_analytics.py` to assert heatmap zones use model-predicted failure rates, not just SQL aggregations

---

## Known Issues

1. **`customer_history_score` — narrow production range (placeholder hash)**
   `_customer_history_score()` in `decision_service.py` is a hash-based placeholder that produces only 30 discrete values in `[0.61, 0.90]`, compared to the continuous `[0.01, 1.0]` range used during training. Sign and SHAP attribution are verified correct (A4 verification), but this reduces the feature's effective discriminative power in production — a customer with a genuinely poor history (score near 0) can never be represented. Replacing this with a real customer order-history lookup is a candidate for a future milestone. Do not implement now.

2. The seeded `ModelMetadata` rows in the DB still contain placeholder importances (from `seed.py`) — these will be updated when a model metadata endpoint is wired.

3. **`rf_area_time_v1.0.pkl` — R²=0.935 is a synthetic self-consistency result, not a generalization result.** The failure_rate target is a near-deterministic function of the input features (area base rate + additive modifiers) with only σ=0.025 Gaussian noise (noise-to-signal ratio 0.163). The theoretical R² ceiling given this noise level is ~0.974; reaching 0.935 confirms the model recovers the formula well, not that it generalizes to real delivery patterns. Additionally, the val set is a held-out split of the same 1,500-row generation run (not an independent seed), so train/val distributions are nearly identical (mean difference <0.003). This model is appropriate for powering the Heatmap and Area Intelligence page as a consistent lookup, but should not be cited as evidence of real-world predictive power.

4. **A7 NLP classifiers — validation accuracy reflects template-consistency, not real-world robustness.** Both `failure_reason_clf_v1.0.pkl` (val acc 100%) and `intent_clf_v1.0.pkl` (val acc 98.6%) are trained and evaluated on synthetic data generated from per-category sentence templates. Within each category the vocabulary is deliberately distinct (weather words, customer words, traffic words; earnings words, area words, etc.), so the categories are largely separable by bag-of-words by construction. A model trained and evaluated on its own generator always looks better than it would on genuinely novel phrasing from real users.

   **Hand-written test evidence (5 sentences per classifier, not from templates):**

   *Failure reason classifier (4/5 correct):*
   - FAIL `other` (expected `weather`): "Could not make it to the address, the entire street was submerged" — `submerged` is absent from the weather training vocabulary; the model matched `address` / `could not make it` to the `other` category instead. Root cause: weather training data uses `rain`, `storm`, `flood`, `flooding`, `cyclone` — not `submerge`.
   - PASS `customer` (conf=0.555): "Tried three times but nobody would open the gate"
   - PASS `traffic` (conf=0.585): "Got stuck behind a procession on the main street for over an hour"
   - PASS `other` (conf=0.408): "Wrong flat number on the order, went to third floor instead of fifth"
   - PASS `weather` (conf=0.478): "Incessant drizzle made the roads slippery throughout the journey"

   *Chat intent classifier (3/5 correct):*
   - FAIL `weather_query` (expected `area_risk`): "What is the situation in T Nagar this morning?" — both `area_risk` and `weather_query` templates reference area names; `situation` doesn't appear in area_risk templates, and `morning` is more common in weather queries.
   - FAIL `weather_query` (expected `postpone_query`, conf=0.276): "Should we hold off deliveries in flood prone areas for now?" — `flood prone` is a strong weather signal; `hold off` is absent from postpone_query training vocabulary (which uses `postpone`, `delay`, `defer`, `reschedule`). This is the anticipated weather/postpone vocabulary overlap boundary.
   - PASS `reassign_suggestion` (conf=0.404): "Can you move some of Ravi's orders to the other agents?"
   - PASS `earnings_query` (conf=0.760): "My total earnings so far this month?"
   - PASS `agent_performance` (conf=0.439): "How is Kumar doing compared to last week?"

   **Summary:** Both classifiers perform well on template-similar phrasing but show vocabulary boundary failures on novel word choices (submerged → weather, hold off → postpone). This is expected and appropriate to report. The models are suitable as the first-pass NLP layer but confidence thresholding (falling back to `general` below a threshold) will be important during backend wiring.
