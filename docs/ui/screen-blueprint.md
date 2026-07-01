# LastMeter AI — Frontend Screen Blueprint

> UI/UX specification for every page in the app.
> Source of truth for component structure, API wiring, and interaction design.
> No React code — layout and behaviour only.

---

## 0. Design System & Shared Patterns

### 0.1 Design Tokens

```
Background:   #F8FAFC  (app shell, page backgrounds)
Surface:      #FFFFFF  (cards, modals, dropdowns)
Border:       #E2E8F0  (card borders, dividers — thin, 1px)
Text Primary: #1E293B  (headings, primary labels)
Text Muted:   #64748B  (secondary labels, placeholders)

Blue 600:     #2563EB  (primary CTAs, active nav items, links)
Blue 500:     #3B82F6  (hover states, secondary blue elements)
Blue 50:      #EFF6FF  (blue tinted backgrounds, active chip)

GO green:     #10B981  (GO badge, delivered status, positive trend)
NO-GO red:    #EF4444  (NO-GO badge, failed status, negative trend)
Urgent amber: #F59E0B  (urgent flag, warning badges)

Risk LOW:     #10B981  (same as GO green)
Risk MEDIUM:  #F59E0B  (amber)
Risk HIGH:    #EF4444  (same as NO-GO red)

Shadow:       box-shadow: 0 1px 3px rgba(0,0,0,0.06)  (Stripe-style minimal)
Radius:       8px cards, 6px inputs, 4px badges
Font:         Inter (all weights: 400, 500, 600, 700)
```

### 0.2 Navigation Structure

**Desktop (≥ 1024px):** Fixed left sidebar, 240px wide.

```
┌──────────────────────────────────────────────────────┐
│ SIDEBAR (240px)  │  MAIN CONTENT (flex-grow)         │
│                  │                                    │
│  [Logo]          │  [TopBar: title + user menu]       │
│                  │                                    │
│  Nav items       │  Page content                      │
│                  │                                    │
│  [User avatar    │                                    │
│   + name]        │                                    │
└──────────────────────────────────────────────────────┘
```

**Mobile (< 1024px):** Bottom tab bar, 5 primary tabs visible. Sidebar collapses to hamburger → slide-in drawer.

```
┌────────────────────────┐
│  [TopBar: hamburger    │
│   + page title]        │
│                        │
│  Page content          │
│                        │
│                        │
├────────────────────────┤
│ [Home][Map][Orders]    │
│       [Chat][More...]  │
└────────────────────────┘
```

**Manager Sidebar Nav Items:**
1. Dashboard (home icon)
2. Map (map-pin icon)
3. Analytics (bar-chart icon)
4. Orders (package icon)
5. Agents (users icon)
6. AI Chat (message-circle icon) — unread alert dot
7. Notifications (bell icon) — unread count badge
8. Settings (gear icon) — bottom of sidebar

**Agent Sidebar / Bottom Nav Items:**
1. Dashboard (home icon)
2. Map (map-pin icon)
3. Orders (package icon)
4. Earnings (indian-rupee icon)
5. AI Chat (message-circle icon)
6. Notifications (bell icon) — badge
7. Settings (gear icon)

### 0.3 Global Shared Components

| Component | Description |
|---|---|
| `AppShell` | Sidebar + TopBar + page content wrapper |
| `TopBar` | Page title, global search (future), notification bell, user avatar dropdown |
| `Sidebar` | Logo, nav links, active state, user card at bottom |
| `BottomNav` | Mobile-only, 5-6 icon+label tabs |
| `RiskBadge` | Pill badge: LOW (green) / MEDIUM (amber) / HIGH (red) |
| `DecisionBadge` | Pill badge: GO (green) / NO-GO (red) / URGENT (amber outline) |
| `StatusBadge` | Pill badge for order status (5 variants) |
| `MetricCard` | KPI card: icon, label, large number, optional trend arrow |
| `Toast` | Slide-in success/error/info notification (top-right, auto-dismiss 4s) |
| `Modal` | Centred overlay: header, scrollable body, footer actions |
| `ConfirmModal` | Lightweight destructive-action confirmation (2 buttons only) |
| `LoadingSpinner` | Centered blue spinner |
| `SkeletonCard` | Animated grey rectangle placeholder matching card shape |
| `EmptyState` | Centered: icon + heading + subtext + optional CTA button |
| `ErrorBanner` | Full-width red banner with retry button |
| `SHAPBreakdown` | Horizontal stacked bar showing factor contributions with ≥5% threshold |
| `OrderCard` | Compact order summary: number, customer, area, status + decision badges |
| `ActivityFeedItem` | Icon + description + relative time — for audit feed |

### 0.4 Global Loading Pattern

Every data-fetching section shows **skeleton loaders** matching the shape of the expected content:
- Card → `SkeletonCard` (same height/width as real card)
- Table → 5 rows of shimmer lines
- Chart → empty grey rectangle of chart height
- Map → spinner centered on dark tile background

Skeletons display for max 8s. If data hasn't arrived, replace with `ErrorBanner`.

### 0.5 Global Empty State Template

```
┌─────────────────────────────┐
│                             │
│        [Icon 48px]          │
│   Heading (text-lg 600)     │
│   Subtext (text-sm muted)   │
│                             │
│   [Optional CTA Button]     │
│                             │
└─────────────────────────────┘
```

### 0.6 Global Error State Template

```
┌─────────────────────────────────────────────────────────┐
│ ⚠  Failed to load [resource name].    [Try again]      │
└─────────────────────────────────────────────────────────┘
```
Full-page errors (e.g. 401 session expiry) redirect to Login with a toast message.

---

## 1. Auth — Login Page

### Layout

Split screen, two equal columns on desktop. Single column on mobile (illustration hidden).

```
┌───────────────────────────┬───────────────────────────┐
│  LEFT — FORM PANEL        │  RIGHT — MAP ILLUSTRATION │
│  (white background)       │  (dark map tiles,         │
│                           │   animated route line,    │
│  [LastMeter AI Logo]      │   3 blinking order pins)  │
│  [Tagline: "The           │                           │
│   smartest delivery..."]  │   [Floating card overlay] │
│                           │   "Active: 5 agents       │
│  Username input           │    94% success rate       │
│  Password input           │    Chennai operations"    │
│                           │                           │
│  [Sign In] button         │                           │
│  (full width, blue)       │                           │
│                           │                           │
│  Forgot password? (link)  │                           │
└───────────────────────────┴───────────────────────────┘
```

### Components
- `Input` (username, password with show/hide toggle)
- `Button` (primary, full-width, loading state with spinner)
- Leaflet mini-map (right panel) — non-interactive, animated
- Floating stats card overlay on map panel

### API Calls
- `POST /api/auth/login` on form submit
- `GET /api/auth/me` on app load to restore session

### User Interactions
- Enter key submits form
- Show/hide password toggle on password field
- On success: redirect to `/manager/dashboard` or `/agent/dashboard` based on role
- "Forgot password?" — display toast: "Contact your manager to reset your password" (no self-service reset flow)

### Mobile Behavior
- Full-width single column
- Map illustration hidden
- Logo + tagline at top, form below
- Keyboard pushes viewport up (no content obscured)

### Loading States
- Sign In button shows inline spinner while POST /api/auth/login is pending
- Button text changes to "Signing in…" and is disabled

### Empty States
- N/A (no content to be empty)

### Error States
- Inline error text below password field: "Invalid username or password"
- Account disabled: "Your account has been deactivated. Contact your manager."
- Network error: toast "Unable to connect. Check your internet connection."

---

## 2. Manager — Dashboard

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "Dashboard — 24 Jun 2026"          [bell][av] │
│         ├─────────────────────────────────────────────────────  │
│         │ ── METRIC CARDS ROW (6 cards, 3-col desktop) ──────  │
│         │  [Total Orders] [Completed] [High Risk]               │
│         │  [Revenue]      [Savings]   [Active Agents]           │
│         ├─────────────────────────────────────────────────────  │
│         │ ── TWO-COLUMN CONTENT AREA ─────────────────────────  │
│         │                                                        │
│         │  LEFT (2/3 width)            RIGHT (1/3 width)         │
│         │  ┌──────────────────────┐   ┌────────────────────┐   │
│         │  │ Success Rate Chart   │   │  AI Operations     │   │
│         │  │ (7-day line)         │   │  Center            │   │
│         │  └──────────────────────┘   │  [⚠ Alert 1]       │   │
│         │  ┌──────────────────────┐   │  [⚠ Alert 2]       │   │
│         │  │ Failure Rate by Area │   │  [💡 Rec. 1]       │   │
│         │  │ (horizontal bars)    │   │  [💡 Rec. 2]       │   │
│         │  └──────────────────────┘   └────────────────────┘   │
│         │  ┌──────────────────────┐   ┌────────────────────┐   │
│         │  │ Revenue by Day       │   │  Activity Feed     │   │
│         │  │ (area chart)         │   │  [item][item]...   │   │
│         │  └──────────────────────┘   └────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Components

**Metric Cards (6):**
- Each card: icon (colored), label, large number, small trend indicator (↑/↓ vs yesterday)
- Card 1 — Total Orders Today: package icon, blue
- Card 2 — Deliveries Completed: check-circle icon, green
- Card 3 — High Risk Orders: alert-triangle icon, red — clicking navigates to Orders filtered to risk=high
- Card 4 — Revenue Today: ₹ icon, blue
- Card 5 — Estimated Savings: trending-up icon, green
- Card 6 — Active Agents: users icon, blue

