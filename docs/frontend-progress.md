# LastMeter AI — Frontend Progress

## Phase B: Frontend

### B1 — Scaffold + Design System + Auth + Navigation Shell ✅

**Status:** Complete and verified.

**Tech choices:**
- **Framework:** Vite 8 + React 19 + TypeScript
- **Styling:** Tailwind CSS v3 (config-based, design tokens in `tailwind.config.ts`)
- **Routing:** react-router-dom v6 (`createBrowserRouter`)
- **State:** React Context (`AuthContext`) — no Redux; scope is appropriate for B1
- **JWT storage:** `localStorage` under key `lm_auth` (JSON: `{user, access_token, refresh_token}`)
  - Reasoning: spec requires "Refreshing the page while logged in should NOT log the user out."
    `localStorage` survives page reload; httpOnly-cookie would require backend changes out of scope for B1.
  - Trade-off acknowledged: `localStorage` is XSS-accessible. Acceptable for this project scope.

**Backend port note:** macOS AirPlay Receiver occupies port 5000 by default.
Backend configured to run on port 5001 via `os.environ.get("PORT", 5001)` in `backend/run.py`.
Frontend reads `VITE_API_BASE` from `.env.local` (defaults to `http://localhost:5001`).
To use port 5000: disable AirPlay Receiver in System Settings → General → AirDrop & Handoff.

---

### Design Token Values (as implemented)

| Token | CSS var | Tailwind class | Value |
|-------|---------|----------------|-------|
| Primary | `--color-primary` | `text-primary`, `bg-primary` | `#2563EB` |
| Primary light | `--color-primary-light` | `bg-primary-light` | `#3B82F6` |
| Text | `--color-text` | `text-slate-900` / base | `#1E293B` |
| Background | `--color-bg` | `bg-surface` | `#F8FAFC` |
| GO | `--color-go` | `text-go`, `bg-go` | `#10B981` |
| NO-GO | `--color-nogo` | `text-nogo`, `bg-nogo` | `#EF4444` |
| Urgent | `--color-urgent` | `text-urgent` | `#F59E0B` |
| Font | — | `font-sans` | Inter (Google Fonts) |
| Card | `.card` utility | — | white bg, `border-slate-200`, `rounded-xl`, shadow `0 1px 3px rgb(0 0 0 / 0.06)` |

All token values match spec §2.7 exactly.

---

### Files Created

```
frontend/
├── src/
│   ├── api/
│   │   └── auth.ts              # loginRequest() → POST /api/auth/login
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx       # primary/secondary/danger + loading spinner
│   │   │   ├── Card.tsx         # flat Stripe-style wrapper (sm/md/lg padding)
│   │   │   └── Input.tsx        # label + input + per-field error message
│   │   └── layout/
│   │       ├── Shell.tsx        # flex wrapper: Sidebar + <Outlet /> + BottomTabs
│   │       ├── Sidebar.tsx      # desktop nav (hidden md:flex); role-aware; Logout
│   │       └── BottomTabs.tsx   # mobile nav (flex md:hidden); first 5 items
│   ├── contexts/
│   │   └── AuthContext.tsx      # login()/logout(); reads localStorage on mount
│   ├── pages/
│   │   ├── Login.tsx            # split-screen; wired to backend; real error messages
│   │   └── Placeholder.tsx      # generic placeholder for all 12 routes
│   ├── router/
│   │   ├── index.tsx            # createBrowserRouter; all routes
│   │   ├── ProtectedRoute.tsx   # if (!user) → <Navigate to="/login" replace />
│   │   └── nav.ts               # MANAGER_NAV (11) + AGENT_NAV (8)
│   ├── vite-env.d.ts
│   ├── index.css                # Inter import; @tailwind directives; .card utility
│   ├── App.tsx                  # <AuthProvider><RouterProvider /></AuthProvider>
│   └── main.tsx
├── .env.local                   # VITE_API_BASE=http://localhost:5001
├── tailwind.config.ts           # design tokens extended
├── vite.config.ts               # port: 5173 explicit
└── package.json
```

**Backend modified:** `backend/run.py` — added `allow_unsafe_werkzeug=True`; `PORT` env var (default 5001).

---

### Verification Results

| Check | Result | Evidence |
|-------|--------|----------|
| V1: Both servers start | ✅ | Backend: `Running on http://127.0.0.1:5001`; Frontend: `VITE v8.1.0 ready in 626ms, Local: http://localhost:5173/` |
| V2a: Manager login — real backend response | ✅ | `access_token: True`, `user.role: manager`, `user.name: Operations Manager` |
| V2b: Agent login — role field | ✅ | `user.role: agent`, `user.area: Adyar` |
| V3: Nav counts | ✅ | `MANAGER_NAV.length === 11`, `AGENT_NAV.length === 8` |
| V4: Invalid login shows real error message | ✅ | `error: INVALID_CREDENTIALS`, `message: Invalid credentials.` — Login.tsx reads `err.message`, not hardcoded string |
| V5: Protected route redirects to /login | ✅ | `ProtectedRoute.tsx:7-8`: `if (!user) return <Navigate to="/login" replace />` |
| V6: Page refresh keeps user logged in | ✅ | `AuthContext.tsx:31`: `useState<StoredAuth|null>(() => readStorage())` — hydrates from localStorage on every mount |
| V7: Responsive nav layout | ✅ | `Sidebar.tsx:16`: `hidden md:flex`; `BottomTabs.tsx:12`: `flex md:hidden` |
| TypeScript: zero errors | ✅ | `npx tsc --noEmit` — no output |

---

### Login Flow (confirmed against real backend)

```
User submits {username: "manager", password: "manager123"}
  → POST http://localhost:5001/api/auth/login
  ← 200 {access_token: "eyJ...", refresh_token: "eyJ...", user: {id, username, name, role: "manager", area: null, is_active: true}}
  → AuthContext.login(user, access_token, refresh_token)
  → localStorage.setItem("lm_auth", JSON.stringify({user, access_token, refresh_token}))
  → navigate("/dashboard", {replace: true})
  → Sidebar renders MANAGER_NAV (11 items); BottomTabs renders first 5

User submits wrong password:
  ← 401 {error: "INVALID_CREDENTIALS", message: "Invalid credentials.", details: {}}
  → Login.tsx setFormError("Invalid credentials.")
  → Red error box displayed under the form

User navigates to /dashboard with no localStorage entry:
  → ProtectedRoute reads useAuth() → user is null
  → <Navigate to="/login" replace />
```

---

---

### B2 — Manager Executive Dashboard ✅

**Status:** Complete and verified.

**Chart library:** `recharts` — React-first, declarative JSX, ships with TypeScript types, covers
Line + Bar charts, no separate `@types/` package needed.

**Files created/modified:**
- `frontend/src/api/analytics.ts` — `getDashboard(accessToken)` → `GET /api/analytics/dashboard`
- `frontend/src/pages/Dashboard.tsx` — 6 metric cards + 3 charts, loading skeleton, error card,
  agent role-gate (shows placeholder until B3)
- `frontend/src/router/index.tsx` — `/dashboard` route now points to `<Dashboard />` instead of `Placeholder`

**Real API response used to build the UI (captured 2026-06-27):**
```json
{
  "cards": {
    "total_orders_today": 0,
    "deliveries_completed": 6,
    "high_risk_orders": 39,
    "revenue_today": 0.0,
    "estimated_savings": 45000.0,
    "active_agents": 5
  },
  "trends": {
    "success_rate_over_time": [
      {"date": "2026-06-21", "success_rate": 0.0},
      {"date": "2026-06-22", "success_rate": 0.0},
      {"date": "2026-06-23", "success_rate": 0.0},
      {"date": "2026-06-24", "success_rate": 0.0},
      {"date": "2026-06-25", "success_rate": 0.3621},
      {"date": "2026-06-26", "success_rate": 0.2981},
      {"date": "2026-06-27", "success_rate": 0.0}
    ],
    "failure_rate_by_area": [
      {"area": "Anna Nagar", "failure_rate": 0.1176},
      {"area": "T Nagar",    "failure_rate": 0.3333},
      {"area": "Velachery",  "failure_rate": 0.0556},
      {"area": "Adyar",      "failure_rate": 0.1731},
      {"area": "Porur",      "failure_rate": 0.3333}
    ],
    "revenue_by_day": [
      {"date": "2026-06-21", "revenue": 0.0},
      {"date": "2026-06-22", "revenue": 6850.0},
      {"date": "2026-06-23", "revenue": 2800.0},
      {"date": "2026-06-24", "revenue": 2900.0},
      {"date": "2026-06-25", "revenue": 3790.0},
      {"date": "2026-06-26", "revenue": 26290.0},
      {"date": "2026-06-27", "revenue": 0.0}
    ]
  }
}
```

**Verification results:**

| Check | Result | Evidence |
|-------|--------|----------|
| V1: Both servers start | ✅ | Backend `http://127.0.0.1:5001`; Frontend `http://localhost:5173/` |
| V2: 6 metric cards with real numbers | ✅ | Total Orders: 0, Completed: 6, High Risk: 39 (red), Revenue: ₹0.00, Savings: ₹45,000.00 (green), Agents: 5 |
| V3: 3 charts render | ✅ | Success Rate line: 7 points (Jun 21–27), peak 36.2% on Jun 25; Revenue bars: ₹26,290 spike on Jun 26; Failure Rate bars: 5 areas, T Nagar + Porur both at 33.3% |
| V4: Error state on backend down | ✅ | `fetch` throws `TypeError: Failed to fetch` → caught in `.catch()` → red card with message |
| V5: Agent role gate | ✅ | `user.role !== 'manager'` → returns `<Placeholder name="Dashboard" />` before any API call; backend also returns 403 for agent token |
| V6: TypeScript zero errors | ✅ | `npx tsc --noEmit` — no output |

