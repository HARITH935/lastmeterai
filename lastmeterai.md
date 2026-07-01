# LastMeter AI — Project Specification

> This file is the single source of truth for building this project. Fill in the `[ASK: ...]` blanks below, then this becomes the reference document for all development work (e.g. for Claude Code or any developer picking this up).

---

## 1. Project Overview

**Project Name:** LastMeter AI
**Team Name:** [ASK: Keep "CodeNova" or use a different name?]
**Type:** Real project intended for production-quality build (not just a demo), for placement portfolio. 2-person team: you (frontend + backend + ML/MLOps) + teammate (scope TBD, coordinate directly).
**Tagline:** "The smartest delivery is the one you don't attempt."

**Problem statement:** Last-mile delivery fails because routing systems optimize distance/ETA but ignore customer availability, agent profit vs. effort, and weather/safety risk. LastMeter AI adds a decision-intelligence layer **before** routing — predicting whether a delivery should be attempted at all (GO / NO-GO), not just how to get there.

---

## 2. Confirmed Decisions (from planning conversation)

### 2.1 Users & Roles
- **Manager** — creates agent accounts, sees ALL orders/areas, can add/edit/delete orders, switches between agent areas on map, manages agents, views analytics/reports.
- **Agent** — pre-created account (no self-signup), sees ONLY their assigned area's orders, cannot edit orders, sees GO/NO-GO + risk reasons (NOT raw success %), can mark delivered/failed/postponed.
- Login: simple username/password, no public signup.

### 2.2 Core Decision Engine — GO/NO-GO factors (7 total)
1. Customer history (past failed deliveries at that address)
2. Weather risk (**real OpenWeather API**)
3. Traffic impact
4. Agent profit vs effort
5. Distance / time
6. Time-of-day risk
7. Package size risk

- Agent view: hides exact success %, shows only GO/NO-GO + reason breakdown.
- If deadline is today → forced/urgent delivery flag (different from normal GO).
- NO-GO → triggers reschedule prediction (best future slot suggestion).

### 2.3 ML Models (all scikit-learn, no deep learning)
| Purpose | Model |
|---|---|
| GO/NO-GO prediction | Logistic Regression (primary) + Random Forest (validation/ensemble) |
| Area/time failure rate prediction | Random Forest Regressor |
| Explainability (per-decision factor breakdown) | SHAP on top of Logistic Regression |
| Failure-reason text classification (NLP) | TF-IDF + Logistic Regression |
| Chat intent classification (NLP) | TF-IDF + Logistic Regression |
| Chat reply generation (LLM) | Google Gemini API (free tier) |

Training data: synthetic, rule-based generation (~5,000 records for GO/NO-GO, ~1,000-2,000 for area/time model). Documented as synthetic in the project (honest framing).

**Dataset realism enhancements ⭐** (added variables to make synthetic data more believable, all rule-based like the rest):
- Per-area variation across all 5 Chennai areas (Anna Nagar, T Nagar, Velachery, Adyar, Porur) — each with a different baseline risk profile, not just random
- Rainy-day clustering (multi-day rain streaks, not just random per-row weather)
- Festival/event traffic spikes (occasional high-traffic days layered on top of normal traffic patterns)
- Weekend effect (different customer-availability and traffic patterns on Sat/Sun vs weekdays)
- Residence type: apartment vs independent house (apartments → gate/security access risk factor; independent houses → more direct but variable customer availability)
These are added as extra generator parameters/columns feeding into the same Logistic Regression + Random Forest training (Section 2.3) — no new model type, just richer, more realistic input features.

### 2.4 Advanced/algorithmic features (not ML, but core features)
- **Dynamic re-routing** — nearest-neighbor/TSP-approx algorithm, recalculates route when a stop goes NO-GO.
- **Geofencing auto-status** — simulated GPS + distance check → auto status update (Arrived) near delivery point radius.
- **Reschedule prediction** — reuses area/time model + weather forecast to suggest best next slot for postponed orders.

### 2.5 Pages confirmed

**Agent:** Login, Home/Dashboard, Map view, AI Chat, Order history (filterable), Earnings page, Notifications, Profile, Settings, Order detail page.

