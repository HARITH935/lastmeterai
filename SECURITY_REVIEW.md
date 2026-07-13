# Security Review — LastMeter AI

Date: 2026-07-13
Scope: backend (Flask API), frontend (React/Vite), deployment config
(`render.yaml`, `vercel.json`). Manual code review + live testing against
`https://lastmeterai.onrender.com`.

All findings below were fixed in the same session they were found — see the
linked commits for the exact diff, reasoning, and verification of each fix.

## Findings & fixes

| # | Severity | Finding | Fix | Commit |
|---|----------|---------|-----|--------|
| 1 | **HIGH** | Stored XSS in Mapbox popup HTML. `setHTML()` (= `innerHTML`) was built from raw template-literal interpolation of `order_number`, `customer_name`, `address`, `area` — all free-text DB fields with no HTML sanitization. Since the JWT is stored in `localStorage`, a payload planted in e.g. `customer_name` would let an attacker steal any viewer's session token. | Added `escapeHtml()`, applied to every interpolated field across all 3 popup call sites (`MapboxManager.tsx` ×2, `MapboxAgent.tsx` ×1). | `3a6489f` |
| 2 | **HIGH** | `/api/auth/login` and `/api/auth/refresh` had **zero rate limiting** — unlimited scripted password-guessing was possible against any username. | Added `@limiter.limit("5 per minute")` (login) and `("10 per minute")` (refresh), keyed by IP. | `7a08643` |
| 3 | **MEDIUM** | CORS was configured with `supports_credentials=True` + `CORS_ORIGINS="*"` (the deployed default) — an invalid combination per the CORS spec, which makes `flask-cors` reflect the request's `Origin` back instead of a literal `*`, effectively allowing any site to receive credentialed responses. | Removed `supports_credentials` (unused — auth is Bearer-token-only, no cookies, frontend never sends `credentials: 'include'`). Tightened `render.yaml`'s `CORS_ORIGINS` default to the real Vercel URL. | `54f7b32` |
| 4 | **LOW** | Refresh-token rotation issued a new refresh token but never revoked the old one — a captured/leaked refresh token stayed valid for its full 30-day life even after a legitimate rotation. | Old refresh token's `jti` is now blocklisted on rotation; also added the missing manual blocklist check inside `refresh_tokens()` (the normal `@jwt_required()` blocklist hook doesn't run for a manually `decode_token()`-ed refresh token). | `9bf6b7c` |
| 5 | **LOW** | No `backend/.gitignore` — only the root's bare `.env` pattern applied, missing `.env.local`, `instance/` (SQLite dev DB), `*.db`, `__pycache__/`. Nothing was actually leaked (verified), but the gap was real. | Added `backend/.gitignore`. | `bb12305` |

## Verified clean (no finding)

- **SQL injection** — 100% SQLAlchemy ORM / parameterized queries; no raw string-built SQL anywhere in the codebase.
- **Customer tracking tokens** (`/api/track/<token>`) — HMAC-SHA256 signed, `hmac.compare_digest` constant-time comparison (no timing attack), returns only customer-safe fields (no phone, payment, or internal risk scores). Well-built.
- **Login timing attack** — `auth_service.login()` deliberately runs `bcrypt.check_password_hash` against a dummy hash even when the username doesn't exist, so response time doesn't leak account existence.
- **Mass assignment** — profile updates use an explicit field allowlist (`{"name", "phone", "notification_prefs"}`), unknown keys silently dropped.
- **`DEBUG` mode** — correctly `False` in `ProductionConfig`; no Flask interactive debugger or stack traces exposed.
- **Secrets in git** — no hardcoded API keys/passwords found in tracked files; no `.env` or `.db` files ever committed.

## Accepted risk (documented, not fixed — infra tradeoff)

- **In-memory JWT blocklist** (`auth_service._BLOCKLIST`) resets on every process restart. Render's free tier sleeps after ~15 min idle, so a token that was explicitly logged-out or invalidated by a password change becomes valid again (until its natural expiry) after the service wakes from sleep or redeploys. This was already a known, documented tradeoff in the code (`# Swap to Redis for production multi-process deployments`). Not fixed here — moving to Redis adds a real infra dependency, out of scope for a review pass. Worth doing before a production launch with real user data.

## Worth a follow-up look (not fixed — low priority / needs more info)

- **Password policy on login** accepts passwords as short as 6 characters (`change_password` correctly requires 8+, but the login field-validation floor is lower). Low impact here since there's no self-serve signup — only 5 seeded accounts exist — but worth tightening if the user base grows.
- **JWT secret length** — local dev showed `InsecureKeyLengthWarning: HMAC key is 31 bytes` (PyJWT recommends ≥32 for HS256). This is almost certainly just a short placeholder in a personal, untracked `.env` — `.env.example` already correctly instructs a 64-char random string, and Render's `SECRET_KEY`/`JWT_SECRET_KEY` use `generateValue: true`. Worth a one-time check that Render's generated values are in fact long enough.

## Methodology

- Manual review of `backend/app/{routes,services,models,config.py,__init__.py}` and every frontend `pages/*.tsx`/`api/*.ts` file that handles auth, user input, or renders data.
- Every fix verified locally before committing: XSS fix via typecheck + manual escaping check; rate limit via a live Flask test-client loop; CORS via a real preflight + POST request inspecting response headers; refresh-token rotation via a full login → refresh → replay-old-token → confirm-401 sequence.
- Full backend smoke-test suite (`backend/tests/test_*.py`, 8 files) re-run after each fix — all green except `test_route.py`, which timed out on its own due to (confirmed, isolated) external OSRM/TomTom flakiness unrelated to any change here.
- Live-tested against `https://lastmeterai.onrender.com` post-deploy: confirmed the
  login rate limit trips at the 6th attempt (`429`) and CORS preflight now returns
  `Access-Control-Allow-Origin: https://lastmeterai-lq6p.vercel.app` (not `*`) with
  no `Access-Control-Allow-Credentials` header — both fixes verified working in
  production, not just locally.

## Out of scope for this pass

- Penetration testing / automated scanning (this was a manual code review).
- The ML model files themselves (not a security surface — see `HANDOFF.md` for the separate synthetic-data-validation gap).
- Redis-backed JWT blocklist migration (see "Accepted risk" above).