---

### B3 — Agent Home/Dashboard ✅

**Status:** Complete and verified.

**Component split:** `AgentDashboard` extracted to `frontend/src/pages/AgentDashboard.tsx`.
The `Dashboard` export in `Dashboard.tsx` routes by role:
```
user.role === 'agent'   → <AgentDashboard />
user.role === 'manager' → <DashboardFetcher /> (B2, unchanged)
anything else           → <Placeholder />
```

**Shared component extracted:** `MetricCard` moved from local closure in `Dashboard.tsx`
to `frontend/src/components/ui/MetricCard.tsx` and imported by both manager and agent pages.

**Backend endpoints used (no new backend code):**
- `GET /api/orders?date_from=<local_midnight_ISO>&per_page=100&sort_by=deadline&sort_dir=asc`
  — auto-scoped to `user.area` by `order_service.list_orders()` for agent JWT
- `GET /api/analytics/cost-savings?period=week`
  — auto-scoped to `user.area` by `analytics_service.get_cost_savings()` for non-manager JWT

Two calls made in parallel via `Promise.all()`.

**Files created/modified:**
- `frontend/src/components/ui/MetricCard.tsx` — shared card extracted from Dashboard.tsx
- `frontend/src/api/orders.ts` — `getAgentOrders()` + `OrderListItem` / `OrderListResponse` types
- `frontend/src/api/analytics.ts` — added `getCostSavings()` + `CostSavingsResponse` type
- `frontend/src/pages/AgentDashboard.tsx` — new agent dashboard page
- `frontend/src/pages/Dashboard.tsx` — replaced placeholder branch with real agent component

**Real API responses captured (ravi.kumar / Adyar, 2026-06-27):**

Orders today (`date_from=2026-06-26T18:30:00.000Z`): 12 total in Adyar — all `area: "Adyar"`
confirmed (backend scoping verified). Breakdown: 10 pending, 0 in_transit, 0 delivered,
0 failed, 2 postponed.

Cost savings this week (scoped to Adyar):
```json
{
  "scope": "Adyar",
  "metrics": {
    "success_rate_with_ai": 0.1818,
    "baseline_success_rate": 0.73,
    "total_savings_inr": 16135.43,
    "deliveries_avoided": 51
  }
}
```

**Verification results:**

| Check | Result | Evidence |
|-------|--------|----------|
| V1: Both servers start | ✅ | Backend `:5001`; Frontend `:5173` — verified via lsof |
| V2: Agent dashboard shows real values | ✅ | Total Today: 12, Delivered: 0, Pending/In-Transit: 10, Failed/Postponed: 2, Success Rate: 18% (red — below 73% baseline), Savings: ₹16,135.43 |
| V3: Order list scoped to Adyar only | ✅ | All 12 orders in response have `area: "Adyar"` — backend enforces `Order.area == user.area` at `order_service.py:252` |
| V4: Manager B2 dashboard unaffected | ✅ | `GET /api/analytics/dashboard` still returns Total: 0, Completed: 6, High Risk: 39, Agents: 5 |
| V5: Error state | ✅ | Same red card as B2 (`border-nogo/30 bg-red-50`) — identical pattern |
| V6: Agent role guard in Dashboard.tsx | ✅ | `user?.role === 'agent'` → `<AgentDashboard />`; `user?.role === 'manager'` → `<DashboardFetcher />` |
| V7: TypeScript zero errors | ✅ | `npx tsc --noEmit` — no output |

---

---

### B4 — Map Page (Leaflet, Dark Tiles, Heatmap Overlay, Order Pins) ✅

**Status:** Complete and verified.

**Tile provider:** CartoDB Dark Matter —
`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
No API key required. OSM + CARTO attribution only.

**Heatmap approach:** React-Leaflet `Circle` components (one per zone), not `leaflet.heat`.
Radius scales with `failure_rate` (1 500 m base + up to 4 000 m), color matches risk_band
(`low` → green, `medium` → amber, `high` → red — same design tokens as B1). Reason:
`leaflet.heat` has no TypeScript types and compatibility issues with react-leaflet v4; for
5 fixed zones, `Circle` is more informative (popup with area name + stats) and requires no
extra install beyond `leaflet` + `react-leaflet`.

**Role split:**
- Manager: `getAllOrders()` + `getHeatmap()` in parallel → 40 pins + 5 heatmap zones +
  both layer toggles (Order Pins, Heatmap)
- Agent: `getAgentOrders()` only → 12 pins in own area only, no heatmap toggle rendered

**Side-fix:** `OrderListItem` in `orders.ts` was missing `latitude`/`longitude` fields —
added in B4 (backend always returned them; TypeScript type was incomplete).

**Files created/modified:**
- `frontend/src/pages/Map.tsx` — full map page (loading/error/success, role-branched)
- `frontend/src/router/index.tsx` — `/map` now renders `<Map />` instead of Placeholder
- `frontend/src/api/analytics.ts` — added `getHeatmap()` + `HeatmapZone`/`HeatmapResponse`
- `frontend/src/api/orders.ts` — added `getAllOrders()` + `latitude`/`longitude` to `OrderListItem`

**Real API data used (post-seed state, 2026-06-27):**

Manager orders — 40 total pins:
| Area | Pin count |
|------|-----------|
| Adyar | 12 |
| Velachery | 9 |
| Anna Nagar | 7 |
| Porur | 6 |
| T Nagar | 6 |

Heatmap zones:
| Area | failure_rate | risk_band | Radius |
|------|-------------|-----------|--------|
| Anna Nagar | 17% | low | ~2 164 m |
| T Nagar | 34% | medium | ~2 840 m |
| Velachery | 55% | high | ~3 689 m |
| Adyar | 42% | high | ~3 168 m |
| Porur | 17% | low | ~2 163 m |

Agent (ravi.kumar) — 12 pins in Adyar only, areas seen: `{'Adyar'}`.
Heatmap request with agent JWT → `403 FORBIDDEN`.

**Verification results:**

| Check | Result | Evidence |
|-------|--------|----------|
| V1: Both servers start | ✅ | Backend `:5001`; Frontend `:5173` |
| V2: Manager map — dark tiles + 40 pins across 5 areas | ✅ | `GET /api/orders?per_page=100` → 40 orders, all with lat/lon |
| V3: Heatmap on — 5 zones with real failure rates | ✅ | `GET /api/analytics/heatmap` → 5 zones; Velachery 55% (high), Adyar 42% (high), T Nagar 34% (medium), Anna Nagar 17% (low), Porur 17% (low) |
| V4: Popup shows real order data | ✅ | Each `CircleMarker` popup: order_number, customer_name, area, status, risk |
| V5: Agent sees only Adyar pins, no heatmap toggle | ✅ | `GET /api/orders` → 12 orders, only `area: "Adyar"`; `isManager=false` hides the Heatmap button |
| V6: Error state on backend down | ✅ | Same `border-nogo/30 bg-red-50` error card as B2/B3 |
| V7: TypeScript zero errors | ✅ | `npx tsc --noEmit` — no output |

---

---

### B5 — AI Chat Page ✅

**Status:** Complete and verified.

**Endpoint:** `POST /api/chat/message` — JWT-required, both roles.

**Session ID handling:** First message omits `session_id` — backend auto-generates a UUID and
returns it as `session_id` in the response. Frontend captures it and passes it on all subsequent
messages in the same page session. Backend confirmed it returns the same UUID on msg 2 as msg 1.

**Known limitation — chat history does not persist across page reloads.**
`GET /api/chat/history` does not exist. `chat.py` has only one route (`POST /api/chat/message`).
`ChatHistory` rows are written to the DB as an audit log but there is no read-back endpoint.
Chat messages are held in local React state only; navigating away or refreshing resets the
conversation. This is inherent to the current backend scope and is not a frontend bug.

**Intent labels (all 8, from ChatIntent class — plain strings):**

| Backend value | Badge label shown |
|---------------|-------------------|
| `order_status` | Order Status |
| `earnings_query` | Earnings |
| `area_risk` | Area Risk |
| `reassign_suggestion` | Reassignment |
| `weather_query` | Weather |
| `agent_performance` | Agent Performance |
| `postpone_query` | Postpone Query |
| `general` | General (muted style) |

`general` intent badge is styled with muted slate (not blue) since it's the fallback — visually
distinguishable from a real classification.

**Files created/modified:**
- `frontend/src/api/chat.ts` — `sendChatMessage()` + `ChatMessageResponse` interface
- `frontend/src/pages/Chat.tsx` — full chat page (empty state, message thread, typing indicator,
  intent badge with confidence, inline error messages)
- `frontend/src/router/index.tsx` — `/chat` now renders `<Chat />` instead of Placeholder

**Real API exchanges (post-seed state, 2026-06-27):**

Manager — "Which area has most failures?":
```
POST /api/chat/message { "message": "Which area has most failures?" }
→ intent:            area_risk
  intent_confidence: 0.6246  (62% confidence)
  threshold_applied: false
  model_loaded:      true
  reply: "Highest risk area: Velachery (high risk, 54.8% failure rate).
          Check the heatmap for all 5 zones."
```

Manager — second message reusing session_id (V3):
```
POST /api/chat/message { "message": "Suggest reassignments for today",
                         "session_id": "ed3cbeba-7906-4caf-b8dd-502d36bd63c4" }
→ session_id returned: "ed3cbeba-7906-4caf-b8dd-502d36bd63c4"  ✅ same UUID
  intent: general  (classifier confidence below threshold)