**Charts:**
- Success Rate Over Time → Recharts `LineChart` with single line, 7-day x-axis, percentage y-axis, blue line, dot on each point, tooltip on hover
- Failure Rate by Area → Recharts `BarChart` horizontal, 5 bars (one per area), color gradient low=green/high=red based on rate value
- Revenue by Day → Recharts `AreaChart`, 7-day x-axis, ₹ y-axis, blue fill with gradient opacity

**AI Operations Center panel:**
- Card with header "AI Operations Center" and "Refresh" icon button
- Alert items: icon (⚠️ amber) + title + detail text, 1px bottom border between items
- Recommendation items: icon (💡 blue) + title + detail + "Accept" button (small, blue outline) on same row
- Accepting a recommendation shows inline confirmation: "Reassigning 3 orders…" then success checkmark
- "View all" link at bottom → AI Chat page

**Activity Feed panel:**
- Card with header "Activity Feed" and "View all" link
- Each item: small action icon (colored by entity type) + description text + relative time (right-aligned, muted)
- Max 8 items visible, "View all" opens full audit log
- New items slide in from top via Socket.IO `activity_feed` event (smooth CSS animation)

### API Calls
- `GET /api/analytics/dashboard` — metric cards + chart data
- `GET /api/ai-ops/alerts` — AI Operations Center alerts
- `GET /api/ai-ops/recommendations` — recommendations
- `GET /api/audit/feed?limit=8` — activity feed
- `POST /api/ai-ops/recommendations/:id/accept` — on Accept button click

### Charts Used
- Recharts `LineChart` — Success Rate Over Time
- Recharts `BarChart` (horizontal) — Failure Rate by Area
- Recharts `AreaChart` — Revenue by Day

### User Interactions
- Metric card "High Risk Orders" → links to Orders page pre-filtered by risk_level=high
- Metric card "Active Agents" → links to Agent Management page
- Accept recommendation → POST to `/api/ai-ops/recommendations/:id/accept` → update UI inline → show success toast → emit Socket.IO to affected agents
- Activity Feed "View all" → navigate to Audit Logs page (Phase 2)
- AI Operations "View all" → navigate to AI Chat page
- Socket.IO: `activity_feed` events append items to feed in real-time

### Mobile Behavior
- Metric cards: 2×3 grid (2 columns, 3 rows)
- Charts stack vertically, full-width
- AI Operations Center and Activity Feed stack below charts
- Bottom nav tabs replace sidebar

### Loading States
- 6 `SkeletonCard` placeholders for metric cards
- 3 grey rectangle skeletons (chart shapes) for charts
- 4 grey line skeletons for activity feed items
- AI Operations panel: 3 shimmer rows

### Empty States
- Activity Feed: "No activity yet. Orders and AI decisions will appear here." (calendar icon)
- AI Operations: "No alerts right now. All systems normal." (check-circle icon, green)

### Error States
- Chart section: "Failed to load dashboard data." + retry button
- AI Operations: "Unable to fetch alerts." + retry (non-blocking — rest of page loads)

---

## 3. Manager — Map (Command Center)

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ SIDEBAR │  [FULL-HEIGHT DARK LEAFLET MAP]                       │
│         │                                                        │
│         │  ┌──── Layer Controls (top-right) ────┐              │
│         │  │ ☑ Agent locations                  │              │
│         │  │ ☑ Order pins (risk-colored)        │              │
│         │  │ ☑ Route lines                      │              │
│         │  │ ☐ Heatmap overlay                  │              │
│         │  │ ☐ Weather layer                    │              │
│         │  └────────────────────────────────────┘              │
│         │                                                        │
│         │  [ORDER PIN — popup on click]                         │
│         │  ┌────────────────────────────┐                       │
│         │  │ LM-0001  ● HIGH RISK       │                       │
│         │  │ Anitha Suresh · Adyar      │                       │
│         │  │ NO-GO — Weather Risk +35%  │                       │
│         │  │ [View Order] [Reassign]    │                       │
│         │  └────────────────────────────┘                       │
│         │                                                        │
│         │  ┌──── Area Selector (top-left) ───┐                  │
│         │  │ All Areas ▾                     │                  │
│         │  └─────────────────────────────────┘                  │
│         │                                                        │
│         │  ┌──── Bottom Drawer (collapsible) ────────────┐      │
│         │  │ Orders in view (12)         [Sort ▾]        │      │
│         │  │ [OrderCard][OrderCard][OrderCard]...        │      │
│         │  └─────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### Components

**Map layer: Leaflet**
- Tile: OpenStreetMap dark tiles (CartoDB Dark Matter) — Uber-at-night style
- Map fills 100% height of content area (sidebar excluded)

**Order Pins:**
- Circle marker, radius 12px
- Color = risk level: green (low) / amber (medium) / red (high)
- Urgent orders: amber pulsing ring animation around pin
- Cluster pins when zoomed out (Leaflet.markercluster or manual)

**Agent Dots (layer toggle):**
- Animated dot with agent's initials or avatar letter
- Arrow indicator showing heading direction
- Online = blue glow; offline = grey
- Real-time position updates via Socket.IO `agent_location` event (smooth CSS transition between positions)

**Route Lines (layer toggle):**
- Polyline per active agent, color-coded by agent
- Animated "dash-flow" effect showing direction of travel
- Source: OSRM road routing between agent → next delivery → remaining stops

**Heatmap Layer (layer toggle):**
- Leaflet.heat circles per area centroid
- Intensity = area failure rate from `GET /api/analytics/heatmap`
- Red (high failure) → yellow (medium) → green (low)
- Time slot filter strip above map: [All] [Morning] [Afternoon] [Evening] — updates heatmap colors live

**Weather Layer (layer toggle):**
- OpenWeatherMap tile overlay (precipitation / cloud layer)
- Semi-transparent at 60% opacity over map

**Pin Popup:**
- Order number + risk badge
- Customer name + area
- Decision (GO/NO-GO) + top SHAP factor
- "View Order" button → navigates to Order Detail page
- "Reassign" button → inline agent dropdown to reassign (Manager only)

**Bottom Drawer:**
- Drag handle at top (mobile swipe up/down)
- Horizontal scroll of `OrderCard` components visible in current map bounds
- Clicking a card: pan + zoom map to that pin, open popup

**Layer Controls (Leaflet built-in control, custom styled):**
- Checkbox list in white card, top-right corner
- Each toggle shows/hides a Leaflet layer group

**Area Selector (top-left):**
- Dropdown: All Areas / Anna Nagar / T Nagar / Velachery / Adyar / Porur
- Selecting an area: pan+zoom map to that area centroid, filter order pins to that area

### API Calls
- `GET /api/orders?status=pending,in_transit&per_page=100` — all active order pins
- `GET /api/agents` — agent dot positions + online status
- `GET /api/analytics/heatmap` — heatmap intensity data
- `GET /api/analytics/heatmap?time_slot=morning` — on time slot filter click
- `GET /api/weather/current?area=Adyar` — weather layer data (per area on demand)
- `POST /api/orders/:id` (reassign via popup Reassign button)
- Socket.IO: `agent_location` events for live dot movement
- Socket.IO: `order_updated` events to update pin color/status in real time

### Charts Used
- None (map is the primary visualization)
- Heatmap circles are rendered directly on the Leaflet canvas

### User Interactions
- Click pin → popup appears
- Drag map → pins follow, bottom drawer orders update to visible bounds
- Zoom in/out → pins scale, clusters break/form
- Toggle layer checkbox → show/hide layer with fade transition
- Time slot filter strip → re-fetch heatmap data, overlay updates
- Area selector → pan to area, filter pins
- Click agent dot → small popup: agent name, current order, online status, earnings today
- Bottom drawer order card click → pan to pin, open popup
- "Reassign" in popup → inline dropdown of available agents for that area → confirm → POST update

### Mobile Behavior
- Map fills full screen (sidebar hidden, replaced by bottom nav)
- Bottom drawer default collapsed to handle only (peek = 64px)
- Swipe up drawer to show order list
- Layer controls hidden by default → accessible via hamburger menu overlay
- Pin popups: bottom sheet that slides up (not floating popup)

### Loading States
- Map tiles load progressively (Leaflet native)
- Pins: grey placeholder circles while order data loads
- Agent dots: grey dots while agent data loads
- Layer control: skeleton rows while loading

### Empty States
- No active orders in view: "No active orders in this area." shown in bottom drawer
- All agents offline: grey dots remain, tooltip says "Offline"

### Error States
- Weather layer unavailable: toggle disabled with tooltip "Weather data temporarily unavailable"
- Agent locations unavailable: toast "Live agent tracking offline"
- Order data fail: error banner above bottom drawer

---

