# LastMeter AI — Handoff Notes

A last-mile delivery ops platform: Flask API + React/Vite frontend + ML models,
deployed on Render (backend) and Vercel (frontend). This doc gets a new developer
productive fast.

## Run it locally

**Backend** (Python 3.13, from `backend/`):
```bash
pip install -r requirements.txt
python seed.py          # creates SQLite DB with demo data
python run.py           # serves on http://localhost:5001
```

**Frontend** (from `frontend/`):
```bash
cp .env.example .env.local   # then fill in VITE_MAPBOX_TOKEN
npm install
npm run dev                  # http://localhost:5173
```

**Demo logins:** `manager` / `manager123` · `ravi.kumar` / `agent123`

## Environment variables
See `frontend/.env.example` and `backend/.env.example`. The one that's **required**
for the maps to render is `VITE_MAPBOX_TOKEN`.

## Layout
```
backend/app/
  routes/       HTTP endpoints (auth, orders, decisions, analytics, chat, tracking, models)
  services/     business logic (thin routes call these)
  models/       SQLAlchemy models
  ml/           model loaders (predictor, intent, area, failure-reason)
frontend/src/
  pages/        one file per screen (Dashboard, Map, Orders, Analytics, PowerBI, ...)
  api/          typed fetch clients, one per backend area
  router/       routes (index.tsx) + nav links (nav.ts)
  contexts/     Auth + Socket providers
```

## For the two planned tasks

### Full UI redesign
- Pages live in `frontend/src/pages/`. Each page calls a typed client in
  `frontend/src/api/` — **keep the API clients, restyle the pages.**
- Styling is Tailwind; charts are Recharts (`Analytics.tsx`).
- Add/rename routes in `frontend/src/router/index.tsx` and nav in `router/nav.ts`.
- The backend is stable — a UI rewrite shouldn't need backend changes.

### Power BI
- The `/power-bi` page (`frontend/src/pages/PowerBI.tsx`) is already built. It
  renders a Power BI report in an iframe when `VITE_POWERBI_EMBED_URL` is set,
  and shows a step-by-step setup guide when it isn't.
- Build the report in Power BI Service (browser) using the CSVs exported from the
  **Analytics** page ("Download all"), then File → Publish to web → paste that
  link into `VITE_POWERBI_EMBED_URL` (Vercel + `.env.local`).

## Tests
Backend smoke tests run directly, e.g. `python3 backend/tests/test_chat.py`.

## Deploy
Push to `main` → Vercel auto-deploys the frontend; Render auto-deploys the backend
(`render.yaml`). Backend is on Render's free tier, so it cold-starts (~30–50s)
after idle.