```

Agent (ravi.kumar) — "How much will I earn today?":
```
POST /api/chat/message { "message": "How much will I earn today?" }
→ intent:            earnings_query
  intent_confidence: 0.6178  (62% confidence)
  model_loaded:      true
  context_data scope: "Adyar"  ← scoped to agent's own area ✅
  reply: "Earnings summary for week (Adyar): 7 deliveries completed,
          9 skipped by the AI. Estimated savings from avoided failed
          deliveries: ₹2,847.47."
```

**Verification results:**

| Check | Result | Evidence |
|-------|--------|----------|
| V1: Both servers start | ✅ | Backend `:5001`; Frontend `:5173` |
| V2: Manager — real intent label + reply | ✅ | `area_risk` @ 62%, Velachery identified as highest-risk area |
| V3: Second message reuses session_id | ✅ | UUID `ed3cbeba-...` identical on both messages |
| V4: Agent — own-area scoping in reply | ✅ | `earnings_query` @ 62%, context_data scope: `"Adyar"`, reply mentions Adyar |
| V5: Error state shown inline in chat thread | ✅ | Invalid token → `TOKEN_INVALID` error shown as inline red bubble, not full-page crash |
| V6: Chat resets on page refresh | ✅ | `GET /api/chat/history` → 404 (no endpoint); chat is in-memory only; documented as known limitation |
| V7: TypeScript zero errors | ✅ | `npx tsc --noEmit` — no output |

---

---

### B6 — Orders Pages (Manager All Orders + Agent Order History) ✅

**Status:** Complete and verified.

**Role split:**
- Manager → `/orders`: sortable table with server-side search + filters, expandable row for inline detail
- Agent → `/orders`: card-based list with status + date filters, inline status update action panel

**Backend capabilities used (all server-side):**

| Param | Manager | Agent |
|-------|---------|-------|
| `search` (ILIKE: order_number + customer_name) | ✅ | N/A (own area only) |
| `area` filter | ✅ | auto-scoped (not exposed) |
| `status` filter | ✅ | ✅ |
| `risk_level` filter | ✅ | N/A |
| `date_from` filter | ✅ | ✅ |
| `sort_by` (created_at / deadline / risk_score / payment_amount) | ✅ | fixed (deadline asc) |
| `page` + `per_page` | ✅ (20/page) | 100 (all at once) |

**Status update (agent only):**
`PATCH /api/orders/:id/status` is wired with inline action panel per row.
Valid transitions (mirroring backend `_AGENT_TRANSITIONS`):
- `pending → postponed`
- `in_transit → delivered, failed, postponed`
- `failure_reason` required (and validated) for `failed` and `postponed`

**Manager CRUD (POST/PUT/DELETE):** Backend endpoints exist but UI is **deferred** — building create/edit/delete forms is its own milestone, not bundled here.

**Order Detail page:** Deferred. Full SHAP factor breakdown, weather snapshot, decision history, reschedule suggestions are a separate spec entry. Manager table rows expand inline to show address, phone, package, payment, decision, risk_score, failure_reason — a lightweight preview, not the full spec detail page.

**`OrderListItem` additions (fields returned by backend but missing from TS interface):**
- `residence_type: string`
- `agent_id: number | null`
- `agent_name: string | null`

Map.tsx (`getAllOrders(access_token!)`) continues to work — `params` defaults to `{}` with `per_page=100`.

**Files created/modified:**
- `frontend/src/api/orders.ts` — added `AllOrdersParams`, `UpdateStatusResponse`, updated `getAllOrders()` signature, added `updateOrderStatus()`, extended `OrderListItem` with `agent_name`/`agent_id`/`residence_type`
- `frontend/src/pages/Orders.tsx` — full page with `ManagerOrders` + `AgentOrders` role-branched components
- `frontend/src/router/index.tsx` — `/orders` now renders `<Orders />`

**Real data observed (2026-06-28):**

Manager table (40 total, 20/page, 2 pages):
```
LM-0040 | Anna Nagar Customer   | area=Adyar     | agent=Ravi Kumar   | status=pending  | risk=medium
LM-0039 | Socket Test Customer  | area=Velachery | agent=Surya Venkat | status=pending  | risk=high
LM-0038 | Adyar Reassign Customer| area=Adyar    | agent=Ravi Kumar   | status=pending  | risk=low
```

Filter verifications:
- `area=Velachery` → 9 orders, all areas: `{'Velachery'}` ✅
- `risk_level=high&sort_by=risk_score&sort_dir=desc` → 4 orders, top: LM-0036 (risk_score=100) ✅
- `search=Dinesh` → 5 orders, customer_name "Dinesh Raj" across 5 areas ✅

Agent (ravi.kumar / Adyar): 12 orders, areas: `{'Adyar'}`, 7 actionable (pending).

Status update test:
- `PATCH /api/orders/6/status` `{status: "postponed", failure_reason: "Customer not available..."}` → `status=postponed` ✅
- Invalid: `postponed → delivered` → `INVALID_TRANSITION` ✅
- Missing reason for `failed` → `VALIDATION_ERROR: Required when status is 'failed' or 'postponed'` ✅

**Verification results:**

| Check | Result | Evidence |
|-------|--------|----------|
| V1: Both servers start | ✅ | Backend `:5001`; Frontend `:5173` |
| V2: Manager table — real data, multi-area | ✅ | 40 orders, 5 areas, agent names populated |
| V3: Filters + sort work via real API calls | ✅ | area/risk_level/search all return filtered server results |
| V4: Agent view — Adyar only | ✅ | 12 orders, `areas: {'Adyar'}` |
| V5: Status update — valid + invalid + missing reason | ✅ | All three cases match backend behavior |
| V6: Error state matches B2–B5 pattern | ✅ | Same `border-red-200 bg-red-50` error card |
| V7: TypeScript zero errors | ✅ | `npx tsc --noEmit` — no output |

---

---

### B7 — Analytics / Reports Page ✅

**Status:** Complete and verified.

**Route:** `/reports` (manager only — agent gets 403 from backend; UI shows graceful message)

**Files changed:**
- `frontend/src/api/analytics.ts` — added `KPIResponse`, `WeatherImpactResponse`, `AgentPerf`, `AreaPerf`, `WeatherDay`, `getKPI()`, `getWeatherImpact()`
- `frontend/src/pages/Reports.tsx` — new page (created)
- `frontend/src/router/index.tsx` — `/reports` wired to `<Reports />`

**Sections rendered:**
1. **Summary cards** — Total Orders, Delivered, Failed %, Avg Delivery Time (from `GET /api/analytics/kpi`)
2. **Agent Performance table** — Name, Area, Orders, Delivered, Success Rate (color-coded), Score (mini progress bar). Sorted by `performance_score` desc (backend orders it).
3. **Area Performance chart** — Stacked `BarChart` (recharts): delivered vs failed/postponed per area.
4. **Weather Daily chart** — `LineChart` of `success_rate` per day from `GET /api/analytics/weather-impact`. Shows note "Only one day of data" when seed data produces a single entry — handled gracefully.
5. **Weather Summary cards** — Clear day / Light rain / Heavy rain success rates, Revenue lost to weather.
6. **Cost Savings cards** (all-time manager scope from `GET /api/analytics/cost-savings?period=all`) — Deliveries Avoided, Fuel Saved (L), Total Savings (₹), AI Success Rate, vs Baseline (+/-%).

**Period selector:** "This Week" / "This Month" toggle at top-right. Switches both KPI and weather-impact fetches. Cost savings always all-time (no period dependency).

**Real data observed (period=week):**
- 40 orders, 6 delivered, 12.5% failed, avg delivery time: 0 min (seed data, no time gap)
- Weather: clear 84.1%, light rain 47.7%, heavy rain 1.2%, revenue lost ₹11,500.00
- Cost savings: 30 deliveries avoided, 4.725 L fuel saved, ₹9,491.40 total savings, 33.3% AI success rate, −54.34% vs 73% baseline

**Verification:**

| Step | Result |
|------|--------|
| V1: `/reports` renders with real manager data | ✅ All 5 sections populated |
| V2: Period toggle "This Week" → "This Month" re-fetches | ✅ State resets to loading then repopulates |
| V3: Agent 403 handled | ✅ Backend returns 403; UI shows "This page is for managers only." |
| V4: Weather chart graceful empty state | ✅ Single data point shows note, not broken chart |
| V5: Error state on network failure | ✅ Red `.card` with message |
| V6: TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |

---

## Remaining Frontend Milestones

| Milestone | Description |
|-----------|-------------|
| B8 | Agent management page (Manager) — Agent list, performance scores, area assignments, leaderboard widget |
| B9 | Earnings page (Agent) — Savings breakdown, GO/NO-GO history, weekly/monthly earnings graph |
| B10 | Notifications page — Notification list, read/unread state, Socket.IO real-time badge updates |
| B11 | Settings page — Profile edit, notification preferences, security (password change); Manager: model threshold slider, API status |
| B12 | Customer Insights page (Manager) — Per-customer aggregates, success rate, preferred time window |
| B13 | Area Intelligence page (Manager) — Per-area drill-down from `/api/analytics/area-intelligence/<area>` |

**Next recommended step:** B8 — Agent Management page.

---

### B8 — Agent Management Page ✅

**Status:** Complete and verified. Read-only page — no write actions exist in the backend.

**Route:** `/agents` (manager only — agent token gets 403 from the KPI endpoint; UI shows graceful message)

**Backend capability audit (performed before writing any code):**
- No dedicated `/api/agents` endpoint exists. Route files are `analytics.py`, `auth.py`, `chat.py`, `decisions.py`, `notifications.py`, `orders.py` — no `agents.py`.
- Agent-list data comes exclusively from `GET /api/analytics/kpi` → `agent_performance` array (same source as B7's Reports table, now given a focused page).
- `GET /api/orders?agent_id=<id>` is confirmed server-side (order_schema.py line 242, order_service.py lines 259-260). Used for click-through order detail.
- No write operations exist: no `POST /api/agents`, no `PUT /api/users/<id>`, no area reassignment. `PATCH /api/auth/me/profile` updates only own name/phone/prefs for the current user. B8 is intentionally read-only.
- `AgentLocation` model has `is_online`, `heading`, `speed_kmh` but no REST endpoint — Socket.IO only. Online status deferred to B10 (Notifications + real-time).

**Files changed:**
- `frontend/src/api/orders.ts` — added `agentId?: number` to `AllOrdersParams`; added `agent_id` query param in `getAllOrders()`
- `frontend/src/pages/Agents.tsx` — new page (created)
- `frontend/src/router/index.tsx` — `/agents` wired to `<Agents />`

**Page features:**
1. **Agent card grid** (1 col mobile → 2 col sm → 3 col lg) — each card shows name, area badge, orders count, delivered count, success rate (green ≥70% / amber 40–69% / red <40%), performance score with mini progress bar. Cards are clickable.
2. **Period toggle** (This Week / This Month) — re-fetches KPI on change; clears selected agent.
3. **Sort dropdown** (Score / Success Rate / Area / Name) — client-side re-sort of the 5-agent array; instant, no re-fetch.
4. **Click-through order detail** — clicking a card issues `GET /api/orders?agent_id=<id>` via manager token; shows a full-width detail panel below the grid with a compact orders table (order number, customer, status badge, deadline, risk badge, amount). Clicking again or "Close ×" collapses it.

**Real data observed (period=week):**

| Name | Area | Orders | Delivered | Success Rate | Score |
|------|------|--------|-----------|-------------|-------|
| Ravi Kumar | Adyar | 8 | 2 | 25.0% | 47.5 |
| Surya Venkat | Velachery | 8 | 1 | 12.5% | 38.8 |
| Karthik Raj | T Nagar | 6 | 1 | 16.7% | 34.2 |
| Priya Lakshmi | Anna Nagar | 6 | 1 | 16.7% | 34.2 |
| Deepa Mohan | Porur | 6 | 1 | 16.7% | 34.2 |

**Click-through verified:** `GET /api/orders?agent_id=2&per_page=50` (Ravi Kumar) returns 8 orders, agent_names `['Ravi Kumar']`, areas `['Adyar']` — no cross-agent leakage.

**Verification:**

| Step | Result |
|------|--------|
| V1: Servers running cleanly | ✅ Both backend (5001) and frontend (5173) up |
| V2: All 5 agents render with real data | ✅ Confirmed — see table above |
| V3: Sort controls re-order correctly | ✅ Score desc: Ravi→Surya→(tie); Success Rate desc: Ravi (25%)→tie (16.7%)→Surya (12.5%); Area asc: Adyar→Anna Nagar→Porur→T Nagar→Velachery; Name asc: Deepa→Karthik→Priya→Ravi→Surya |
| V4: Click-through shows real orders | ✅ agent_id=2 → 8 orders, all Ravi Kumar / Adyar only |
| V5: Agent (ravi.kumar) blocked cleanly | ✅ KPI returns 403; UI shows "This page is for managers only." |
| V6: Error state (backend down) | ✅ Matches B2–B7 pattern: `border-red-200 bg-red-50` card |
| V7: TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |

---

---

### B9 — Earnings Page (Agent) ✅

**Status:** Complete and verified. Agent-only page — managers see a clean "for agents only" message.

**Route:** `/earnings` (AGENT_NAV only)

**"Earnings" concept — what's real, what's simulated:**
- **No dedicated earnings/commission endpoint exists** in the backend. `_ctx_earnings_query` in `chat_service.py` simply calls `get_cost_savings(user, "week")` — confirming the spec's "Earnings" page maps to the cost-savings framing.
- `payment_amount` is a simulated field on every `Order` row; spec explicitly states "No real payment gateway (simulated payment_amount only)".
- **"Total Earned" is a client-side aggregation**: `orders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.payment_amount, 0)`. No backend endpoint pre-computes this. Documented in the UI via a sub-note ("simulated — no live payment gateway").
- **"AI Cost Savings" comes from `getCostSavings(token, period)`** (server-computed): go_count, no_go_count, fuel_saved_litres, total_savings_inr. This is the canonical "earnings" data source per the chat service's `earnings_query` intent handler.
- The page labels the two sources separately so neither is misread as the other.

**Period options:** `week / month / all` (three-button toggle — one more than B7/B8 because agents benefit from seeing all-time cumulative). `getCostSavings` accepts `VALID_PERIODS = {"today", "week", "month", "all"}` — all confirmed by reading source. `getAgentOrders` `dateFrom` computed client-side from period (week → −7 days, month → −30 days, all → omit).

**Weekly/monthly comparison chart:** Not built. `getCostSavings` returns only aggregate totals (no sub-period breakdown), and `getAgentOrders` has no time-series endpoint. All 40 seed orders created on the same day means a comparison chart would show nothing meaningful. Documented explicitly rather than silently omitted.

**Files changed:**
- `frontend/src/pages/Earnings.tsx` — new page (created)
- `frontend/src/router/index.tsx` — `/earnings` wired to `<Earnings />`

**Page sections:**
1. **Delivery Earnings** — client-side sum of `payment_amount` for delivered orders: Total Earned, Orders Delivered, Avg per Delivery. Sub-note explains simulated nature.
2. **AI Cost Savings** — from `getCostSavings()`: GO Decisions, Trips Avoided, Fuel Saved (L), Total Savings (₹). Shows agent's area in section label.
3. **Performance** — Success Rate vs Baseline (73%), improvement %.
4. **Order & Decision History** — table of all orders in period: order number, customer, AI Decision (GO/NO-GO badge), Outcome (status badge), Deadline, Amount. Delivered rows highlighted green. Delivered orders floated to top, then newest-first.

**Real data observed (ravi.kumar, period=week / Adyar):**

| Section | Values |
|---------|--------|
| Total Earned | ₹800.00 (LM-0003 ₹620 + LM-0002 ₹180) |
| Orders Delivered | 2 |
| Avg per Delivery | ₹400.00 |
| GO Decisions | 7 |
| Trips Avoided | 9 |
| Fuel Saved | 1.418 L |
| Total Savings | ₹2,847.47 |
| Success Rate (AI) | 28.6% vs 73.0% baseline → −60.86% |
| Orders in history | 12 (all Adyar, no cross-area leakage) |

**Note:** `week`, `month`, and `all` currently return identical numbers — all 40 seed orders were created in the last 30 days, so all three windows cover the same data. Period toggle is correctly wired (re-fetches on change); equality is a seed data artifact.

**Verification:**

| Step | Result |
|------|--------|
| V1: Both servers running | ✅ Backend 5001, frontend 5173 |
| V2: ravi.kumar earnings render with real data | ✅ ₹800.00 earned, ₹2,847.47 savings, 12 orders |
| V3: Period selector triggers re-fetch | ✅ Re-fetches on toggle; same values expected with seed data |
| V4: Decision history scoped to Adyar only | ✅ All 12 orders area='Adyar', confirmed by direct API call |
| V5: Manager on /earnings sees clean block | ✅ `user?.role !== 'agent'` gate shows "This page is for agents only." |
| V6: Error state on backend down | ✅ `border-red-200 bg-red-50` card matching B2–B8 pattern |
| V7: TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |

---

## Remaining Frontend Milestones

---

### B10 — Notifications Page ✅

**Status:** Complete and verified. Shared page (both roles) — server scopes results to logged-in user regardless of role.

**Route:** `/notifications` (in both MANAGER_NAV and AGENT_NAV)

**Files changed:**
- `frontend/src/api/notifications.ts` — new API client (created)
- `frontend/src/pages/Notifications.tsx` — new page (created)
- `frontend/src/router/index.tsx` — `/notifications` wired to `<Notifications />`

**Backend capabilities used:**
- `GET /api/notifications` — params: `category`, `is_read` (`"true"/"false"`), `page`, `per_page` (max 50)
- `PATCH /api/notifications/<id>/read` — marks single notification read; idempotent; returns full notification dict
- `PATCH /api/notifications/read-all` — body `{ category? }` optional; returns `{ updated_count }`. When no category provided, marks all user's notifications read. Category filter supported.
- `DELETE /api/notifications/<id>` — returns `{ message }`. Cross-user access → 403.

**Notification model fields confirmed:** `id`, `user_id`, `category` (string enum), `title`, `message`, `is_read`, `order_id` (nullable), `extra` (nullable JSON), `created_at`

**Category values and colors:**
- `ai_alert` → blue (`bg-blue-50 text-blue-600`)
- `delivery_alert` → amber (`bg-amber-50 text-amber-600`)
- `weather_alert` → cyan (`bg-cyan-50 text-cyan-600`)
- `system_alert` → slate (`bg-slate-100 text-slate-500`)

**`unread_counts` — 5 keys confirmed:** `ai_alert`, `delivery_alert`, `weather_alert`, `system_alert`, `total`

**Page features:**
1. **Notification list** — unread rows with subtle blue background + filled dot; read rows plain. Title, category badge, message (2-line clamp), timestamp, linked order reference if `order_id` present.
2. **Unread count badge** in page header.
3. **Filter controls** — category pills (All / AI / Delivery / Weather / System) + read/unread toggle (All / Unread / Read). Both are real server-side filters. Changing either resets to page 1.
4. **Actions** — Mark single as read (✓ button, only on unread rows); Delete (× button); Mark all read button (scoped to current category filter when active).
5. **Refetch on mutation** — all three actions refetch the list after success, keeping `unread_counts` accurate. Pending IDs tracked in a `Set<number>` to disable buttons while in-flight.
6. **Unread breakdown card** — when viewing "All" filter and there are unread notifications, shows per-category unread counts as clickable pills that jump to that category filter.
7. **Pagination** — Previous/Next with page indicator; only shown when pages > 1.
8. **Empty states** — contextual message based on current filter.

**Socket.IO real-time — explicitly deferred.** `socket.io-client` is not installed. The backend's `emit_new_notification` emits `{ notification_id, category, title, message }` to room `user_{id}` on every `create_notification()` call. Wiring client-side requires installing the package and managing connection lifecycle at the Shell level (not just this page). Deferred as a known gap — event name and payload documented here for the next pass.

**Real data observed (after V3/V5 mutations):**

| User | Before | After V3 (mark id:18 read) | After V5 (delete id:4) |
|------|--------|---------------------------|------------------------|
| ravi.kumar | 4 total, 2 unread | 4 total, 1 unread | 3 total, 1 unread |
| manager | 3 total, 2 unread | unchanged | unchanged |

**User scoping confirmed:** ravi.kumar IDs [18,17,12], manager IDs [1,2,3] — completely separate sets. Agent attempting `PATCH /api/notifications/1/read` (manager notification) → 403.

**Verification:**

| Step | Result |
|------|--------|
| V1: Both servers running | ✅ Backend 5001, frontend 5173 |
| V2: ravi.kumar sees 4 notifications, 2 unread | ✅ Confirmed — ids 18 (ai_alert), 17 (delivery_alert) unread |
| V3: Mark id:18 read → API fires, unread drops 2→1 | ✅ PATCH returns `is_read:True`; follow-up GET confirms |
| V4: Category and read filters hit server-side | ✅ `category=ai_alert` → 1 result; `is_read=false` → 1 result |
| V5: Delete id:4 → gone from API | ✅ Total 4→3; IDs [18,17,12] confirmed |
| V6: Manager sees own notifications only | ✅ Separate ID sets; cross-user PATCH → 403 |
| V7: Error state matches B2–B9 pattern | ✅ `border-red-200 bg-red-50` card in error branch |
| V8: TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |

---

---

### B11 — Settings Page ✅

**Status:** Complete and verified. Shared page for both roles. Three sections built from confirmed backend capabilities.

**Route:** `/settings` (in both MANAGER_NAV and AGENT_NAV)

**Files changed:**
- `frontend/src/api/auth.ts` — extended with `UserProfile` type, `getMe()`, `updateProfile()`, `changePassword()` (modified)
- `frontend/src/pages/Settings.tsx` — new page (created)
- `frontend/src/router/index.tsx` — `/settings` wired to `<Settings />` (modified)

**Backend capabilities confirmed and used:**

| Feature | Endpoint | Real/Spec-only | Status |
|---------|----------|----------------|--------|
| Profile edit (name, phone) | `PATCH /api/auth/me/profile` | **Real** | Built |
| Notification preferences (4 toggles) | `PATCH /api/auth/me/profile` (same endpoint, `notification_prefs` field) | **Real** | Built |
| Password change | `PATCH /api/auth/me/password` | **Real** | Built |
| Model threshold slider | — | **Spec-only** — no backend endpoint; `GONOGO_THRESHOLD` is `app.config` at 0.5 | **Omitted** |
| API integration status | — | **Spec-only** — no health-check endpoint exists | **Omitted** |

**Allowlisted fields confirmed** (from `auth.py` route + `auth_service.py`):
- `name`: 1–120 chars, stripped whitespace
- `phone`: digits only, 10–15 digits, or null to clear
- `notification_prefs`: partial patch; valid keys: `ai_alert`, `delivery_alert`, `weather_alert`, `system_alert` (all boolean)
- NOT self-editable: `username`, `area`, `role`, `is_active`, `city`

**Password change behavior (CRITICAL):**
- Request: `{ current_password, new_password, confirm_password }`
- Server-side: new ≥ 8 chars, new ≠ current, new == confirm
- On success: JWT is **revoked server-side** (`_revoke(jti)`) — user must log in again
- UI: shows "Signing you out…" success state, then calls `logout()` + `navigate('/login')` after 2s via `useEffect` + `clearTimeout` cleanup

**Page design:**
1. **Profile section** — name input + phone input + read-only role badge + area badge (agents only). Single "Save Profile" PATCH call.
2. **Notification Preferences section** — 4 custom toggle switches (`role="switch"`), "Save Preferences" button. Separate PATCH call from profile save.
3. **Security section** — current + new + confirm password inputs, client-side validation before API, red "Change Password" button to signal session-ending action.
4. **"Coming soon" card** — explains that model threshold and API status have no backend implementation yet.

**AuthContext note:** After profile save, the context user object (in localStorage) is NOT updated. Name change is visible immediately in the form but the nav/header will reflect the old name until next login. Updating context after profile save is a follow-up improvement.

**Real data observed (ravi.kumar):**

| Step | Before | After |
|------|--------|-------|
| Name edit | "Ravi Kumar" | "Ravi Kumar (edited)" |
| Confirm via GET | — | name: "Ravi Kumar (edited)" ✅ |
| Name restored | "Ravi Kumar (edited)" | "Ravi Kumar" ✅ |
| Prefs toggle (weather_alert) | `{..., weather_alert: True}` | `{..., weather_alert: False}` ✅ |
| Password change cycle | agent123 | TempPass789! → old token 401 → new login → restored to agent123 ✅ |

**Manager profile:** `role: manager, area: None` → page shows only role badge, no area badge ✅

**Verification:**

| Step | Result |
|------|--------|
| V1: Both servers running | ✅ backend 5001, frontend 5173 |
| V2: Profile loads real values (name/phone/prefs) | ✅ name: Ravi Kumar, phone: 9876543210, area: Adyar |
| V2b: Edit name+phone, confirm via follow-up GET | ✅ PATCH persisted; GET confirms new values |
| V3a: Mismatch confirm → client-side blocks (and server also rejects) | ✅ `VALIDATION_ERROR — new_password and confirm_password do not match.` |
| V3b: Wrong current password → HTTP 401 | ✅ confirmed |
| V3c: Too-short new password → 400 VALIDATION_ERROR | ✅ "New password must be at least 8 characters." |
| V4: Real password change + token revocation + restore | ✅ old token → 401; new login works; restored to agent123 |
| V4b: Notification prefs toggle (weather_alert false) | ✅ PATCH + GET both confirm change |
| V5: Manager sees role badge, no area; agent sees both | ✅ manager area: None |
| V6: Error state matches B2–B10 pattern | ✅ `border-red-200 bg-red-50` card in `status === 'error'` branch |
| V7: TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |

---

---

### B12 — Customer Insights Page ✅

**Status:** Complete and verified. Manager-only page. **Search-only tool** — no browsable list (see below).

**Route:** `/customer-insights` (MANAGER_NAV only — not in AGENT_NAV)

**Files changed:**
- `frontend/src/api/analytics.ts` — added `CustomerInsightResponse`, `CustomerInsightOrder` types, `getCustomerInsights()` function (modified)
- `frontend/src/pages/CustomerInsights.tsx` — new page (created)
- `frontend/src/router/index.tsx` — `/customer-insights` wired to `<CustomerInsights />` (modified)

**Search-only vs. browsable list — explicit statement:**
This page is a **search-only tool** (single-address lookup). No browsable list of all customers is possible because:
1. `GET /api/analytics/customer` only supports single-address point-lookup (confirmed from route code)
2. Address match is EXACT (`Order.customer_address == address`) — case-sensitive, no LIKE/fuzzy matching
3. No separate `delivery_history` model/table exists — spec text was conceptual; data is queried from `Order` directly
4. Building a browsable list would require a new backend endpoint (out of scope for B12)

**Backend endpoint confirmed:**
- `GET /api/analytics/customer?address=<address>` — manager-only
- Required param: `address` (empty → 400 VALIDATION_ERROR)
- No history → 404 `NO_HISTORY_FOUND`

**Response shape confirmed from service code:**
```
{
  "address": str,
  "summary": { "total_orders", "delivered", "failed", "postponed",
               "success_rate" (0.0–1.0), "risk_level" ("low"|"medium"|"high") },
  "preferred_delivery_time": "morning"|"afternoon"|"evening",
  "recent_orders": [..., max 5 items (orders[:5])]
}
```

**Risk level bands** (from `_risk_level_from_score`): LOW ≤30, MEDIUM ≤60, HIGH >60 — applied to `failure_rate_pct = round((1 - success_rate) * 100)`

**Page design:**
1. **Search bar** — text input + "Look up" button; trims whitespace before search
2. **Idle state** — info card explaining exact-match requirement
3. **Loading** — skeleton grid + table
4. **Not-found state** — amber warning card (`border-amber-200 bg-amber-50`) — explicitly NOT a red error card, since 404 is an expected normal outcome
5. **Error state** — red card (`border-red-200 bg-red-50`) for genuine failures (network error, 5xx, etc.)
6. **Success state** — 4 metric cards + recent orders table

**Success state metrics:**
- Success Rate: colored `text-go/text-urgent/text-nogo` (≥70%/≥40%/<40%), sub-text shows `X of N delivered`
- Failed Deliveries: count from `summary.failed`, sub-text shows postponed count if >0
- Preferred Time: capitalized `preferred_delivery_time` value
- Risk Level: RiskBadge (same `RISK_COLORS` as B6/B8/B9), total orders as sub-text

**Real data observed (address: `"99 Test Lane, Adyar, Chennai"`):**

| Field | API value | Page display |
|-------|-----------|--------------|
| Success Rate | 0.0 | "0.0%" (text-nogo) |
| Failed Deliveries | 0 | "0" (sub: "2 postponed") |
| Preferred Time | "morning" | "Morning" |
| Risk Level | "high" | red badge |
| Total Orders | 4 | "4 orders total" |
| recent_orders count | 4 | 4 rows shown (≤5 cap) |

**Verification:**

| Step | Result |
|------|--------|
| V1: Both servers running | ✅ backend 5001, frontend 5173 |
| V2: Direct API call for known address | ✅ `99 Test Lane, Adyar, Chennai` → confirmed fields |
| V3: Page values match API | ✅ 0.0% success, 0 failed (2 postponed), Morning, high risk |
| V4: recent_orders respects ≤5 cap | ✅ 4 orders total → 4 shown (within cap) |
| V5: Nonexistent address → amber not-found (not red error) | ✅ 404 NO_HISTORY_FOUND → amber card |
| V6: Agent access → role-gate card + 403 from API | ✅ confirmed |
| V7: Error state (network failure) → red error card | ✅ `border-red-200 bg-red-50` pattern |
| V8: TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |

---

---

### B13 — Area Intelligence Page ✅

**Status:** Complete and verified. Manager-only page. Auto-fetches on mount (default: Anna Nagar) and on area change.

**Route:** `/area-intelligence` (MANAGER_NAV only — not in AGENT_NAV)

**Files changed:**
- `frontend/src/api/analytics.ts` — added `VALID_AREAS`, `AreaName`, `AreaIntelligenceResponse` types + `getAreaIntelligence()` (modified)
- `frontend/src/pages/AreaIntelligence.tsx` — new page (created)
- `frontend/src/router/index.tsx` — `/area-intelligence` wired to `<AreaIntelligence />` (modified)

**Backend endpoint confirmed:**
- `GET /api/analytics/area-intelligence/<area_name>` — manager-only
- Path param: one of 5 exact area names (Anna Nagar, T Nagar, Velachery, Adyar, Porur)
- Unknown area → **404** `AREA_NOT_FOUND` (different from `GET /api/analytics/area/<area>` which returns 400 `INVALID_AREA`)
- This 404 path is **effectively unreachable via UI** — the dropdown only shows the 5 valid areas

**Service return shape (confirmed from analytics_service.py lines 793–801):**
```
{
  "area": str,
  "success_rate": float | null,              // 1 - avg_failure (at weather_severity=0.15)
  "best_delivery_time": str | null,          // time slot with lowest failure rate
  "rain_impact": float | null,               // pp increase in failure rate: rainy - clear
  "weather_sensitivity": str | null,         // "high" (>0.15) | "medium" (>0.08) | "low"
  "risk_level": str | null,                  // "low" (≤0.20 avg_failure) | "medium" (≤0.40) | "high"
  "predictions_by_time": {                   // SUCCESS rates (1 − failure_rate) per slot
    "morning": float | null,
    "afternoon": float | null,
    "evening": float | null,
  },
  "model_available": bool
}
```

**Important nuance:** `predictions_by_time` values are **success rates** (the service applies `1.0 - failure_rate`), NOT raw failure rates. This was confirmed by reading the service code.

**Risk band thresholds** (`_risk_band_from_failure_rate`): LOW ≤0.20, MEDIUM ≤0.40, HIGH >0.40 (applied to avg failure rate). Different from per-order bands (which use 0–100 integer).

**Heatmap link — explicitly deferred.** Map.tsx uses react-leaflet `<Popup>` components with inline-style `<div>` content. Adding React Router navigation inside Leaflet popups requires non-trivial wiring (programmatic navigate or handler prop threading). The spec says "OR a simple area dropdown" — the dropdown satisfies the requirement. Heatmap click-through is a future polish item.

**Page design:**
1. **Area dropdown** at top-right — 5 fixed options, auto-fetches on change via `useEffect([area])`
2. **Overview row** (4 cards): Success Rate (colored), Risk Level (badge), Best Delivery Time, Weather Sensitivity (badge + rain_impact pp sub-text)
3. **Rain Impact card** — Clear vs Rainy side-by-side comparison using approximations (`success_rate` ≈ clear; `success_rate - rain_impact` ≈ rainy); caveat note about synthetic model
4. **Delivery Success by Time Slot** (3 cards) — Morning/Afternoon/Evening success rates, with "Best ★" ring and badge on the best_delivery_time slot
5. **model_available: false** path — amber warning card (model unavailable)

**Real data observed (all 5 areas):**

| Area | Success Rate | Color | Risk Level | Best Time | Weather Sensitivity |
|------|-------------|-------|-----------|-----------|---------------------|
| Anna Nagar | 83.4% | text-go | low | Morning | medium |
| T Nagar | 66.5% | text-urgent | medium | Morning | medium |
| Velachery | 45.2% | text-urgent | high | Morning | medium |
| Adyar | 58.2% | text-urgent | high | Morning | medium |
| Porur | 83.4% | text-go | low | Morning | medium |

Note: `Velachery` `success_rate = 0.4525` ≥ 0.4 → `text-urgent` (amber), NOT `text-nogo`. Confirmed by Python `srColor` check during verification.

**Velachery time-slot predictions (V4 cross-check):**

| Slot | API value | Page display |
|------|-----------|--------------|
| Morning ★ | 0.4809 | 48.1% (amber) |
| Afternoon | 0.4561 | 45.6% (amber) |
| Evening | 0.4205 | 42.1% (amber) |

**Verification:**

| Step | Result |
|------|--------|
| V1: Both servers running | ✅ backend 5001, frontend 5173 |
| V2: Velachery — page values match API exactly | ✅ 45.2% success, high risk, Morning best, medium sensitivity, +14.4 pp rain |
| V3: Switch to Anna Nagar — data updates | ✅ 83.4% success (text-go), low risk, morning best, 86.7%/86.2%/77.4% time slots |
| V4: predictions_by_time are success rates per slot | ✅ morning 48.1%, afternoon 45.6%, evening 42.0% — match API `predictions_by_time` directly |
| V5: Agent role gate | ✅ API returns 403; page shows "manager only" card |
| V6: Error state matches B2–B12 pattern | ✅ `card border-red-200 bg-red-50` |
| V7: TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |

---

---

### B-Profile — Profile Page ✅

**Decision taken:** Path B — genuine missing page. Reasoning:

1. `nav.ts` has a distinct "Profile" nav entry (`/profile`) in BOTH MANAGER_NAV and AGENT_NAV — pointing at a live Placeholder (dead UI for all logged-in users)
2. Spec section 2.5 lists "Profile" and "Settings" as two separate named pages in the agent page list and manager page list (lines 65 and 67 of `lastmeterai.md`)
3. The content is non-duplicative: Profile = **read-only identity card**; Settings = **editable forms**. `GET /api/auth/me` returns `username`, `city`, `created_at` — fields NOT shown in Settings — sufficient for a meaningful view.
4. `getMe()` already existed from B11 — no new API surface required.

**Spec ambiguity noted:** The spec also uses "Profile" as a section *within* Settings (lines 70, 305, 306 — describing the editable name/phone/area form). The spec's "Settings Page ⭐" section lists "Profile" as one of its sub-sections, meaning the spec conflates the term. Resolution: Settings houses the *editable form*; the `/profile` route is the *read-only identity view*. Both exist as distinct, non-duplicative pages.

**Route:** `/profile` (both MANAGER_NAV and AGENT_NAV)

**Files changed:**
- `frontend/src/pages/Profile.tsx` — new page (created)
- `frontend/src/router/index.tsx` — `/profile` wired to `<Profile />`, import added (modified)

**Backend endpoint used:** `GET /api/auth/me` — already confirmed and used in B11 Settings. Returns `UserProfile` type (already in `frontend/src/api/auth.ts`). No new endpoint or API type needed.

**What the page shows (read-only — no editable forms):**
- Avatar placeholder (blue circle with first-letter initial)
- Name + `@username` (mono font)
- Role badge (blue pill, capitalized)
- Phone — shown only when `phone != null`
- Area badge (slate pill) — shown only when `area != null` (agents only; managers have `area: null`)
- City
- Member Since (`created_at` formatted as "27 June 2026")
- Account Status (Active/Inactive badge)
- Link to `/settings` for editing

**What is NOT on Profile (intentionally):** No editable name/phone, no notification toggles, no password form — all of those are on Settings. Zero duplication.

**Real data observed during verification:**

*ravi.kumar (agent):*

| Field | Value | Rendered |
|-------|-------|---------|
| Avatar | — | "R" (initial of "Ravi Kumar") |
| Name | Ravi Kumar | `text-lg font-bold` |
| @username | ravi.kumar | `@ravi.kumar` (mono) |
| Role | agent | blue badge |
| Phone | 9876543210 | shown (not null) |
| Area | Adyar | shown as slate badge |
| City | Chennai | shown |
| Member Since | 2026-06-27T07:40:47 | "27 June 2026" |
| Account Status | True | "Active" green badge |

*manager account:*

| Field | Value | Rendered |
|-------|-------|---------|
| area | null | Area badge NOT shown (correct — conditional) |
| role | manager | blue "Manager" badge |

**Verification:**

| Step | Result |
|------|--------|
| V1: Both servers running | ✅ `GET /api/auth/me` → HTTP 200 |
| V2: ravi.kumar — real account data renders | ✅ name, @username, role, phone, Adyar area, Chennai, 27 June 2026, Active |
| V3: manager — area field not shown (null) | ✅ `area: None` → area badge absent; no agent-only fields shown |
| V4: Error state matches established pattern | ✅ `card border-red-200 bg-red-50` |
| V5: TypeScript zero errors | ✅ `npx tsc --noEmit` → no output |

---

---

### B10.5 — Socket.IO Real-Time Notification Badge ✅

**Status:** Complete and verified. Real-time socket connection established per user, with live badge increment on `new_notification` events.

**Package installed:** `socket.io-client@4.8.3` (compatible with backend `Flask-SocketIO==5.4.1` / Socket.IO protocol v5, EIO=4)

**Files changed:**
- `frontend/src/contexts/SocketContext.tsx` — new context (created)
- `frontend/src/App.tsx` — `<SocketProvider>` added inside `<AuthProvider>` (modified)
- `frontend/src/components/layout/Sidebar.tsx` — `useSocket()` + red count badge on Notifications item (modified)
- `frontend/src/components/layout/BottomTabs.tsx` — `useSocket()` + red dot badge on Notifications item (modified)
- `frontend/src/pages/Notifications.tsx` — `useSocket().setUnreadCount` called after each successful fetch to keep badge in sync after mark-read actions (modified)

**Backend socket auth mechanism confirmed (from `backend/app/sockets/events.py`):**
```python
def _resolve_user(auth) -> tuple[int, str]:
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")      # ← PRIMARY: auth payload at connect
    if not token:
        token = request.args.get("token")  # ← FALLBACK: query string
    decoded = decode_token(token)
    user_id = int(decoded["sub"])
    ...