## 4. Manager — Analytics (KPI Analytics)

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "KPI Analytics"                                │
│         ├──────────────────────────────────────────────────────  │
│         │ FILTER BAR: [Today] [This Week ✓] [This Month] [All]  │
│         ├──────────────────────────────────────────────────────  │
│         │ ── SUMMARY CARDS ROW (4 cards) ─────────────────────  │
│         │ [Avg Delivery Time] [Failed %] [Total Orders] [Earned] │
│         ├──────────────────────────────────────────────────────  │
│         │ ── TWO-COLUMN SECTION ──────────────────────────────  │
│         │  LEFT (3/5)                      RIGHT (2/5)           │
│         │  ┌────────────────────────────┐  ┌──────────────────┐ │
│         │  │ Agent Performance Table    │  │ Risk Distribution│ │
│         │  │ Rank / Name / Rate / Score │  │ (donut chart)    │ │
│         │  └────────────────────────────┘  └──────────────────┘ │
│         ├──────────────────────────────────────────────────────  │
│         │ ── AREA PERFORMANCE ────────────────────────────────  │
│         │ ┌────────────────────────────────────────────────────┐ │
│         │ │ Area Performance (grouped bar: success vs failure) │ │
│         │ └────────────────────────────────────────────────────┘ │
│         ├──────────────────────────────────────────────────────  │
│         │ ── WEATHER IMPACT ──────────────────────────────────  │
│         │ ┌──────────────────────────┐ ┌──────────────────────┐ │
│         │ │ Success Rate by Weather  │ │ Summary: Clear=91%   │ │
│         │ │ (scatter / line chart)   │ │ Light Rain=75%       │ │
│         │ │                          │ │ Heavy Rain=49%       │ │
│         │ └──────────────────────────┘ └──────────────────────┘ │
│         ├──────────────────────────────────────────────────────  │
│         │ ── COST SAVINGS SECTION ────────────────────────────  │
│         │ [Deliveries Avoided] [Fuel Saved] [Cost Avoided]       │
│         │ [Success Rate Before AI] → [After AI] progress bars   │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Filter Bar:**
- Segmented button group: Today / This Week (active) / This Month — single select
- On selection: re-fetch all analytics data, charts animate to new values

**Summary Cards:**
- 4 MetricCard components in a row
- Avg Delivery Time (clock icon, minutes)
- Failed Delivery % (x-circle icon, red tinted if > 15%)
- Total Orders (package icon)
- Total Earned (₹ icon)