**Manager:** Login, Home/Dashboard, Map view (switch between agent areas), AI Chat (analytics assistant), All Orders (table, search/filter/sort, CRUD), Reports/Analytics, Agent management, Notifications, Profile, Settings, Order detail page, **Customer Insights page**, **Area Intelligence page**.

**Settings Page ⭐** (shared shell, sections vary slightly by role):
- Profile (name, phone, area — editable basic info)
- Notification Preferences (toggle categories from Notification Center, Section E)
- Model Settings (Manager only — adjust GO/NO-GO threshold, per earlier "A/B testing the threshold" idea folded in here instead of as a separate feature)
- API Integrations (Manager only — view/status of Gemini, OpenWeather, OSRM connections; ties into Health Check endpoint, Section 2.10 #6)
- Security Settings (change password, active sessions)

**Area Intelligence Page ⭐** (Manager-accessible, per-area drill-down — linked from Heatmap, Section 2.10f):
```
Area: Velachery
Success Rate: 87%
Rain Impact: High
Best Delivery Time: 2 PM - 5 PM
Risk Level: Medium
```
Built from the Area/Time failure prediction model (Section 2.3): Success Rate is the inverse of predicted failure rate for that area; Rain Impact compares success rate on rainy vs clear days historically for that area; Best Delivery Time is the time-slot with the model's lowest predicted failure rate for that area; Risk Level reuses Section 2.10c bands at the area level. One page per area, selectable from the Heatmap or a simple area dropdown — same underlying data as Section 2.10f, just a focused single-area view instead of the all-areas map overlay.

**Customer Insights Page ⭐** (Manager-accessible, linked from Order detail page for that customer/address):
```
Success Rate: 92%
Failed Deliveries: 4
Preferred Delivery Time: Evening
Risk Level: Medium
```
Built entirely from the existing `delivery_history` table (grouped by address/customer) — Success Rate and Failed Deliveries are direct aggregates; Preferred Delivery Time is the most common successful `time_window` for that customer; Risk Level reuses the Risk Score Levels bands (Section 2.10c) applied to that customer's historical pattern. No new data collection — just a customer-centric rollup view alongside the existing order-centric and area-centric views.

**Advanced Search ⭐** (fleshes out "All Orders" table's search/filter/sort):
Combinable filters by: Order ID, Customer Name, Area, Agent, Risk Level (Section 2.10c bands), Date Range.
Also useful on Order history (Agent) page with a reduced filter set (own orders only — no Agent filter needed there).

**KPI Analytics Page ⭐** (fleshes out the "Reports/Analytics" page above with concrete metrics):
- Average Delivery Time
- Failed Delivery %
- Agent Performance Score (composite of success rate + volume, per agent)
- Area-wise Performance (ties into Section 2.10f Heatmap data)
- Weather Impact Analysis (correlates OpenWeather data with success/failure outcomes over time)

All derived from existing `orders`/`decisions` tables plus the area/time model — no new data collection needed, this is the deep-dive analytics counterpart to the top-level Executive Dashboard (Section 2.10b).

**Agent Leaderboard ⭐** (Manager-only view, gamification element):
```
1. Ravi - 98% Success
2. Karthik - 96%
3. Surya - 92%
```
Ranked by success rate (or Agent Performance Score from above) across all agents. Visible only to Manager role — not shown to Agents, to avoid unhealthy comparison pressure. Lives on the Agent management page or as a widget on KPI Analytics.

### 2.6 Real-time
- Flask-SocketIO. Manager edits order → pushed live to agent's screen instantly (no refresh). Also used for: new order assigned, urgent deadline alerts, status change notifications.

### 2.7 Design system
- **Theme:** Clean light theme, flat cards with thin borders, minimal shadows (Stripe-style).
- **Font:** Inter.
- **Colors:** Primary = Liquid blue `#2563EB`–`#3B82F6` range; Text = Dark slate `#1E293B`; Background = `#F8FAFC`; GO = Emerald `#10B981`; NO-GO = Red `#EF4444`; Urgent = Amber `#F59E0B`.
- **Navigation:** Sidebar on desktop, bottom tab bar on mobile (responsive, same app).
- **Map:** Dark map style (Uber-at-night feel) even though rest of app is light theme. Live route-drawing animation.
- **Login page:** Split screen — form on one side, map/illustration on the other.

### 2.8 Tech stack (final)
| Layer | Technology |
|---|---|
| Frontend | React + Leaflet.js |
| Backend | Python Flask + Flask-SocketIO |
| ORM / Database | SQLAlchemy ORM over SQLite (chosen so migration to PostgreSQL later is a config change, not a rewrite) |
| ML | scikit-learn (Logistic Regression, Random Forest) + SHAP |
| NLP | scikit-learn (TF-IDF + Logistic Regression) |
| LLM (chat generation only) | Google Gemini API (free tier) |
| Weather | OpenWeatherMap API (free tier) |
| Map tiles | OpenStreetMap (free, no key) |
| Routing | OSRM (free public API) — optional, for real road-distance routing |
| Testing | pytest |
| API docs | Swagger / OpenAPI |
| Auth | Password hashing (bcrypt) + JWT |

### 2.9 Production-quality habits (Option B — built production-ready, run at small/free scale for now)
- Environment variables for all secrets (`.env`, never hardcoded)
- SQLAlchemy ORM (not raw SQL) for easy DB portability
- Input validation on all forms
- Clean error handling (no raw stack traces to users)
- Modular folder structure

### 2.10 Selected "enhancement" features (final 8)
1. Confusion matrix + precision/recall metrics (not just accuracy) — shown in manager's Model Health view
2. Global feature importance ranking (model-wide, not just per-order SHAP)
3. Model versioning / MLOps metadata on dashboard ⭐ — version, training date, dataset size, accuracy, e.g.:
   ```
   Model Version: v1.2
   Last Trained: 24 Jun 2026
   Records: 5000
   Accuracy: 91.4%
   ```
   Stored alongside the saved `.pkl` (a small metadata JSON written at training time), surfaced on the Model Comparison Page (2.10d) and Manager dashboard.
4. Automated testing (pytest) — ML prediction function + key API endpoints
5. Audit logs / Activity Feed ⭐ — who changed what order, when, plus a live-feeling SaaS-style feed shown on dashboards, e.g.:
   ```
   10:32 AM - Order #124 marked Delivered
   10:29 AM - Agent Ravi entered Adyar zone
   10:22 AM - AI flagged Order #120 as NO-GO
   10:15 AM - Manager reassigned Order #118
   ```
   Same underlying audit-log table (order edits, status changes, geofence triggers, AI decisions) — the "Activity Feed" is just a real-time-styled, human-readable rendering of that table (newest first, relative/absolute timestamps), shown on both Manager and Agent dashboards. Pairs with Socket.IO (Section 2.6) so new entries can appear live without refresh.
6. Health check endpoint (`/health`) — DB connected? model loaded? Gemini reachable?
7. API documentation (Swagger/OpenAPI, auto-generated)
8. Environment-based config (`.env.development` / `.env.production`)

*(Quietly included: a `city` field on relevant tables, to leave the door open for multi-city later — no extra feature work now.)*

### 2.10h Command Center Map ⭐ (upgrades basic map to logistics-company-grade view)
The Manager map (and a lighter version for Agent) layers multiple data views on the same Leaflet map, each toggleable:

- Live agent locations (simulated GPS per Section 2.4 geofencing — agent dot moves/updates)
- Route lines (Section 2.4 dynamic re-routing output)
- Risk-colored orders (Section 2.10c Risk Score Levels — pin color = risk band)
- Area performance overlay (Section 2.10f Heatmap — failure-rate zones)
- Weather layer (OpenWeather API, Section 2.8 — rain/cloud overlay tiles)

Each layer is a togglable Leaflet layer control (so the map doesn't look cluttered by default) — no new data sources beyond what's already planned, this section is about combining them into one professional "command center" view rather than separate disconnected features. Real-time agent location updates pair with Socket.IO (Section 2.6).

### 2.10g AI Operations Center ⭐ (upgrades Delivery Insights AI into an actionable copilot, not just alerts)
Upgrades the AI Chat (Section 2.11) from purely reactive to a proactive operations copilot — an insights/actions feed shown above/alongside the chat (manager view primarily, light version for agent), e.g.:

```
⚠️ 5 orders should be postponed
⚠️ Heavy rain expected tomorrow
⚠️ Adyar failure rate increased 8%
💡 Reassign 3 orders to Agent Ravi
```

Two tiers of output:
- **⚠️ Alerts** (read-only, same as before) — area trend deltas, weather warnings, risky-agent counts, orders crossing the NO-GO/postpone threshold
- **💡 Recommendations** (new, actionable) — concrete suggested actions (reassign orders, postpone batch, reroute agent) that the Manager can accept with one click, which then performs the actual backend action (reassignment/status update) rather than just suggesting it in text

Implementation notes:
- Not a new model — a scheduled/on-load backend job that scans existing data (area/time failure model trends, weather forecast API, per-agent risk-score counts from Section 2.10c, current order/agent load) and surfaces both notable changes AND simple rule-based recommendations (e.g. "agent has spare capacity + nearby agent is overloaded with risky orders → suggest reassignment").
- Reuses: Area/Time failure model (2.3) for trend deltas, OpenWeather forecast endpoint for weather alerts, Risk Score Levels (2.10c) for risky-order/agent counts, existing order/agent tables for capacity-based reassignment suggestions.
- Recommendations are suggestions requiring Manager confirmation (one-click accept) — not autonomous actions, to keep a human in the loop.
- Surfaces as: (a) the AI Operations Center panel on the Manager dashboard, (b) entries in the Notification Center under "AI Alerts" (Section E), and (c) referenced naturally by the AI Chat (Section 2.11) when relevant questions are asked.
- This is what makes the AI Chat "feel real" — combines with the NLP intent classifier + Gemini (Section 2.11) so the assistant both answers questions AND proactively flags/recommends things worth attention.

### 2.10f Heatmap Visualization ⭐ (instant problem-area identification for managers)
A heatmap overlay on the Manager map view, built on top of the already-planned Area/Time failure prediction model (Section 2.3):

- 🔴 Red zones — high historical/predicted failure rate areas
- 🟡 Yellow zones — medium risk areas
- 🟢 Green zones — safe/reliable areas

Implementation notes:
- Leaflet.heat (or equivalent heatmap plugin) layered on the existing Leaflet map, toggleable on/off so it doesn't clutter the normal pin/route view.
- Intensity/color driven directly by the Random Forest Regressor's area/time failure-rate output — no new model, just a different visualization of existing predictions, aggregated per area across all time slots for the default view.
- Manager can filter by time slot (morning/afternoon/evening) to see how risk zones shift through the day.
- Pairs naturally with Section 2.10b (Cost-Saving Dashboard) and 2.10d (Model Comparison) as part of the manager's analytics suite.

### 2.10e Improved Explainability Format ⭐ (makes SHAP output more impressive/readable)
Instead of just listing factor names, every NO-GO (and GO) decision shows a ranked, signed contribution breakdown, e.g.:

```
NO-GO because:
- Weather Risk: +35%
- Customer History: +25%
- Distance: +15%
- Time of Day: +10%
```

Implementation notes:
- Values are the actual per-order SHAP contributions (Section 2.3), sorted descending by magnitude, formatted as signed % push toward NO-GO (positive = pushed toward NO-GO, would show negative for factors that pushed toward GO).
- All 7 factors (Section 2.2) are eligible to appear; only show non-negligible ones (e.g. hide <5% contributions) to keep it readable.
- Same data source as Section 2.10 (SHAP), this is purely a presentation-layer improvement on top of it — no new computation beyond what's already planned.
- Used on: Order detail page, Map pin popup, Agent decision card (reason breakdown), Manager order table row-expand.

### 2.10d Model Comparison Page ⭐ (demonstrates ML evaluation skills)
A dedicated page (Manager → Model Health/Comparison) showing both trained models side by side:

| Model | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Logistic Regression | e.g. 87% | ... | ... | ... |
| Random Forest | e.g. 91% | ... | ... | ... |

Ties directly into the already-planned confusion matrix / precision-recall enhancement (2.10 #1) — same evaluation run, just displayed as a comparison table instead of single-model metrics. Also notes which model is used as the "production" decision vs which is the "validation" check (per Section 2.3).

### 2.10c Risk Score Levels ⭐ (replaces binary-only framing with graded risk)
In addition to GO/NO-GO, every order gets a **risk score (0–100)** derived from the inverse of the ML success probability, shown alongside the decision:

- 🟢 **Low Risk** (0–30) — safe to attempt
- 🟡 **Medium Risk** (31–60) — proceed with caution, monitor factors
- 🔴 **High Risk** (61–100) — likely NO-GO, needs reschedule/override decision

Used in: Map pins (color matches risk level, not just GO/NO-GO), Order detail page, All Orders table (manager — sortable/filterable by risk level), Manager dashboard (risk distribution chart — how many orders in each band today).

This is a UI/labeling layer on top of the existing GO/NO-GO model output — no separate model needed, just bucketing `100 - success_probability` into the three bands above.
Answers the interview question: *"What business value does your AI provide?"* Shown on Manager dashboard (and summarized for Agent).

Metrics shown:
- Deliveries attempted vs deliveries avoided (NO-GO count)
- Estimated fuel saved (derived from distance × avoided NO-GO orders)
- Estimated failed-delivery cost avoided (derived from avg cost of a failed attempt: fuel + agent time + reattempt overhead)
- Success rate improvement (before AI / baseline vs after AI, using the historical synthetic data as "before" baseline)

This is essentially a calculated rollup view over the existing `decisions` table — no new ML model needed, just aggregation + simple cost-assumption formulas (documented as assumptions, e.g. "₹X per km fuel," "₹Y average cost of a failed attempt").

**Executive Dashboard layout ⭐** (this is the actual top-level Manager dashboard screen — supersedes the plain "Dashboard charts" wording in Section 5 Day 4):

Top metric cards:
- Total Orders Today
- Deliveries Completed
- High Risk Orders (uses Risk Score Levels, 2.10c)
- Revenue Today
- Estimated Savings (from this section's fuel/cost-avoided metrics)
- Active Agents

Trend charts below:
- Delivery Success Rate (over time)
- Failure Rate by Area (ties into 2.10f Heatmap data)
- Revenue by Day

All cards/charts are aggregations over existing tables (`orders`, `decisions`) — no new data sources, just the primary dashboard view pulling together metrics already defined elsewhere in this spec (Cost-Saving Dashboard, Risk Score Levels, Heatmap area data).

## 2.12 Feature Access Split — Manager vs Agent (all enhancements consolidated)

| Feature | Manager | Agent |
|---|---|---|
| Cost-Saving Dashboard (2.10b) | ✅ Full | ✅ Summarized (own deliveries only) |
| Executive Dashboard (top cards + trend charts) | ✅ Full (all agents/areas) | ❌ (Agent sees own Home/Dashboard instead, Section 2.5) |
| Risk Score Levels (2.10c) | ✅ All orders | ✅ Own orders only |
| Model Comparison Page (2.10d) | ✅ | ❌ |
| Improved Explainability format (2.10e) | ✅ All orders | ✅ Own orders only |
| Heatmap Visualization (2.10f) | ✅ | ❌ (not needed — agent only sees own area on map anyway) |
| Command Center Map (2.10h) | ✅ Full (all layers, all agents) | ✅ Lighter version — own route, own risk pins, weather layer only (no other-agent locations, no area heatmap overlay) |
| AI Operations Center (2.10g) | ✅ Full (alerts + recommendations + reassignment actions) | ✅ Reduced — own alerts only (e.g. "your Order #120 flagged NO-GO"), no reassignment/recommendation actions |
| KPI Analytics Page | ✅ | ❌ |
| Agent Leaderboard | ✅ Manager-only (confirmed earlier) | ❌ |
| Advanced Search | ✅ Full filters incl. Agent filter | ✅ Reduced filters (no Agent filter — own orders only) |
| Notification Center categories | ✅ All categories | ✅ All categories, own-scope only |
| Customer Insights Page | ✅ | ❌ (not needed for agent's workflow) |
| Area Intelligence Page | ✅ | ❌ |
| MLOps metadata (version/training date/accuracy) | ✅ (Settings → Model Settings) | ❌ |
| Activity Feed | ✅ Full (all agents' activity) | ✅ Own activity only |
| Settings — Model Settings, API Integrations | ✅ Manager only | ❌ (Agent Settings = Profile, Notification Preferences, Security only) |
| Settings — Profile, Notification Preferences, Security | ✅ | ✅ |

**Pattern used throughout:** every analytics/cross-agent/system-configuration feature is Manager-only; every Agent-facing feature is the same underlying data and model, just automatically scoped to that agent's own area/orders (same filtering logic already defined in Section 2.1 — "Agent sees only their assigned area's orders").

### 2.11 AI Chat — confirmed behavior
- **Efficient by design:** custom NLP intent classifier runs first → backend fetches only relevant data for that intent → Gemini only writes the final natural-language reply (keeps token usage low).
- **Agent chat tone:** conversational, delivery-focused (e.g. "Which orders should I deliver first?", "How much will I earn today?").
- **Manager chat tone:** analytics/business-focused, proactive alerts (e.g. "Which area has most failures?", "Suggest reassignments?").

### 2.13 Recommended Claude model for building this (if using Claude Code)
- **Sonnet (e.g. Claude Sonnet 4.6)** as the default for routine build work — CRUD APIs, React components, Flask routes, most ML code. Fast, capable, doesn't burn usage limits unnecessarily.
- **Opus (e.g. Claude Opus 4.7)** for harder reasoning moments — ML pipeline/architecture design, SHAP + Flask + real-time integration planning, debugging issues Sonnet gets stuck on.
- Switch per-task in Claude Code rather than using one model for everything.

---

## 3. OPEN QUESTIONS — please fill in before/while building

### A. Accounts & API keys — ✅ CONFIRMED
- Gemini API key: ready (kept safe by user, never shared in chat)
- OpenWeatherMap API key: ready (kept safe by user, never shared in chat)
- GitHub account: ready

### B. Environment — ✅ CONFIRMED
- Own laptop (Mac)
- Python installed ✅, Node.js installed ✅

### C. Scope/seed data — ✅ CONFIRMED
- 5 demo agents, one per area
- 30 seed orders (6 per agent)
- Chennai areas: Anna Nagar, T Nagar, Velachery, Adyar, Porur

### D. College/report requirements — ✅ CONFIRMED
- No specific report/document format required — working code + live demo is enough
- Submission deadline: **1 month from now**
- **Team project** — shared GitHub access needed (not solo)

### D2. Team — ✅ CONFIRMED
You personally are covering **frontend + backend + ML/MLOps** (dataset, preprocessing, model training, MLflow tracking, Docker, documentation). This matches/extends what's already in Section 2.3 and 2.10 #3; MLflow + Docker are additions on top of the existing plan (see Section 2.14 below).
Teammate's exact scope: not yet known — coordinate directly with her as the project progresses; revisit this section once clear to avoid overlap.
Repo: **one shared GitHub repo**, organized with folders (`/backend`, `/frontend`, `/ml`) so both of your work lives cleanly side by side.

### 2.14 MLOps additions (MLflow + Docker) ⭐
Layers on top of Section 2.3 (ML Models) and 2.10 #3 (model versioning metadata):
- **MLflow tracking** — replaces the manual JSON metadata file idea with proper MLflow experiment tracking: logs each training run's parameters, metrics (accuracy/precision/recall/F1), and the model artifact itself. Model Comparison Page (2.10d) and Model Versioning (2.10 #3) can pull directly from MLflow's tracking store instead of a hand-rolled JSON file.
- **Docker** — containerize the Flask backend (+ ML training/serving environment) so the whole app runs consistently regardless of machine; also makes deployment (Section F) cleaner — Render/Railway both support deploying from a Dockerfile.
- **Dataset collection & preprocessing** — formalizes Section 2.3's synthetic data generator + Section 2.3's "Dataset realism enhancements" into a proper preprocessing pipeline step (separate script/stage before training, not inline).

### E. Notifications — ✅ CONFIRMED
- In-app only, no email/SMS
- **Notification Center ⭐**: categorized into AI Alerts (from Section 2.10g Delivery Insights), Delivery Alerts (status changes, deadlines), Weather Alerts (OpenWeather-driven), System Alerts (account/app-level). Each category shows an unread count badge; notifications list filterable by category.

### F. Deployment — ✅ CONFIRMED
- Deploy to a live URL (Render/Railway for backend, Vercel for frontend)

### G. Timeline — ✅ CONFIRMED
- Target: 1 week, 5-7 hrs/day. Scope split into Week 1 MVP + Phase 2 (see Section 5).

---

## 4. Explicit Non-Goals (confirmed out of scope)
- No real payment gateway (simulated payment_amount only)
- No real GPS (simulated/geofenced coordinates only)
- No deep learning / neural networks (scikit-learn models only, by design — interpretability prioritized)
- No multi-tenant billing or SaaS sign-up flow
- No native mobile app (responsive web only)

---

## 5. Build Order — Split into WEEK 1 MVP (must-ship) and PHASE 2 (after submission, if time permits)

Reasoning: full original scope = ~40-50 hrs of work. One week at 5-7 hrs/day = ~35-49 hrs. To guarantee a fully working, deployed app within 1 week, the build is split so the MVP is always complete and demoable, and advanced extras are added afterward without risking an unfinished core.

### WEEK 1 MVP (must-have, ships this week)

| Day | Focus | Deliverable |
|---|---|---|
| Day 1 | Project setup, SQLAlchemy models, database schema, synthetic data generator (5 agents, 30 orders, 5 Chennai areas) | Working DB with seed data |
| Day 2 | Auth (login, JWT, roles) + Frontend shell (sidebar/bottom nav, routing, design system — Inter font, liquid blue palette) | Login works for both roles, app shell navigable |
| Day 3 | ML training (GO/NO-GO Logistic Regression + Random Forest) + order CRUD APIs | Orders can be created/edited; GO/NO-GO returned via API |
| Day 4 | Map (Leaflet, basic route line, pins color-coded GO/NO-GO/Urgent) + Dashboard charts + Cost-Saving Dashboard | Map view + dashboard (incl. fuel/cost-saved metrics) working for both roles |
| Day 5 | AI Chat (NLP intent classifier + Gemini integration, efficient context) | Chat answers real questions from real order data |
| Day 6 | Real-time (Socket.IO) + Notifications + remaining pages (Order history, Earnings, Profile, Settings, Agent management, All Orders table) | Full page set functional |
| Day 7 | Deployment (backend → Render/Railway, frontend → Vercel, DB → hosted), bug fixes, polish pass | Live URL working end-to-end |

**MVP scope explicitly includes:** all 7 GO/NO-GO factors, both ML models, SHAP per-order explainability, NLP intent classifier, Gemini chat, real-time updates, in-app notifications, full page list, responsive design, deployed live URL.

### PHASE 2 (after Week 1 submission — add if time allows before interview)
- Dynamic re-routing algorithm (TSP-approx recalculation on NO-GO)
- Geofencing-based auto status updates (simulated GPS)
- Reschedule prediction model refinement
- Failure-reason NLP classifier (free-text → category) feeding back into risk model
- Audit logs page

- Confusion matrix / precision-recall / global feature importance on Model Health view
- Model versioning display
- Automated tests (pytest)
- Swagger/OpenAPI docs
- Health check endpoint
- Environment-based config split (.env.development / .env.production) — *light version may be done in Week 1, full split in Phase 2*

This split is the honest plan: Week 1 = a complete, working, deployed, demoable product. Phase 2 = the deeper engineering/ML polish layered on top once the core is safe.

---

## 6. Remaining Open Items
None blocking — everything needed to start is confirmed. Teammate's exact scope is unknown for now; revisit and sync with her as the project progresses so work doesn't overlap.

---

*This document is the active build reference. Confirmed sections (1, 2, 5 MVP/Phase 2 split) are locked. Section 6 items can be answered as we go without blocking Day 1 start.*