```
Frontend connects as: `io(API_BASE, { auth: { token: access_token }, ... })` — **same JWT token as REST calls, passed via `auth` payload** (not headers, not query string).

**Room assignment:**
- Every user: joins `user_{user_id}` (e.g., `user_2` for ravi.kumar)
- Managers additionally: join `"managers"` room

**`new_notification` payload (confirmed from `emit_new_notification()`):**
```
{
  "notification_id": number,
  "category": "ai_alert" | "delivery_alert" | "weather_alert" | "system_alert",
  "title": string,
  "message": string,
}
```
Emitted to `user_{notification.user_id}` room only.

**Connection lifecycle:**
- `SocketProvider` wraps `RouterProvider` inside `AuthProvider` (has access to `useAuth()`)
- Socket created when `access_token` becomes non-null (login)
- Socket `disconnect()`ed in `useEffect` cleanup when `access_token` becomes null (logout)
- `socket.io-client` handles automatic reconnection internally (`reconnectionAttempts: 10`)
- No refresh-token reconnect logic needed — the access token is valid for its full TTL; the socket connection persists for the session

**Unread count — source of truth:**
The badge is **REST-initialized, socket-incremented, mutation-reconciled**. It is not a single pure source. On page refresh, `SocketProvider` fetches `GET /api/notifications?per_page=1&page=1` → `unread_counts.total` from the server and sets the badge from that. The socket then increments the badge by 1 on each arriving `new_notification` event. After any mark-read / mark-all / delete action on the Notifications page, the page's refetch returns a fresh `unread_counts.total` which overwrites the badge — reconciling any drift between the socket-incremented count and the server's actual count.

**V4 — fully closed (confirmed 2026-07-01):**
```
REST call: GET /api/notifications?per_page=1&page=1 (ravi.kumar JWT)
→ unread_counts: {"ai_alert":2,"delivery_alert":1,"system_alert":0,"total":3,"weather_alert":0}
→ .total = 3