**Agent Performance Table:**
- Columns: Rank (#), Agent Name, Area, Orders, Delivered, Success Rate (%), Performance Score, Avg Time
- Sortable by each column header (click to sort)
- Agent Leaderboard medal icons for rank 1/2/3 (🥇🥈🥉 — or custom colored badges)
- Row hover: blue-tinted background
- "View Agent" link on each row → navigates to Agent Management page filtered to that agent

**Risk Distribution Donut Chart:**
- Recharts `PieChart` (donut variant)
- 3 segments: LOW (green), MEDIUM (amber), HIGH (red)
- Center label: total orders count
- Legend below chart with counts per segment

**Area Performance Grouped Bar Chart:**
- Recharts `BarChart` with 2 bars per area: success (green) and failure (red)
- X-axis: 5 areas; Y-axis: count or percentage toggle
- Tooltip on hover showing exact values
- Click on an area bar → navigates to Area Intelligence page for that area

**Weather Impact Chart:**
- Recharts `LineChart` with date x-axis, success rate y-axis
- Three series: Clear (green line), Light Rain (amber), Heavy Rain (red)
- Summary stat cards next to chart (no additional API call needed — same data)

**Cost Savings Section:**
- 3 MetricCard components in a row: Deliveries Avoided, Fuel Saved (₹ and litres), Cost Avoided (₹)
- Two progress bars: "Before AI (73%)" and "After AI (89%)" — labeled horizontal bars

### API Calls
- `GET /api/analytics/kpi?period=week` — summary cards + agent table + area performance
- `GET /api/analytics/cost-savings?period=week` — savings section
- `GET /api/analytics/weather-impact?period=week` — weather impact chart

### Charts Used
- Recharts `PieChart` (donut) — Risk Distribution
- Recharts `BarChart` — Area Performance
- Recharts `LineChart` — Weather Impact Over Time

### User Interactions
- Period filter → re-fetch all API calls with new period param, charts animate
- Agent table column header click → sort ascending/descending
- Agent table row click → open agent detail or navigate to Agent Management
- Area bar chart click → navigate to Area Intelligence for that area
- Tooltip on all charts on hover

### Mobile Behavior
- 4 summary cards: 2×2 grid
- Agent table: horizontal scroll or card-per-agent stacked layout
- Charts: full-width, vertical stack
- Cost savings section: stacked cards

### Loading States
- 4 skeleton cards for summary
- Table: 5 skeleton rows
- Charts: 3 grey rectangle skeletons

### Empty States
- Agent table empty: "No delivery data yet for this period." (bar-chart icon)
- If only 1 agent: show agent table still (not empty state)

### Error States
- Failed to load KPI data: error banner, retry button, rest of page hidden

---

## 5. Manager — All Orders

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "All Orders"               [+ New Order]       │
│         ├──────────────────────────────────────────────────────  │
│         │ SEARCH & FILTER BAR                                    │
│         │ [🔍 Search order# or customer...]                      │
│         │ [Area ▾] [Agent ▾] [Status ▾] [Risk ▾] [Date ▾]      │
│         │ [Clear filters] if any active                          │
│         ├──────────────────────────────────────────────────────  │
│         │ RESULTS HEADER                                         │
│         │ "30 orders"  [Sort: Created ▾]  [Export CSV]          │
│         ├──────────────────────────────────────────────────────  │
│         │ ── DATA TABLE ─────────────────────────────────────   │
│         │ ┌──┬────────┬──────────┬────────┬────────┬──────────┐ │
│         │ │☐ │Order # │Customer  │Area    │Status  │Risk      │ │
│         │ │  │Agent   │Package   │Window  │Payment │Deadline  │ │
│         │ ├──┼────────┼──────────┼────────┼────────┼──────────┤ │
│         │ │☐ │LM-0001 │Anitha S  │Adyar   │PENDING │● LOW     │ │
│         │ │  │        │          │        │₹350    │26 Jun    │ │
│         │ │  │ ▶ Expand: SHAP breakdown + reschedule          │ │
│         │ ├──┼────────┼──────────┼────────┼────────┼──────────┤ │
│         │ │☐ │LM-0002 │Babu K    │Adyar   │TRANSIT │● HIGH    │ │
│         │ └──┴────────┴──────────┴────────┴────────┴──────────┘ │
│         │                                                        │
│         │ PAGINATION: [← Prev] [1] [2] ... [Next →]            │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Search Bar:**
- Full-width text input with search icon left, clear (×) button right when text present
- Searches `order_number` and `customer_name` simultaneously (debounced 300ms)

**Filter Chips:**
- Dropdown pill buttons: Area / Agent / Status / Risk Level / Date Range
- Active filter = blue pill with filled background + × to clear
- "Clear all filters" text link appears when any filter is active

**Data Table:**
- Checkbox column for multi-select (bulk actions)
- Columns: Order # (link to detail), Customer Name, Area, Agent Name, Status badge, Risk badge, Package size, Time Window, Payment (₹), Deadline (date + urgent tag if today)
- All columns sortable (click header, sort icon toggles asc/desc)
- "GO/NO-GO" badge in a separate micro-column (colored)
- Row expand (click ▶ chevron) → reveals SHAP breakdown card inline + reschedule suggestion if NO-GO
- Row context menu (…) → Edit / Delete / Reassign / Predict (re-run GO/NO-GO)

**Row Expand Panel (SHAP Breakdown):**
- Inline `SHAPBreakdown` component: horizontal bar per factor, signed % labels
- "Reschedule suggested: 26 Jun, Afternoon (83% success)" card — only if NO-GO
- "Re-run prediction" text button

**Bulk Actions Bar (appears when rows selected):**
- Slides down from filter bar
- "[N] orders selected" + [Reassign Agent ▾] [Export] [Delete] buttons

**New Order Button:**
- Fixed top-right: "+ New Order" blue button → opens `NewOrderModal`

**New Order Modal:**
- Multi-step: Step 1 = Customer details; Step 2 = Delivery details; Step 3 = Preview + GO/NO-GO result
- Step 3: After POST /api/orders, the decision is shown immediately in the modal before closing
- "Create Order" → shows inline result: GO (green) or NO-GO (red) with SHAP factors

### API Calls
- `GET /api/orders?page=1&per_page=20&{filters}&sort_by=created_at&sort_dir=desc` — table data
- `POST /api/orders` — new order creation
- `PUT /api/orders/:id` — edit order (from row context menu)
- `DELETE /api/orders/:id` — delete (from row context menu)
- `POST /api/decisions/predict` — re-run prediction (from row context menu)

### Charts Used
- None on this page (SHAP Breakdown is a table/bar component, not a Recharts chart)

### User Interactions
- Search: debounced 300ms → refetches table
- Filter change → immediate refetch
- Column header click → sort toggle
- Row checkbox → bulk select → bulk actions bar appears
- Row expand chevron → toggle inline SHAP panel
- Row (…) menu → Edit (opens edit modal) / Delete (opens confirm modal) / Reassign (inline agent dropdown) / Re-predict
- "View" link in Order# cell → navigate to Order Detail page
- "+ New Order" → open 3-step modal
- Pagination: previous/next + page number buttons

### Mobile Behavior
- Table collapses to card list: one `OrderCard` per order
- Each card shows: order#, customer, area, status badge, risk badge, payment
- Tap card → navigate to Order Detail (no row expand on mobile)
- Filter bar: single "Filter" button → opens bottom sheet with all filter controls
- "+ New Order": floating action button (FAB), blue, bottom-right, fixed

### Loading States
- Table: 5 skeleton rows (grey shimmer lines per column)
- Filter bar: enabled immediately (no skeleton needed)

### Empty States
- No orders found: "No orders match your filters." (search icon) + "Clear filters" link
- No orders at all: "No orders yet. Create your first order to get started." + "+ New Order" button

### Error States
- Table load fail: "Failed to load orders." inline in table body + retry button

---

## 6. Manager — Agent Management

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "Agent Management"         [+ Add Agent]       │
│         ├──────────────────────────────────────────────────────  │
│         │ LEADERBOARD STRIP (horizontal scroll, 5 rank cards)    │
│         │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│         │ │ 🥇 1 │ │ 🥈 2 │ │ 🥉 3 │ │  4   │ │  5   │        │
│         │ │Ravi  │ │Karthi│ │Surya │ │Priya │ │Deepa │        │
│         │ │96%   │ │93%   │ │88%   │ │85%   │ │82%   │        │
│         │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
│         ├──────────────────────────────────────────────────────  │
│         │ FILTER: [Area ▾] [Status ▾]   [🔍 Search name...]    │
│         ├──────────────────────────────────────────────────────  │
│         │ AGENT CARDS GRID (3-col desktop, 2-col tablet)        │
│         │ ┌──────────────────────┐ ┌──────────────────────┐    │
│         │ │ [Avatar] Ravi Kumar  │ │ [Avatar] Karthik Raj │    │
│         │ │ ● Online  · Adyar    │ │ ● Online  · T Nagar  │    │
│         │ │ Today: 4 orders      │ │ Today: 3 orders      │    │
│         │ │ Success: 96%         │ │ Success: 93%         │    │
│         │ │ Earnings: ₹530       │ │ Earnings: ₹380       │    │
│         │ │ [View] [Edit]        │ │ [View] [Edit]        │    │
│         │ └──────────────────────┘ └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Leaderboard Strip:**
- Horizontal scrollable row of 5 rank cards
- Each card: rank badge (medal icon for 1/2/3), avatar circle with initials, name, success rate
- Active/today period toggle above strip (Today / Week / All)

**Agent Cards:**
- Avatar circle (initials, colored by area)
- Online status dot (green = online, grey = offline) with label
- Area pill badge
- Today stats: orders count, delivered count
- Success rate with color-coded indicator
- Total today earnings (₹)
- "View" button → navigates to agent detail drawer or separate page
- "Edit" button → opens edit modal

**Agent Detail Drawer (slide-in from right):**
- Header: avatar + name + area + online status
- Performance tab: success rate bar, orders by status donut, earnings summary
- Orders tab: mini OrderCard list for this agent
- Location tab: mini map with agent's current pin

**Add/Edit Agent Modal:**
- Fields: Name, Username, Password (add only), Phone, Area (select one of 5)
- Validation inline
- Submit → POST /api/agents or PUT /api/agents/:id

**Deactivate Confirmation:**
- Triggered from "Deactivate" option in edit modal
- ConfirmModal: "Deactivate Ravi Kumar? Their existing orders will remain assigned."

### API Calls
- `GET /api/agents` — agent cards grid
- `GET /api/agents/leaderboard?period=week` — leaderboard strip
- `GET /api/agents/:id` — agent detail drawer
- `GET /api/agents/:id/earnings?period=week` — earnings in detail drawer
- `POST /api/agents` — add agent
- `PUT /api/agents/:id` — edit agent
- `DELETE /api/agents/:id` — deactivate

### Charts Used
- Recharts `PieChart` (donut) inside agent detail drawer — orders by status (pending/delivered/failed/postponed)
- Recharts `BarChart` inside agent detail drawer — earnings by day

### User Interactions
- Leaderboard period toggle → re-fetch leaderboard
- Agent card "View" → open detail drawer from right
- Agent card "Edit" → open edit modal
- Detail drawer tabs: Performance / Orders / Location
- Add Agent button → add modal
- Within edit modal: "Deactivate Agent" danger button → confirm modal → DELETE

### Mobile Behavior
- Leaderboard strip: horizontal scroll (touch-friendly)
- Agent cards: 1-column stack
- Detail drawer: full-screen slide-up sheet instead of side drawer

### Loading States
- Leaderboard: 5 skeleton rank cards
- Agent cards grid: 5 skeleton cards (same height as real cards)
- Detail drawer: skeleton avatar + 3 skeleton lines

### Empty States
- No agents: "No agents yet. Add your first agent to get started." + "+ Add Agent" button
- Filtered to zero: "No agents match your search."

### Error States
- Cards load fail: error banner + retry

---

## 7. Manager — AI Chat

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "AI Assistant"                                 │
│         ├─────────────────────────────┬──────────────────────── │
│         │  LEFT: AI OPERATIONS CENTER │  RIGHT: CHAT WINDOW     │
│         │  (1/3 width)                │  (2/3 width)            │
│         │                             │                          │
│         │  ┌──────────────────────┐   │  ┌──────────────────┐   │
│         │  │ ⚠ Alerts (3)         │   │  │ Chat messages    │   │
│         │  │ ─────────────────── │   │  │                  │   │
│         │  │ ⚠ 5 orders postpone │   │  │ [User bubble]    │   │
│         │  │ ⚠ Rain in Velachery │   │  │ [AI bubble]      │   │
│         │  │ ⚠ Adyar rate +8%   │   │  │ [User bubble]    │   │
│         │  ├────────────────────│   │  │ [AI bubble]      │   │
│         │  │ 💡 Recommends (2)   │   │  │                  │   │
│         │  │ ─────────────────── │   │  │                  │   │
│         │  │ 💡 Reassign 3 orders│   │  │                  │   │
│         │  │   [Accept]          │   │  └──────────────────┘   │
│         │  │ 💡 Postpone 2 orders│   │  [Type your message...] │
│         │  │   [Accept]          │   │  [              ] [Send] │
│         │  └──────────────────┘   │                          │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**AI Operations Center Panel (left):**
- Section header "Alerts" with count badge
- Alert items: amber ⚠ icon, bold title, subtext description, affected order count
- Divider between Alerts and Recommendations sections
- Recommendations section header "Recommended Actions" with count badge
- Each recommendation: 💡 icon, title, detail, "Accept" button (blue outline, small)
- Accepting: button shows spinner → changes to "✓ Done" → toast confirmation
- "Refresh" icon button in panel header — re-fetches alerts
- Clicking an alert with `affected_order_ids` → highlights those pins if Map is open OR lists them in a mini drawer

**Chat Window (right):**
- Scrollable message thread, newest at bottom
- User bubbles: right-aligned, blue background, white text
- AI bubbles: left-aligned, white background, blue-slate text, grey border
- Intent tag shown below user message (small grey pill): "area_risk", "earnings_query" etc.
- AI bubble footer: model info "Powered by Gemini · 312 tokens" (muted, small)
- Typing indicator: 3-dot animation while AI responds
- "New conversation" button top-right of chat pane → clears thread (new session_id)
- Suggested prompts (appear on empty conversation):
  - "Which area has the most failures?"
  - "Suggest reassignments for today"
  - "How is Ravi performing this week?"
  - "What's the weather risk in Velachery?"

**Chat Input:**
- Full-width text area (1-3 rows, auto-expands)
- Send button (blue, paper-plane icon)
- Keyboard: Enter = new line, Ctrl+Enter or button = send
- Character counter when > 800 chars (max 1000)

### API Calls
- `GET /api/ai-ops/alerts` — left panel alerts
- `GET /api/ai-ops/recommendations` — left panel recommendations
- `POST /api/ai-ops/recommendations/:id/accept` — Accept button
- `GET /api/chat/history?per_page=20` — load previous messages on page open
- `POST /api/chat/message` — send message
- Socket.IO: `new_notification` for live alert updates

### Charts Used
- None on this page

### User Interactions
- Click suggested prompt → fills input + auto-sends
- Send message → show user bubble immediately (optimistic) → show typing indicator → AI bubble appears on response
- Accept recommendation → inline state change → toast
- Click alert with order IDs → mini order list slides down beneath the alert item
- "New conversation" → clear chat thread, new session_id

### Mobile Behavior
- Single column layout
- AI Operations Center collapses to a "Alerts & Recommendations" banner card (collapsed, tap to expand) above the chat
- Chat takes full width below it
- Suggested prompts horizontal scroll chips above input

### Loading States
- Chat history: skeleton bubbles (alternating left/right grey rectangles)
- Alerts panel: shimmer rows
- Sending: typing indicator (dots) while waiting for AI response

### Empty States
- Empty chat: centered LastMeter AI icon + greeting message + 4 suggested prompt chips
- No alerts: "No active alerts. Operations are running smoothly." (green shield icon)
- No recommendations: "No recommended actions at this time."

### Error States
- AI response failed: AI bubble with error message "Unable to get a response. Please try again." + retry button
- Gemini unavailable: fallback message "AI chat is temporarily unavailable. Check back shortly."

---

## 8. Manager — Customer Insights

### Layout

Accessed via link in Order Detail page ("View Customer Insights →"), not in sidebar nav.

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "← Orders / Customer Insights"                │
│         ├──────────────────────────────────────────────────────  │
│         │ CUSTOMER HEADER CARD                                   │
│         │ [Person icon]  Anitha Suresh                          │
│         │                7 Main Road, Adyar, Chennai            │
│         │                📞 9876500001   🏠 Apartment            │
│         ├──────────────────────────────────────────────────────  │
│         │ ── SUMMARY STATS ROW (4 cards) ─────────────────────  │
│         │ [Success Rate 80%] [Failed: 1] [Preferred: Morning]   │
│         │ [Risk Level: ● MEDIUM]                                │
│         ├──────────────────────────────────────────────────────  │
│         │ ── TWO COLUMNS ─────────────────────────────────────  │
│         │  LEFT (2/3)                         RIGHT (1/3)        │
│         │  ┌────────────────────────────────┐ ┌──────────────┐  │
│         │  │ Order History Table            │ │ Mini Map     │  │
│         │  │ Date / Order# / Status / Amt   │ │ (pin at addr)│  │
│         │  │ 21 Jun  LM-0001  Delivered 350 │ └──────────────┘  │
│         │  │ 18 Jun  LM-0022  Failed    180 │ ┌──────────────┐  │
│         │  │ 15 Jun  LM-0010  Delivered 350 │ │ Delivery     │  │
│         │  └────────────────────────────────┘ │ Window Prefs │  │
│         │                                      │ Morning: 3✓  │  │
│         │                                      │ Afternoon: 1 │  │
│         │                                      │ Evening: 0   │  │
│         │                                      └──────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Customer Header Card:**
- Large person icon, customer name as heading
- Address, phone, residence type
- "← Back to Order" breadcrumb link

**Summary Cards (4):**
- Success Rate (%) with colored progress ring indicator
- Failed Deliveries count (red tinted if > 2)
- Preferred Delivery Time window (morning/afternoon/evening)
- Risk Level badge (LOW/MEDIUM/HIGH) — derived from success rate bands

**Order History Table:**
- Columns: Date, Order #, Status badge, Amount (₹)
- Rows sorted by date descending
- Clicking Order # → navigates to Order Detail

**Mini Map:**
- Small Leaflet map, non-interactive, pinned to customer address
- Dark tile style, single orange marker
- "View on main map" link opens Map page with pin highlighted

**Delivery Window Preference Chart:**
- Recharts `BarChart` (small, horizontal) — 3 bars: Morning / Afternoon / Evening
- Shows count of delivered orders per window
- The highest bar is highlighted green ("preferred window")

### API Calls
- `GET /api/analytics/customer?address=7+Main+Road%2C+Adyar%2C+Chennai` — all data on this page

### Charts Used
- Recharts `BarChart` — delivery window preference

### User Interactions
- Order # link → navigate to Order Detail page
- "← Back to Order" breadcrumb → go back
- Mini map "View on main map" → open Map page, pan to address

### Mobile Behavior
- Summary cards: 2×2 grid
- Order history table: card list (one card per order)
- Mini map and window preference stack below order list

### Loading States
- Header card: skeleton (avatar placeholder + 2 text lines)
- Summary cards: 4 skeleton cards
- Table: 3 skeleton rows

### Empty States
- N/A — page only accessible when customer has order history (linked from existing order)
- If only 1 order: table shows 1 row, stats derived from 1 data point, note: "Based on 1 delivery"

### Error States
- "Failed to load customer data." + retry

---

## 9. Manager — Area Intelligence

### Layout

Accessible from Map (heatmap zone click) or from Analytics page area bar click.

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "Area Intelligence"                            │
│         ├──────────────────────────────────────────────────────  │
│         │ AREA SELECTOR: [Velachery ▾]   (dropdown, 5 areas)   │
│         ├──────────────────────────────────────────────────────  │
│         │ ── SUMMARY CARDS ROW ──────────────────────────────   │
│         │ [Success 72%] [Risk: MEDIUM] [Rain Impact: HIGH]      │
│         │ [Best Time: Morning 91%]                              │
│         ├──────────────────────────────────────────────────────  │
│         │ ── TWO COLUMNS ─────────────────────────────────────  │
│         │  LEFT (3/5)                        RIGHT (2/5)         │
│         │  ┌────────────────────────────────┐ ┌──────────────┐  │
│         │  │ Delivery Window Performance    │ │ Mini Map     │  │
│         │  │ (grouped bar: morn/aft/eve)    │ │ Area shaded  │  │
│         │  └────────────────────────────────┘ └──────────────┘  │
│         │  ┌────────────────────────────────┐ ┌──────────────┐  │
│         │  │ Clear vs Rainy Success Rate    │ │ Orders in    │  │
│         │  │ (side-by-side stat cards)      │ │ this area    │  │
│         │  └────────────────────────────────┘ │ today: 5     │  │
│         │  ┌────────────────────────────────┐ └──────────────┘  │
│         │  │ Top Failure Reasons            │                   │
│         │  │ (horizontal bar chart)         │                   │
│         │  └────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Area Selector Dropdown:**
- Large dropdown at top of page
- Selecting new area → re-fetches all data for that area, page title updates

**Summary Cards:**
- Success Rate: large %, green/amber/red colored by risk band
- Risk Level: RiskBadge component + brief description
- Rain Impact: LOW / MEDIUM / HIGH label with rain icon
- Best Delivery Window: bold window label + predicted success rate

**Window Performance Chart:**
- Recharts `BarChart` — 3 groups (Morning / Afternoon / Evening)
- Each group has 2 bars: success count (green) and failure count (red)
- X-axis: time windows; Y-axis: order count
- Tooltip: "Morning: 8 delivered / 0 failed"
- Clicking bar triggers time slot filter on Heatmap (navigates to Map with filter preset)

**Weather Impact Stats:**
- Two side-by-side stat cards: "Clear days: 89% success" and "Rainy days: 54% success"
- Rain impact label below: "HIGH — Rain reduces success rate by 35% in this area"

**Top Failure Reasons:**
- Recharts `BarChart` (horizontal) — 3 bars: weather_risk, customer_absent, traffic
- Percentage labels at end of each bar

**Mini Map:**
- Leaflet map showing the selected area with a shaded polygon
- Order pins for that area overlaid
- "View on full map" link

**Today's Orders widget:**
- Small number with area name + link to Orders page filtered to this area

### API Calls
- `GET /api/analytics/area/Velachery` — all data for selected area
- `GET /api/analytics/heatmap?time_slot=morning` — for window-based drill-down

### Charts Used
- Recharts `BarChart` — window performance (grouped)
- Recharts `BarChart` (horizontal) — top failure reasons

### User Interactions
- Area dropdown change → re-fetch, all sections update
- Window bar click → navigate to Map with time_slot and area filter pre-set
- "View on full map" → Map page, area selected, area zoomed in

### Mobile Behavior
- Summary cards: 2×2 grid
- Charts: full-width stacked
- Mini map: hidden on mobile (link to Map page instead)

### Loading States
- Summary cards: 4 skeleton cards
- Charts: skeleton rectangles

### Empty States
- No orders in area: "No order data for Velachery yet." (map-pin icon)

### Error States
- Load fail: error banner + retry

---

## 10. Manager — Settings

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "Settings"                                     │
│         ├───────────────────┬──────────────────────────────────  │
│         │  SETTINGS TABS    │  TAB CONTENT PANEL                │
│         │  (left sidebar    │                                    │
│         │   within page)    │                                    │
│         │                   │                                    │
│         │  > Profile        │                                    │
│         │    Notifications  │                                    │
│         │    Model Settings │                                    │
│         │    API Integrations│                                   │
│         │    Security       │                                    │
└───────────────────────────────────────────────────────────────────┘
```

### Tab: Profile
- Avatar circle (initials) with "Change photo" link (future feature — greyed out with tooltip)
- Editable fields: Name, Phone
- Read-only fields: Username, Role, Area (n/a for manager), City
- "Save Changes" button — PATCH /api/auth/me/profile

### Tab: Notification Preferences
- 4 category rows with toggle switches:
  - AI Alerts (ai_alert)
  - Delivery Alerts (delivery_alert)
  - Weather Alerts (weather_alert)
  - System Alerts (system_alert)
- Brief description under each toggle: "Get notified when AI flags an order as NO-GO"
- Changes auto-save on toggle (PATCH /api/auth/me/profile with notification_prefs)

### Tab: Model Settings (Manager only)
- Current model version card: "GO/NO-GO Model: Logistic Regression v1.0 · Trained 23 Jun · 5,000 records · Accuracy 91.4%"
- GO/NO-GO Threshold slider:
  - Range: 0.10 – 0.90, step 0.05
  - Current value pill displayed: "0.50"
  - Label at extremes: "More GO ← → More NO-GO"
  - Preview: "At 0.55: [N] of today's orders would change from GO to NO-GO" (live preview, client-side calculation)
  - "Save threshold" button → PATCH /api/ml/threshold
  - Reset link: "Reset to default (0.50)"
- "View Model Comparison" link → navigates to a Model Comparison sub-page (or modal)
- Model comparison: GET /api/ml/comparison data shown in a simple table (LR vs RF side by side)

### Tab: API Integrations (Manager only)
- Health status cards for each external dependency:
  - Gemini API: green dot "Connected" or red dot "Error" + latency_ms
  - OpenWeatherMap API: status + last successful fetch time
  - OSRM Routing: status
  - Database: status
- "Refresh status" button → GET /health → update all statuses
- Note: API keys are not displayed (security). "Contact your admin to update keys."

### Tab: Security
- Change Password form: Current password / New password / Confirm new password
- "Update Password" button → PATCH /api/auth/me/password
- Active Sessions section (Phase 2 placeholder — displayed as "Session management coming soon")

### API Calls
- `PATCH /api/auth/me/profile` — profile save, notification pref toggles
- `PATCH /api/auth/me/password` — security tab
- `GET /api/ml/models` — model settings tab
- `PATCH /api/ml/threshold` — threshold save
- `GET /api/ml/comparison` — model comparison table
- `GET /health` — API integrations tab refresh

### Charts Used
- None (model comparison is a table, not a chart)

### User Interactions
- Tab click → show tab content (client-side only, no navigation)
- Toggle → immediate PATCH (no "Save" button for notification prefs)
- Threshold slider → live preview text updates client-side before save
- "Save threshold" → PATCH → toast confirmation
- "Refresh status" → loading spinner → statuses update

### Mobile Behavior
- Tabs become horizontal scrollable chips at top
- Tab content takes full width below

### Loading States
- Profile tab: form fields populate after GET /api/auth/me (already loaded from app init)
- API integrations: spinner while GET /health is in-flight, then status dots appear

### Empty States
- N/A

### Error States
- Profile save fail: inline red text below form
- Password update fail: "Current password is incorrect" below field
- API integrations unreachable: each card shows red dot "Unavailable"

---

## 11. Agent — Dashboard

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "Good morning, Ravi 👋"                        │
│         ├──────────────────────────────────────────────────────  │
│         │ TODAY'S SUMMARY STRIP (3 cards)                       │
│         │ [Orders: 6] [Delivered: 2] [Earnings: ₹530]          │
│         ├──────────────────────────────────────────────────────  │
│         │ ── MAIN QUEUE: PENDING ORDERS ──────────────────────  │
│         │ "Your orders today (4 pending)"        [Start Route]  │
│         │                                                        │
│         │ ┌──────────────────────────────────────────────────┐  │
│         │ │ LM-0001  ● GO         Anitha Suresh              │  │
│         │ │ Apartment · Morning   ₹350  ⚡ URGENT             │  │
│         │ │ [Mark In Transit] [View Details]                  │  │
│         │ ├──────────────────────────────────────────────────┤  │
│         │ │ LM-0005  ● NO-GO      Eswari Devi                │  │
│         │ │ Apartment · Afternoon  ₹400                       │  │
│         │ │ Reason: Weather Risk +35%, Customer History +25%  │  │
│         │ │ Reschedule: 26 Jun, Afternoon                     │  │
│         │ │ [Postpone] [Override & Deliver] [View Details]    │  │
│         │ ├──────────────────────────────────────────────────┤  │
│         │ │ ...more orders                                    │  │
│         │ └──────────────────────────────────────────────────┘  │
│         ├──────────────────────────────────────────────────────  │
│         │ ACTIVITY FEED (own)           COST SAVINGS SUMMARY    │
│         │ [10:32 Delivered #124]        [Deliveries: 4]        │
│         │ [10:15 AI flagged #120 NO-GO] [Avoided: 2]          │
│         │                               [Saved: ~₹600]         │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Summary Strip (3 MetricCards):**
- Orders Today (total assigned), Delivered, Earnings Today (₹)
- All green-tinted when performing well (delivered >= 80% of total)

**Pending Order Cards:**
- Sorted: URGENT first, then GO orders, then NO-GO orders
- Each card: order number, decision badge (GO green / NO-GO red / URGENT amber outline), customer name, residence type, time window, payment amount
- GO card: "Mark In Transit" button (primary) + "View Details" link
- NO-GO card: SHAP reason summary (top 2 factors only, simplified), reschedule suggestion, "Postpone" button (amber) + "Override & Deliver" button (grey outline, for agent discretion) + "View Details" link
- URGENT flag strip across top of card (amber background) when is_urgent = true
- "Override & Deliver" triggers ConfirmModal: "AI has flagged this NO-GO. Deliver anyway? This will be logged." → on confirm, sets status to in_transit + writes audit log

**Start Route Button:**
- Blue button top-right of order queue section
- Click → navigate to Map page with route pre-loaded for all GO orders

**Activity Feed (own only):**
- Same component as Manager dashboard but scoped to current agent's actions
- Max 5 items, "View all" → navigates to Order History (as history is the full activity)

**Cost Savings Summary:**
- Small card: today's numbers: deliveries attempted vs postponed (AI-guided), estimated fuel/cost saved

### API Calls
- `GET /api/orders?agent_id=me&status=pending,in_transit&per_page=20` — order queue
- `GET /api/analytics/dashboard` (agent scope — no dedicated endpoint, uses same endpoint; backend scopes to agent)
- `GET /api/analytics/cost-savings?period=today` — cost savings widget
- `GET /api/audit/feed?limit=5` — activity feed
- `PATCH /api/orders/:id/status` — Mark In Transit / Postpone
- Socket.IO: `order_updated`, `new_order_assigned`, `urgent_deadline` events

### Charts Used
- None on dashboard (summary cards + order cards replace charts on agent view)

### User Interactions
- "Mark In Transit" → PATCH status = in_transit → card updates in place (green "In Transit" badge)
- "Postpone" → opens ConfirmModal asking for reason text → PATCH status = postponed
- "Override & Deliver" → ConfirmModal → PATCH status = in_transit
- "Start Route" → navigate to Map
- Order card click (body) → navigate to Order Detail
- Socket.IO `new_order_assigned` → new card appears at top of queue with slide-in animation + toast notification

### Mobile Behavior
- Summary strip: 3 horizontal scroll cards (or 1×3 column)
- Order cards: full width, touch-friendly action buttons
- "Start Route" button: prominent, below summary strip on mobile

### Loading States
- Summary strip: 3 skeleton cards
- Order queue: 3 skeleton order cards

### Empty States
- No pending orders: "All done for today! 🎉" with check-circle icon and today's delivered count
- If no orders assigned at all: "No orders assigned yet. Check back later."

### Error States
- Queue load fail: error banner + retry

---

## 12. Agent — Map

### Layout

Same full-screen map structure as Manager Map, but with reduced layers and scope.

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │  [FULL-HEIGHT DARK LEAFLET MAP — OWN AREA ONLY]        │
│         │                                                        │
│         │  ┌──── Layer Controls ────┐                           │
│         │  │ ☑ My orders (pins)    │                            │
│         │  │ ☑ My route            │                            │
│         │  │ ☐ Weather layer        │                            │
│         │  └────────────────────────┘                           │
│         │                                                        │
│         │  [Risk-colored order pins — own orders only]          │
│         │  [Animated route line connecting delivery stops]       │
│         │                                                        │
│         │  ┌──── Bottom Drawer ─────────────────────────────┐   │
│         │  │ 📍 Next stop: LM-0001 · Anitha Suresh · 1.2km  │   │
│         │  │ ● GO  · Morning · ₹350  [Mark Delivered]       │   │
│         │  └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Differences from Manager Map:**
- No agent dot layer (only own location — shown as a blue pulsing "you are here" dot)
- No heatmap overlay
- No other agents visible
- Layer controls: only "My orders", "My route", "Weather"
- Bottom drawer: current/next delivery card (not scrollable order list)
- "Mark Delivered" / "Mark Failed" / "Mark Postponed" action buttons in bottom drawer

**Next Stop Card (bottom drawer):**
- Order number + customer name + estimated distance
- Decision badge + time window + payment
- Status action buttons: [Mark Delivered] (green) / [Mark Failed] (red) / [Mark Postponed] (amber)
- Tapping "Mark Delivered" → opens ConfirmModal → PATCH /api/orders/:id/status

**Geofencing indicator (Phase 2):**
- When agent is within 100m of delivery pin, orange ring appears around pin + toast "You're near LM-0001. Mark as Arrived?" → auto-status update

### API Calls
- `GET /api/orders?agent_id=me&status=pending,in_transit` — own order pins
- `GET /api/weather/current` (own area, no area param needed) — weather layer
- `PATCH /api/orders/:id/status` — action buttons in bottom drawer
- Socket.IO: `order_updated` to keep pin status in sync

### Charts Used
- None

### User Interactions
- Tap order pin → popup with decision + SHAP factors + action buttons
- Bottom drawer swipe up → full order list for today
- Weather layer toggle → show/hide OpenWeather tiles

### Mobile Behavior
- Map fills full screen (this is primarily a mobile page)
- Bottom drawer: fixed at bottom, collapsed to "Next stop" strip by default
- Swipe up drawer to see full order list

### Loading States
- Map tiles load progressively
- Pins: grey placeholders while loading

### Empty States
- No orders: "All orders complete for today." message on map

### Error States
- Route unavailable: "Unable to load route." toast (map still usable)

---

## 13. Agent — Orders (Order History)

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "Order History"                               │
│         ├──────────────────────────────────────────────────────  │
│         │ FILTER BAR                                            │
│         │ [🔍 Search order# or customer...]                     │
│         │ [Status ▾] [Date ▾]                                   │
│         │ (No Area filter — own area only)                      │
│         │ (No Agent filter — own orders only)                   │
│         ├──────────────────────────────────────────────────────  │
│         │ "18 orders"   [Sort: Date ▾]                         │
│         ├──────────────────────────────────────────────────────  │
│         │ ORDER CARDS (stacked — not a table)                  │
│         │ ┌───────────────────────────────────────────────────┐ │
│         │ │ LM-0003  21 Jun 2026  ✓ Delivered  ₹620          │ │
│         │ │ Chitra Nair · Apartment · Evening · Large         │ │
│         │ │                          [View Details]           │ │
│         │ ├───────────────────────────────────────────────────┤ │
│         │ │ LM-0004  21 Jun 2026  ✗ Failed     ₹210          │ │
│         │ │ Dinesh Raj · Independent · Morning · Small        │ │
│         │ │ Reason: Customer not available                     │ │
│         │ │                          [View Details]           │ │
│         │ └───────────────────────────────────────────────────┘ │
│         │                                                        │
│         │ PAGINATION                                             │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Order Cards (instead of full table — appropriate for agent workflow):**
- Order number + date (left), Status badge + payment (right)
- Customer name + residence type + time window + package size
- Failure reason text (if failed/postponed), muted
- "View Details" link → Order Detail page

**Filter bar simplified:**
- Search (order# or customer name)
- Status dropdown: All / Pending / In Transit / Delivered / Failed / Postponed
- Date range (quick presets: Today / This Week / This Month / Custom)

### API Calls
- `GET /api/orders?page=1&per_page=20&{filters}&sort_by=created_at&sort_dir=desc` — own orders (backend auto-scopes)

### Charts Used
- None

### User Interactions
- Search: debounced 300ms refetch
- Status filter: immediate refetch
- Date preset: immediate refetch
- "View Details" → Order Detail page
- Pull-to-refresh on mobile (browser native or gesture listener)

### Mobile Behavior
- Same card layout, full-width
- Filter: "Filter" button → bottom sheet

### Loading States
- 3 skeleton cards

### Empty States
- No orders matching filter: "No orders found for these filters." + "Clear filters" link
- No order history at all: "No deliveries yet."

### Error States
- Load fail: error banner + retry

---

## 14. Agent — Earnings

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "Earnings"                                     │
│         ├──────────────────────────────────────────────────────  │
│         │ PERIOD SELECTOR: [Today] [This Week ✓] [This Month]   │
│         ├──────────────────────────────────────────────────────  │
│         │ SUMMARY CARDS ROW (3)                                  │
│         │ [Total Earned ₹2,240] [Deliveries: 18] [Avg: ₹124]   │
│         ├──────────────────────────────────────────────────────  │
│         │ EARNINGS BY DAY CHART (area/bar chart, 7-day)         │
│         │ ┌──────────────────────────────────────────────────┐  │
│         │ │  ₹                                               │  │
│         │ │  600 ┤    ██                                     │  │
│         │ │  400 ┤██  ██  ██  ██                             │  │
│         │ │  200 ┤██  ██  ██  ██  ██      ██                │  │
│         │ │      └──Mon─Tue─Wed─Thu─Fri─Sat─Sun              │  │
│         │ └──────────────────────────────────────────────────┘  │
│         ├──────────────────────────────────────────────────────  │
│         │ RECENT DELIVERED ORDERS                               │
│         │ "18 deliveries this week"                             │
│         │ ┌──────────────────────────────────────────────────┐  │
│         │ │ LM-0003  21 Jun  Chitra Nair  ₹620               │  │
│         │ │ LM-0001  21 Jun  Anitha Suresh ₹350              │  │
│         │ │ ...                                               │  │
│         │ └──────────────────────────────────────────────────┘  │
│         │ COST SAVINGS SUMMARY (own deliveries)                 │
│         │ "AI helped you avoid 2 NO-GO deliveries → saved ~₹600"│
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Period Selector:** Segmented buttons — Today / This Week / This Month

**Summary Cards (3):** Total Earned, Deliveries Count, Avg Per Delivery

**Earnings Bar Chart:**
- Recharts `BarChart` — one bar per day
- X-axis: day labels (Mon/Tue/…)
- Y-axis: ₹ amount
- Blue bars with hover tooltip: "Wed: ₹530 (4 deliveries)"
- Today's bar highlighted in darker blue

**Delivered Orders List:**
- Simple list, no filters (this page is already filtered to delivered only)
- Columns: Order #, Date, Customer Name, Amount
- Compact rows, "View" link on each

**Cost Savings Card:**
- Small highlight card at bottom: AI-guided avoided deliveries + estimated savings (from GET /api/analytics/cost-savings scoped to agent)

### API Calls
- `GET /api/agents/me/earnings?period=week` (or `GET /api/agents/:id/earnings?period=week`)
- `GET /api/orders?status=delivered&per_page=20` — delivered orders list
- `GET /api/analytics/cost-savings?period=week` — cost savings card

### Charts Used
- Recharts `BarChart` — earnings by day

### User Interactions
- Period selector → re-fetch earnings + update chart
- Chart bar hover → tooltip
- Order row "View" → Order Detail page

### Mobile Behavior
- 3 summary cards: 3-column row (small cards)
- Chart: full width
- Orders list: compact rows, full width

### Loading States
- Summary cards: 3 skeletons
- Chart: grey rectangle
- Orders list: 3 skeleton rows

### Empty States
- No earnings this period: "No deliveries recorded for this period." (₹ icon with 0)

### Error States
- Load fail: error banner + retry

---

## 15. Agent — Notifications

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "Notifications"          [Mark all read]       │
│         ├──────────────────────────────────────────────────────  │
│         │ CATEGORY TABS                                          │
│         │ [All (6)] [AI Alerts (2)] [Delivery (1)] [Weather (3)]│
│         │ [System (0)]                                           │
│         ├──────────────────────────────────────────────────────  │
│         │ NOTIFICATION LIST                                      │
│         │ ┌──────────────────────────────────────────────────┐  │
│         │ │ ● ⚠ AI Alert  · 2 min ago                       │  │
│         │ │   Order LM-0005 flagged NO-GO                    │  │
│         │ │   Weather Risk +35%, reschedule: 26 Jun PM       │  │
│         │ │   [View Order]                   [✓ Mark read]   │  │
│         │ ├──────────────────────────────────────────────────┤  │
│         │ │   🌧 Weather Alert  · 1 hr ago                   │  │
│         │ │   Light rain in Adyar this morning               │  │
│         │ │   Wind: 22 km/h. Proceed with caution.           │  │
│         │ │                                  [✓ Mark read]   │  │
│         │ ├──────────────────────────────────────────────────┤  │
│         │ │   📦 Delivery Alert  · 3 hrs ago  (read)         │  │
│         │ │   New order assigned: LM-0007                    │  │
│         │ └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Category Tabs:**
- Horizontal scrollable tab strip
- Each tab: category label + unread count badge
- "All" tab shows count of all unread
- Active tab highlighted in blue

**Notification Items:**
- Unread = blue left border + slightly blue-tinted background
- Read = white background, no border
- Category icon (⚠ amber for AI, 📦 teal for delivery, 🌧 blue for weather, ⚙ grey for system)
- Title (bold if unread), message body (2-line clamp, "Read more" if longer)
- Relative time (right-aligned, muted)
- "View Order" link if `order_id` is set
- "Mark read" button (icon only on mobile)
- Swipe-left gesture (mobile): reveals Delete button

**Mark All Read button (top-right):**
- Only visible when there are unread notifications
- Applies to currently active category tab (or all if "All" tab)

### API Calls
- `GET /api/notifications?category=ai_alert&is_read=false` — filtered by active tab
- `PATCH /api/notifications/:id/read` — mark single read
- `PATCH /api/notifications/read-all?category=ai_alert` — mark all read in category
- `DELETE /api/notifications/:id` — on swipe-delete (mobile) or delete button
- Socket.IO: `new_notification` event → new item slides in at top of list

### Charts Used
- None

### User Interactions
- Tab click → filter list by category
- "Mark read" → PATCH → item fades to read state
- "Mark all read" → PATCH all → all items in tab fade to read state, badge disappears
- "View Order" → navigate to Order Detail page
- Swipe left on item (mobile) → reveal red "Delete" button → DELETE
- Socket.IO: new notification → toast + item prepends to list with slide-down animation

### Mobile Behavior
- Same layout — designed mobile-first
- Category tabs horizontally scrollable
- Swipe-left gesture for delete

### Loading States
- Skeleton rows: 4 placeholder items

### Empty States
- Category has no notifications: "[Icon] No [category] notifications." with brief description of what this category covers
- All clear: "You're all caught up! No notifications." (bell-check icon)

### Error States
- Load fail: error banner + retry

---

## 16. Agent — AI Chat

### Layout

Simplified version of Manager AI Chat — no Operations Center panel, chat only.

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "AI Assistant"              [New Conversation] │
│         ├──────────────────────────────────────────────────────  │
│         │  ALERTS BANNER (collapsed by default)                 │
│         │  ┌──────────────────────────────────────────────────┐ │
│         │  │ ⚠ 1 alert · Order LM-0005 flagged NO-GO  [▾]   │ │
│         │  └──────────────────────────────────────────────────┘ │
│         │                                                        │
│         │  CHAT WINDOW (full width)                             │
│         │  ┌──────────────────────────────────────────────────┐ │
│         │  │  [AI greeting: "Hi Ravi! How can I help today?"] │ │
│         │  │                                                  │ │
│         │  │  Suggested prompts:                              │ │
│         │  │  [Which orders should I deliver first?]          │ │
│         │  │  [How much will I earn today?]                   │ │
│         │  │  [What's the weather in Adyar?]                  │ │
│         │  │  [Why is LM-0005 NO-GO?]                         │ │
│         │  │                                                  │ │
│         │  │  [User: How much will I earn today?]             │ │
│         │  │  [AI: Based on your orders...]                   │ │
│         │  └──────────────────────────────────────────────────┘ │
│         │  [Type your question...              ] [→ Send]       │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Alerts Banner (collapsed by default):**
- Shows unread AI alert count
- Click ▾ to expand: shows alert items (read-only, no Accept actions)
- Own alerts only (backend scoped)

**Chat Window:** Same as Manager AI Chat (bubbles, typing indicator, intent tags)

**Suggested Prompts (delivery-focused tone):**
- "Which orders should I deliver first?"
- "How much will I earn today?"
- "What's the weather in Adyar?"
- "Why is order LM-0005 flagged NO-GO?"
- Chips replace themselves after first message is sent

### API Calls
- `GET /api/ai-ops/alerts` (own alerts only — backend scoped)
- `GET /api/chat/history?per_page=20`
- `POST /api/chat/message`

### Differences from Manager Chat
- No AI Operations Center left panel
- No "Accept recommendation" actions
- Suggested prompts are delivery-focused, not analytics-focused
- AI responses use delivery-assistant tone

### Mobile Behavior
- Full-screen chat
- Alerts banner at very top (collapsed)
- Keyboard pushes chat up, input stays visible

### Loading, Empty, Error States
- Same as Manager AI Chat

---

## 17. Agent — Settings

### Layout

Same tab structure as Manager Settings but with 3 tabs only.

```
Tabs: Profile | Notification Preferences | Security
```

**Missing from Agent Settings:**
- No "Model Settings" tab (no threshold control)
- No "API Integrations" tab (no system monitoring)

**Profile tab:**
- Editable: Name, Phone
- Read-only: Username, Role, Area (agent sees their area but cannot change it), City

**Notification Preferences tab:**
- Same 4 category toggles as Manager
- Changes auto-save

**Security tab:**
- Change password form only
- No session management (same as Manager for now)

### API Calls
- `PATCH /api/auth/me/profile` — profile + notification prefs
- `PATCH /api/auth/me/password` — password change

### Mobile, Loading, Empty, Error States
- Same as Manager Settings (same components, fewer tabs)

---

## 18. Shared — Order Detail Page (Manager view)

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR: "← Orders / LM-0001"   [Edit] [Delete]        │
│         ├──────────────────────────────────────────────────────  │
│         │ ── HEADER CARD ────────────────────────────────────── │
│         │  LM-0001  · Anitha Suresh  · ⚡ URGENT                │
│         │  ● NO-GO   risk_score: 72  ● HIGH RISK               │
│         │  Status: PENDING  · Created: 21 Jun 2026              │
│         │  Agent: Ravi Kumar  [Reassign]                         │
│         ├──────────────────────────────────────────────────────  │
│         │ ── TWO COLUMNS ─────────────────────────────────────  │
│         │  LEFT (3/5)                      RIGHT (2/5)           │
│         │  ┌────────────────────────────┐  ┌──────────────────┐ │
│         │  │ AI DECISION CARD           │  │ ORDER DETAILS    │ │
│         │  │                            │  │ Area: Adyar      │ │
│         │  │ ● NO-GO                    │  │ Address: ...     │ │
│         │  │ Success probability: 38%   │  │ Package: Medium  │ │
│         │  │ Risk score: 72/100 (HIGH)  │  │ Window: Morning  │ │
│         │  │                            │  │ Deadline: 26 Jun │ │
│         │  │ Why NO-GO:                 │  │ Payment: ₹350    │ │
│         │  │ ■■■■■■■ Weather Risk  +35% │  │ Residence: Apt   │ │
│         │  │ ■■■■■  Customer Hist  +25% │  └──────────────────┘ │
│         │  │ ■■■    Distance       +15% │  ┌──────────────────┐ │
│         │  │ ■■     Time of Day    +10% │  │ MINI MAP         │ │
│         │  │ ■      Traffic         +8% │  │ (pin at address) │ │
│         │  │                            │  └──────────────────┘ │
│         │  │ Reschedule suggestion:     │  ┌──────────────────┐ │
│         │  │ 26 Jun, Afternoon (83%)    │  │ CUSTOMER LINK    │ │
│         │  │ [Schedule for 26 Jun Aft.] │  │ Success: 80%     │ │
│         │  │                            │  │ [View Insights→] │ │
│         │  │ [Re-run prediction]        │  └──────────────────┘ │
│         │  └────────────────────────────┘                       │
│         ├──────────────────────────────────────────────────────  │
│         │ DECISION HISTORY (collapsible)                        │
│         │ > 2 previous predictions — expand to see             │
└──────────────────────────────────────────────────────────────────┘
```

### Components

**Header Card:**
- Order number (large, bold), customer name, URGENT badge (if urgent)
- Decision badge (GO/NO-GO) + Risk badge + risk score number
- Status badge + created date
- Assigned agent name + "Reassign" link (opens inline agent dropdown)
- "Edit" button (top-right) → opens edit modal
- "Delete" button → ConfirmModal

**AI Decision Card (the centerpiece):**
- Decision badge: large GO (green) or NO-GO (red) label
- Success probability as percentage
- Risk score with colored gauge or progress bar
- SHAP Breakdown: `SHAPBreakdown` component — horizontal bars per factor, signed % values, label on left
- Only factors with ≥5% contribution shown
- Reschedule suggestion card (if NO-GO): suggested date/window + predicted success + "Schedule this" button
- "Re-run prediction" text button → POST /api/decisions/predict + inline update

**Order Details Panel (right):**
- All static order fields listed vertically
- Clean label: value format

**Mini Map (right):**
- Small Leaflet map, non-interactive
- Single pin at order coordinates
- Dark tile style

**Customer Insights Card (right):**
- Summary: customer success rate + link "View Customer Insights →"
- Clicking link navigates to Customer Insights page for that address

**Decision History (collapsible):**
- Shows previous predictions for this order (if re-run was triggered)
- Each row: date, decision, risk score, model version, top SHAP factor

### API Calls
- `GET /api/orders/:id` — full order + latest decision
- `GET /api/orders/:id/decision` — decision history
- `POST /api/decisions/predict` — re-run
- `PUT /api/orders/:id` — edit modal save
- `DELETE /api/orders/:id` — delete
- `GET /api/agents` — for reassign dropdown

### Charts Used
- `SHAPBreakdown` (custom horizontal bar component — not Recharts)

### User Interactions
- "Re-run prediction" → inline loading then updates decision card
- "Schedule this" (reschedule) → opens mini modal to confirm the suggested date/window, then creates/updates order
- "Reassign" → dropdown of agents in same area → select → immediate PUT
- "Edit" → opens Edit Order modal (same as All Orders edit modal)
- "View Customer Insights" → navigate to Customer Insights page

### Mobile Behavior
- Header card: compact (order# + customer + badges)
- Decision card: full-width, SHAP bars readable
- Order details: accordion (collapsed by default on mobile, tap to expand)
- Mini map: hidden, "View on map" link instead
- Customer card: link only

---

## 19. Shared — Order Detail Page (Agent view)

Same layout as Manager Order Detail with these differences:

**Removed (Agent cannot see/do):**
- "Edit" and "Delete" buttons
- "Reassign" link
- Customer Insights card
- Decision History section
- "Re-run prediction" button

**Added/Changed:**
- Status action buttons prominently: [Mark Delivered] / [Mark Failed] / [Mark Postponed]
- If status is already delivered/failed/postponed: large status badge instead of action buttons
- NO-GO card shows reason breakdown (same SHAP component) but hides exact % numbers — shows only factor names and relative bars (spec §2.1: agent sees GO/NO-GO + reason breakdown, NOT raw success %)
- Success probability number is hidden from the agent; only risk_level band is shown

---

## Appendix A — Component Quick Reference

| Component | Used on | Description |
|---|---|---|
| `MetricCard` | Dashboard (M+A), Earnings, Analytics, Area Intel. | KPI number card |
| `RiskBadge` | Orders table, Order Detail, Map popup | LOW/MEDIUM/HIGH pill |
| `DecisionBadge` | Order cards, Order Detail, Map popup | GO / NO-GO / URGENT pill |
| `StatusBadge` | All order lists | pending/in_transit/delivered/failed/postponed |
| `SHAPBreakdown` | Order Detail, Row expand, Map popup | Horizontal bar factor chart |
| `ActivityFeedItem` | Dashboard (M+A), Audit Feed | Icon + description + time |
| `OrderCard` | Agent dashboard, mobile order lists | Compact order summary card |
| `AIOperationsPanel` | Manager Dashboard, Manager AI Chat | Alerts + recommendations card |
| `GoNoGoCard` | Agent dashboard order queue | Full decision card with SHAP |
| `ModelMetadataCard` | Settings → Model Settings | Version + accuracy display |
| `ChatMessage` | AI Chat (M+A) | User/assistant bubble |
| `SkeletonCard` | All pages (loading) | Shimmer placeholder |
| `EmptyState` | All pages (empty) | Icon + heading + CTA |
| `ErrorBanner` | All pages (error) | Red strip + retry |

---

## Appendix B — Chart Summary

| Chart | Library | Pages used | Data source |
|---|---|---|---|
| Success Rate Over Time | Recharts LineChart | Manager Dashboard | `/api/analytics/dashboard` |
| Failure Rate by Area | Recharts BarChart | Manager Dashboard | `/api/analytics/dashboard` |
| Revenue by Day | Recharts AreaChart | Manager Dashboard | `/api/analytics/dashboard` |
| Risk Distribution | Recharts PieChart (donut) | Manager Analytics | `/api/analytics/kpi` |
| Agent Performance | Table (no chart) | Manager Analytics | `/api/analytics/kpi` |
| Area Performance | Recharts BarChart | Manager Analytics | `/api/analytics/kpi` |
| Weather Impact | Recharts LineChart | Manager Analytics | `/api/analytics/weather-impact` |
| Earnings by Day | Recharts BarChart | Agent Earnings | `/api/agents/:id/earnings` |
| Window Preference | Recharts BarChart (small) | Customer Insights | `/api/analytics/customer` |
| Window Performance | Recharts BarChart (grouped) | Area Intelligence | `/api/analytics/area/:area` |
| Failure Reasons | Recharts BarChart (horizontal) | Area Intelligence | `/api/analytics/area/:area` |
| Agent Orders by Status | Recharts PieChart (donut) | Agent Mgmt Detail Drawer | `/api/agents/:id` |
| Earnings History (detail) | Recharts BarChart | Agent Mgmt Detail Drawer | `/api/agents/:id/earnings` |

---

## Appendix C — Socket.IO → UI Event Mapping

| Socket.IO Event | Page(s) affected | UI Action |
|---|---|---|
| `order_updated` | Agent Dashboard, Map, Order Detail | Re-fetch order / update card/pin in place |
| `new_order_assigned` | Agent Dashboard | Prepend new order card + toast |
| `urgent_deadline` | Agent Dashboard, Notifications | Red toast "Order LM-XXXX is due now!" |
| `ai_decision` | Manager Dashboard, Orders | Update decision badge on relevant order card |
| `agent_location` | Manager Map | Smooth move agent dot to new coords |
| `new_notification` | All pages (TopBar bell) | Increment badge count; prepend to Notifications list if on that page |
| `activity_feed` | Manager Dashboard, Agent Dashboard | Prepend feed item with slide-down animation |