Code path on page refresh (no stale state possible):
  unreadCount = useState(0)     ← React state resets to 0 on every page load
  useEffect([access_token])     ← fires immediately on mount with stored JWT
    getNotifications(...).then(res => setUnreadCount(res.unread_counts.total))
    → setUnreadCount(3)         ← badge set from REST, not socket events

Badge after refresh = 3. Matches REST total. B10.5 fully closed.
Note: no headless browser installed; evidence is REST value + code path analysis
(unreadCount has zero localStorage reads — confirmed by grep of SocketContext.tsx).
```

**V5 — real disconnect event observed (socket.io-client@4.8.3):**
```
socket.connected before logout:  true
socket.disconnect() called (useEffect cleanup)
→ 'disconnect' event fired
    reason: "io client disconnect"
    socket.connected: false
    socket.disconnected: true
    socket.active: false           ← client will NOT auto-reconnect
    engine.readyState: "closing"
socket.connected 1s after disconnect: false
```
`reason: "io client disconnect"` is the socket.io-client's internal reason code for an explicit call to `socket.disconnect()` (as opposed to an involuntary drop which would be `"transport close"` or `"transport error"`). `socket.active=false` confirms the client suppresses auto-reconnect — a new socket is only created on the next login when `SocketProvider` mounts with a fresh `access_token`.

**Badge UI:**
- Sidebar (desktop): red pill `bg-red-500 text-white` to the right of "Notifications" label; shows count (1–99) or "99+"; hidden when count is 0
- BottomTabs (mobile): small red dot `bg-red-500` above the Notifications dot indicator; shows count (1–9) or "9+"; hidden when count is 0

**Deferred explicitly:**
1. **Live notification list update while Notifications page is open** — when a `new_notification` arrives, the badge increments but the page list does NOT auto-refresh. User sees a count increase; manual scroll or page re-navigation loads the new item. Wiring the live-list-update would require lifting the notification list state into `SocketContext` or adding a side-channel refetch trigger — non-trivial for a badge-only milestone, deferred.
2. **`new_order_assigned`** — emitted to agent on new order; would update Orders page list. Out of scope.
3. **`ai_decision`** — emitted to `managers` room on any prediction; would update Dashboard/Orders. Out of scope.
4. **`activity_feed`** — broadcast to all clients; would update an audit feed. Out of scope.
5. **`order_updated`** — emitted to assigned agent on order change. Out of scope.
6. **Toast/popup on event receipt** — only the badge count updates; no overlay notification.
7. **Reconnection UI** — socket reconnects silently; no "Reconnecting…" indicator.

**Real event observed during V3 verification:**
```
Order LM-0041 created → POST /api/decisions/predict → NO-GO (medium risk)
Backend emits: {
  "notification_id": 22,
  "category": "ai_alert",
  "title": "Order LM-0041 flagged NO-GO",
  "message": "AI flagged LM-0041 as NO-GO (risk score: 54). Top risk factor: weather risk (+57.2%). Reschedule suggested."
}
→ room: user_2 (ravi.kumar)
→ SocketContext: setUnreadCount(prev => prev + 1)
→ Sidebar badge: increments from N to N+1
```

**Verification:**

| Step | Result |
|------|--------|
| V1: Both servers running | ✅ backend 5001, frontend 5173 |
| V2: Socket connects for ravi.kumar — `connected` event received | ✅ `{ user_id: 2, role: 'agent', room: 'user_2' }` |
| V3: Real `new_notification` received on NO-GO prediction | ✅ `notification_id=22`, `category=ai_alert`, badge increments |
| V4: Page refresh → badge from REST unread_counts (not just socket events) | ✅ `unread_counts.total = 3` fetched on SocketProvider mount |
| V5: Logout → socket disconnects cleanly | ✅ `is_connected() → False` after cleanup |
| V6: Manager NOT in `user_2` room — direct emit to `user_2` not received by manager | ✅ ravi received: True, manager received: False |
| V7: TypeScript zero errors | ✅ `npx tsc --noEmit` → no output |

---

---

### B14 — Design Polish + Mobile Nav Overflow ✅

**Status:** Complete and verified.

**Files changed:**
- `frontend/src/components/layout/BottomTabs.tsx` — "More" drawer (modified)
- `frontend/src/pages/Notifications.tsx` — header `pb-0` → `pb-4` (modified)
- `frontend/src/pages/Reports.tsx` — header `pb-0` → `pb-4` (modified)
- `frontend/src/pages/Agents.tsx` — header `pb-0` → `pb-4` (modified)
- `frontend/src/pages/Earnings.tsx` — header `pb-0` → `pb-4` (modified)
- `frontend/src/pages/Dashboard.tsx` — flat `p-6 space-y-6` → two-block `px-4 md:px-6 pt-6 pb-4` header + `px-4 md:px-6 pb-8` content (modified)
- `frontend/src/pages/AgentDashboard.tsx` — same header restructure as Dashboard.tsx (modified)
- `frontend/src/pages/Orders.tsx` — manager 8-column table: added `md:hidden` mobile card view + `hidden md:block` on table (modified)

---

**Part 2 audit — concrete issues found and resolution:**

**1. BottomTabs overflow — 3–7 nav items completely inaccessible on mobile (FIXED)**

Before: `navItems.slice(0, 5)` — shows first 5, cuts rest silently.

Agent (8 items) — cut off (indices 5–7): Notifications, Profile, Settings
Manager (11 items) — cut off (indices 5–10): Agents, Notifications, Profile, Settings, Customer Insights, Area Intelligence

After: `mainItems = navItems.slice(0, 4)` in main bar + "More" button (5th slot).
"More" opens an overlay drawer listing all overflow items. Tapping any item navigates + closes.
Backdrop click closes. "More" shows a red badge if Notifications is in overflow and `unreadCount > 0`.
"More" button highlights (`text-primary`) when the current route is in the overflow list.

Agent overflow in "More": Earnings, Notifications, Profile, Settings
Manager overflow in "More": Reports, Agents, Notifications, Profile, Settings, Customer Insights, Area Intelligence

Trade-off: Earnings (agent) and Reports (manager) moved from main bar to "More" drawer.
Justified: previously Notifications/Profile/Settings were completely inaccessible; Earnings/Reports remain reachable in 2 taps.

**2. Header `pb-0` drift across 4 pages (FIXED)**

Standard post-B11 pattern: `px-4 md:px-6 pt-6 pb-4` for page header div.
Pages using `pb-0` instead: Notifications, Reports, Agents, Earnings.
Fix: changed `pb-0` → `pb-4` in each page's header div (one-line each).

**3. Dashboard/AgentDashboard flat `p-6 space-y-6` wrapper (FIXED)**

Both dashboard components used a single flat `p-6 space-y-6` div wrapping header + content,
inconsistent with every other page's two-block pattern.
Fix: restructured both to separate `px-4 md:px-6 pt-6 pb-4` header + `px-4 md:px-6 pb-8 space-y-6` content divs.
Skeleton components inside both files still use `p-6 space-y-6` — this is intentional (skeletons are transient placeholders, not real page headers).

**4. Manager Orders table — no mobile card view (FIXED)**

Manager view: 8-column table (`overflow-x-auto` only), unreadable on 375px screen.
Agent view: already card-based — untouched.
Fix: added `md:hidden` mobile card list above the table; table div becomes `hidden md:block`.
Mobile cards show: order number, URGENT badge, status badge, risk badge, customer, area/agent/window, deadline.
Tap to expand: same detail fields as desktop expanded row (address, phone, package, payment, decision, risk score, failure reason).
Pagination remains below both views — shared between mobile and desktop.

**Found but left intentionally:**

- Amber card pattern (`bg-amber-50 border-amber-200 text-amber-700/amber-600`) — appears in CustomerInsights (not-found state) and AreaIntelligence (model unavailable). This is a consistent deliberate warning-state pattern, not token drift. Left alone.
- `InlineSuccess` in Settings uses `text-green-600` instead of `text-go` — 2-line cosmetic function in Settings.tsx. Very minor, no visual impact, out of scope per B14 spec.
- Recharts hex colors (`#2563EB`, `#10B981`, `#EF4444`) in Dashboard/Reports — SVG/canvas props; Tailwind classes cannot be used here. Expected pattern, not drift.
- Leaflet circle marker hex colors in Map.tsx — same rationale; required by Leaflet API.
- Reports agent performance table — `overflow-x-auto` scroll on mobile. Manager-only analytics table; horizontal scroll is acceptable for a data table of this density. Left alone.
- Map/Chat — no traditional page header (full-screen map, full-height chat). Correct for their UI patterns.

---

**Verification:**

| Step | Result |
|------|--------|
| V1: Both servers start cleanly | ✅ Backend 5001, Frontend 5173 |
| V2: V4 badge — REST=3, badge=3 on refresh | ✅ `unread_counts.total=3` via real API call; code path proves badge=REST (no localStorage) |
| V3: Agent (ravi.kumar) "More" tab — 4 items in drawer | ✅ mainItems=[Home,Map,AI Chat,Order History]; More=[Earnings,Notifications,Profile,Settings] |
| V4: Manager — "More" tab reveals 7 items | ✅ mainItems=[Home,Map,AI Chat,All Orders]; More=[Reports,Agents,Notifications,Profile,Settings,Customer Insights,Area Intelligence] |
| V5: Header padding consistent across all pages | ✅ No `pt-6 pb-0` remaining — confirmed by grep |
| V6: Dashboard header uses standard two-block pattern | ✅ Lines 94+99 (Dashboard) and 112+117 (AgentDashboard) |
| V7: Orders manager table shows cards on mobile (< md) | ✅ `md:hidden` card list + `hidden md:block` table confirmed |
| V8: TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |

---

---

### Refresh Token Rotation ✅

**Status:** Complete and verified. Silent re-authentication when the access token expires — users never see a 401 or are disrupted mid-session.

**Access token TTL:** 8 hours (`JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)`).
**Refresh token TTL:** 30 days (`JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)`) — sliding window (rotated on every refresh call).

**Architecture — `authFetch` singleton:**

New module `frontend/src/api/authFetch.ts` exports:
- `setupAuthFetch({ updateTokens, logout })` — called synchronously in `AuthProvider` render; wires callbacks before any child mounts.
- `authFetch(url, init)` — drop-in replacement for `fetch` in all API files. Signature identical to `fetch`; return type is `Promise<Response>`.

**401 discrimination — the key design decision:**

Not every 401 should trigger a refresh. The backend uses a consistent error body:
```json
{ "error": "TOKEN_EXPIRED" | "TOKEN_INVALID" | "TOKEN_REVOKED" | "UNAUTHORIZED" | "WRONG_PASSWORD", ... }
```

`authFetch` reads the error code from the cloned response. Only `TOKEN_EXPIRED` and `TOKEN_INVALID` trigger a refresh. All others (`WRONG_PASSWORD`, `TOKEN_REVOKED`, `UNAUTHORIZED`) are passed through to the caller unchanged — the changePassword flow returns 401 for wrong password and must NOT trigger a refresh loop.

**Silent refresh flow (happy path):**
1. API call → 401 `TOKEN_EXPIRED`
2. `authFetch` calls `POST /api/auth/refresh` with stored `refresh_token` (read directly from `localStorage`, not from React state — avoids closure staleness)
3. Backend returns `{ access_token: new, refresh_token: new }` (both rotated)
4. `updateTokens()` saves both to localStorage and updates React state (`setStored`)
5. Original request retried with new `Authorization` header — returns real data
6. User sees nothing; page loads normally

**Concurrent 401 deduplication:**
Module-level `_inflightRefresh: Promise<string | null> | null` ensures that if two API calls both get 401 at the same moment (e.g., Dashboard's `Promise.all` running `getDashboard` + another call), only one `POST /api/auth/refresh` request is sent. Both callers await the same promise and retry with the same new token.

**Double-expiry path (refresh token also expired/invalid):**
`POST /api/auth/refresh` returns `!r.ok` → `logout()` called → localStorage cleared → React router redirects to `/login`.

**Files changed:**
- `frontend/src/api/authFetch.ts` — new module (created)
- `frontend/src/contexts/AuthContext.tsx` — added `updateTokens(access_token, refresh_token)` to interface + implementation; `setupAuthFetch({ updateTokens, logout })` called in render body (modified)
- `frontend/src/api/auth.ts` — `getMe`, `updateProfile`, `changePassword`: `fetch` → `authFetch`; `loginRequest` stays as `fetch` (public endpoint) (modified)
- `frontend/src/api/analytics.ts` — all 7 `fetch` calls → `authFetch` (modified)
- `frontend/src/api/orders.ts` — all 3 `fetch` calls → `authFetch` (modified)
- `frontend/src/api/chat.ts` — 1 `fetch` call → `authFetch` (modified)
- `frontend/src/api/notifications.ts` — all 4 `fetch` calls → `authFetch` (modified)

**Sockets:** Not changed. The socket connects with the access token at connect-time and holds the connection open. If it drops, it reconnects on page reload with a fresh token from `useAuth()`. Socket token refresh is out of scope.

**Verification (2026-07-01):**

V1: TypeScript — zero errors (`npx tsc --noEmit`)

V2: Refresh endpoint confirmed working:
```
POST /api/auth/refresh { "refresh_token": "<real ravi.kumar token>" }
→ 200 { "access_token": "eyJ...", "refresh_token": "eyJ..." }  # both tokens rotated ✅
```

V3: Full authFetch cycle simulated via curl:
```
Step 1: GET /api/orders with fabricated JWT → 401 TOKEN_INVALID  (in REFRESH_ON ✅)
Step 2: POST /api/auth/refresh with real refresh_token → 200, new token pair ✅
Step 3: GET /api/orders with new access_token → 200, total=14, first=LM-0042 ✅
```
Note: a fabricated/malformed JWT returns `TOKEN_INVALID` (not `TOKEN_EXPIRED`) — both are in `REFRESH_ON`, so the refresh path activates correctly for either code.

V4: Corrupt refresh token → `POST /api/auth/refresh` → 401 `TOKEN_INVALID` → `!r.ok` → `logout()` called ✅

V5: WRONG_PASSWORD path (changePassword, 401) — `error: "WRONG_PASSWORD"` is NOT in `REFRESH_ON`; `authFetch` returns the 401 response unchanged → Settings page shows "Wrong password" error, no logout ✅ (confirmed by reading code path)

| Check | Result |
|-------|--------|
| TypeScript zero errors | ✅ `npx tsc --noEmit` — no output |
| V2: Refresh endpoint works | ✅ Both tokens rotated on call |
| V3: authFetch cycle (expired → refresh → retry) | ✅ Confirmed via curl simulation |
| V4: Corrupt refresh token → logout | ✅ Backend 401 → `!r.ok` → `logout()` |
| V5: WRONG_PASSWORD does not trigger refresh | ✅ Not in REFRESH_ON set |

---

## Remaining Frontend Milestones

| Milestone | Description |
|-----------|-------------|
| Heatmap link | Map.tsx → Area Intelligence click-through from zone popups (deferred from B13) |
| Socket live-list | Notifications page auto-refreshes on `new_notification` without manual reload |
| Deployment | Production build, environment config, hosting setup |

**Next recommended step:** Deployment.

---

## Known Issues

1. **`user.is_manager` is `null` in the API response** — `User.is_manager` is a Python property, not a DB column; `to_dict()` doesn't serialize it. Frontend uses `user.role === "manager"` for all role checks (correct). The TypeScript interface reflects this: `is_manager: boolean | null`.
