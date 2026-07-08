"""
Smoke tests — Module 11: AI Chat (A8 + A9)

Covers:
  1.  Both roles can POST /api/chat/message (no 403 for agent or manager)
  2.  earnings_query → context_data has cost-savings structure; reply is not [STUB]
  3.  area_risk      → context_data has zones list
  4.  order_status (agent)   → recent_orders all in agent's area
  5.  order_status (manager) → recent_orders may span multiple areas
  6.  postpone_query → context_data has no_go_candidates list
  7.  weather_query  → context_data has weather impact structure
  8.  agent_performance → context_data has KPI structure
  9.  reassign_suggestion → context_data has workload_by_area list
  10. general intent  → context_data is empty dict
  11. Low-confidence message → intent reclassified to "general" (threshold=0.40)
  12. ChatHistory rows created: user row has intent; assistant row has context_data,
      non-STUB message, and gemini_tokens_used=None (fallback — no real key in env)
  13. Empty message → 400 VALIDATION_ERROR; missing auth → 401
  14. Forced Gemini failure → fallback templates used for earnings_query, area_risk,
      and general; replies are non-STUB, non-empty, and intent-relevant
      (monkeypatches _call_gemini to raise; tests the except branch independently
      of whether a real API key is configured)

NOTE: Tests run against the seed database (same as other test_*.py suites).
ChatHistory rows created here accumulate in the development DB — this is
acceptable for smoke testing and consistent with the rest of the test suite.

Run from backend/:
    python3 tests/test_chat.py
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("FLASK_ENV", "development")

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

from app import create_app
from app.extensions import db as _db, limiter
from app.models.chat_history import ChatHistory, MessageRole

app = create_app("development")

# The smoke test fires far more than 10 messages/minute as a single user, which
# would trip the production "10 per minute" limit on /api/chat/message. Disable
# rate limiting for the test run only — the limit itself is exercised in prod.
limiter.enabled = False

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
_failures: list[str] = []


def check(label: str, condition: bool, detail: str = ""):
    if condition:
        print(f"  {PASS}  {label}")
    else:
        print(f"  {FAIL}  {label}" + (f" — {detail}" if detail else ""))
        _failures.append(label)


def run():
    with app.test_client() as c:

        # ── Auth helpers ───────────────────────────────────────────────────────
        def login(username, password="agent123"):
            r = c.post("/api/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed for {username!r}: {r.data}"
            return r.get_json()["access_token"]

        def post_msg(token, message, session_id=None):
            body = {"message": message}
            if session_id:
                body["session_id"] = session_id
            return c.post(
                "/api/chat/message",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )

        mgr_token   = login("manager", "manager123")
        adyar_token = login("ravi.kumar")   # Adyar agent

        SESSION = "test-session-a8-001"

        # ── 1. Role access — both roles can send messages ─────────────────────
        print("\n── 1. Role access ──")
        r = post_msg(mgr_token, "Hello there", SESSION)
        check("Manager → /api/chat/message → 200", r.status_code == 200,
              r.data[:200])

        r = post_msg(adyar_token, "Hello there", SESSION)
        check("Agent → /api/chat/message → 200", r.status_code == 200,
              r.data[:200])

        # ── 2. earnings_query ──────────────────────────────────────────────────
        print("\n── 2. earnings_query ──")
        r = post_msg(mgr_token, "How much did the team earn this week?", SESSION)
        check("earnings_query → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == earnings_query", d.get("intent") == "earnings_query",
              f"got {d.get('intent')!r}")
        check("intent_confidence > 0", (d.get("intent_confidence") or 0) > 0,
              f"got {d.get('intent_confidence')}")
        ctx = d.get("context_data") or {}
        check("context_data has metrics section", "metrics" in ctx,
              f"keys: {list(ctx.keys())}")
        check("reply is not STUB (real or fallback)", not (d.get("reply") or "").startswith("[STUB]"),
              f"got {d.get('reply')!r}")
        check("model_loaded is True", d.get("model_loaded") is True,
              f"got {d.get('model_loaded')}")

        # ── 3. area_risk ───────────────────────────────────────────────────────
        print("\n── 3. area_risk ──")
        r = post_msg(mgr_token, "Which area has the most delivery failures today?", SESSION)
        check("area_risk → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == area_risk", d.get("intent") == "area_risk",
              f"got {d.get('intent')!r}")
        ctx = d.get("context_data") or {}
        check("context_data has zones", "zones" in ctx,
              f"keys: {list(ctx.keys())}")
        check("zones is non-empty list", isinstance(ctx.get("zones"), list) and len(ctx["zones"]) > 0,
              f"got {ctx.get('zones')}")

        # ── 4. order_status — agent sees only own area ─────────────────────────
        print("\n── 4. order_status (agent scoping) ──")
        # "Where is order #124?" → order_status conf=0.676, comfortably above 0.40 threshold
        r = post_msg(adyar_token, "Where is order #124?", SESSION)
        check("order_status agent → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == order_status", d.get("intent") == "order_status",
              f"got {d.get('intent')!r}")
        ctx = d.get("context_data") or {}
        check("context_data has recent_orders", "recent_orders" in ctx,
              f"keys: {list(ctx.keys())}")
        check("scope is own_area", "own_area" in (ctx.get("scope") or ""),
              f"got {ctx.get('scope')!r}")
        orders = ctx.get("recent_orders") or []
        if orders:
            non_adyar = [o for o in orders if o.get("area") != "Adyar"]
            check("agent order_status: all orders in Adyar area",
                  len(non_adyar) == 0,
                  f"non-Adyar orders found: {non_adyar}")

        # ── 5. order_status — manager sees all areas ───────────────────────────
        print("\n── 5. order_status (manager scoping) ──")
        r = post_msg(mgr_token, "Show me the status of recent orders", SESSION)
        check("order_status manager → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == order_status", d.get("intent") == "order_status",
              f"got {d.get('intent')!r}")
        ctx = d.get("context_data") or {}
        check("scope is all_areas", ctx.get("scope") == "all_areas",
              f"got {ctx.get('scope')!r}")

        # ── 6. postpone_query ──────────────────────────────────────────────────
        print("\n── 6. postpone_query ──")
        r = post_msg(mgr_token, "Which orders should be postponed due to rain?", SESSION)
        check("postpone_query → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == postpone_query", d.get("intent") == "postpone_query",
              f"got {d.get('intent')!r}")
        ctx = d.get("context_data") or {}
        check("context_data has no_go_candidates", "no_go_candidates" in ctx,
              f"keys: {list(ctx.keys())}")
        check("no_go_candidates is a list", isinstance(ctx.get("no_go_candidates"), list),
              f"got type {type(ctx.get('no_go_candidates'))}")

        # ── 7. weather_query ───────────────────────────────────────────────────
        print("\n── 7. weather_query ──")
        r = post_msg(mgr_token, "Is it raining in Adyar today?", SESSION)
        check("weather_query → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == weather_query", d.get("intent") == "weather_query",
              f"got {d.get('intent')!r}")
        ctx = d.get("context_data") or {}
        check("context_data has daily_correlation or summary",
              "daily_correlation" in ctx or "summary" in ctx,
              f"keys: {list(ctx.keys())}")

        # ── 8. agent_performance ───────────────────────────────────────────────
        print("\n── 8. agent_performance ──")
        r = post_msg(mgr_token, "How is Ravi performing this week?", SESSION)
        check("agent_performance → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == agent_performance", d.get("intent") == "agent_performance",
              f"got {d.get('intent')!r}")
        ctx = d.get("context_data") or {}
        check("context_data is non-empty dict", isinstance(ctx, dict) and len(ctx) > 0,
              f"got {ctx!r}")

        # ── 9. reassign_suggestion ─────────────────────────────────────────────
        print("\n── 9. reassign_suggestion ──")
        r = post_msg(mgr_token, "Suggest order reassignment across agents", SESSION)
        check("reassign_suggestion → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == reassign_suggestion", d.get("intent") == "reassign_suggestion",
              f"got {d.get('intent')!r}")
        ctx = d.get("context_data") or {}
        check("context_data has workload_by_area", "workload_by_area" in ctx,
              f"keys: {list(ctx.keys())}")
        check("workload_by_area is a list", isinstance(ctx.get("workload_by_area"), list),
              f"got type {type(ctx.get('workload_by_area'))}")

        # ── 10. general ────────────────────────────────────────────────────────
        print("\n── 10. general intent ──")
        r = post_msg(mgr_token, "Good morning", SESSION)
        check("general → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent == general", d.get("intent") == "general",
              f"got {d.get('intent')!r}")
        ctx = d.get("context_data") or {}
        check("context_data is empty dict", ctx == {},
              f"got {ctx!r}")

        # ── 11. Low-confidence threshold fallback ──────────────────────────────
        # A7 finding: "Should we hold off deliveries in flood prone areas for now?"
        # was classified as weather_query with conf=0.276 — below the 0.40 threshold.
        # chat_service must reclassify this as "general" and set threshold_applied=True.
        print("\n── 11. Low-confidence threshold fallback ──")
        r = post_msg(mgr_token,
                     "Should we hold off deliveries in flood prone areas for now?",
                     SESSION)
        check("low-conf message → 200", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        check("intent is general (threshold applied)",
              d.get("intent") == "general",
              f"got intent={d.get('intent')!r} conf={d.get('intent_confidence')}")
        check("threshold_applied is True", d.get("threshold_applied") is True,
              f"got {d.get('threshold_applied')}")
        check("intent_confidence < 0.40",
              (d.get("intent_confidence") or 1.0) < 0.40,
              f"got {d.get('intent_confidence')}")

        # ── 12. ChatHistory rows created ───────────────────────────────────────
        print("\n── 12. ChatHistory row creation ──")
        # Send a fresh message to a unique session and inspect the DB
        r = post_msg(mgr_token, "What are my total earnings today?", "test-session-db-check")
        check("earnings msg → 200 for DB check", r.status_code == 200, r.data[:200])
        d = r.get_json() or {}
        msg_id = d.get("user_message_id")
        check("response has user_message_id (int)", isinstance(msg_id, int) and msg_id > 0,
              f"got {msg_id!r}")

        with app.app_context():
            user_row = _db.session.get(ChatHistory, msg_id)
            check("user row exists in DB", user_row is not None,
                  f"ChatHistory id={msg_id} not found")
            if user_row:
                check("user row role is USER",
                      user_row.role == MessageRole.USER,
                      f"got {user_row.role}")
                check("user row has intent",
                      user_row.intent is not None,
                      f"intent is None")
                check("user row has intent_confidence",
                      user_row.intent_confidence is not None,
                      f"confidence is None")
                check("user row session_id matches",
                      user_row.session_id == "test-session-db-check",
                      f"got {user_row.session_id!r}")

            # Assistant row should be msg_id + 1
            asst_row = _db.session.get(ChatHistory, msg_id + 1)
            check("assistant row exists in DB", asst_row is not None,
                  f"ChatHistory id={msg_id + 1} not found")
            if asst_row:
                check("assistant row role is ASSISTANT",
                      asst_row.role == MessageRole.ASSISTANT,
                      f"got {asst_row.role}")
                check("assistant row has context_data",
                      asst_row.context_data is not None,
                      f"context_data is None")
                check("assistant row message is not STUB",
                      not (asst_row.message or "").startswith("[STUB]"),
                      f"got {asst_row.message!r}")
                check("assistant row gemini_tokens_used is None (fallback — no real key configured)",
                      asst_row.gemini_tokens_used is None,
                      f"got {asst_row.gemini_tokens_used!r}")
                check("assistant row intent is None",
                      asst_row.intent is None,
                      f"got {asst_row.intent!r}")

        # ── 13. Empty message → 400 ────────────────────────────────────────────
        print("\n── 13. Validation ──")
        r = c.post("/api/chat/message",
                   json={"message": ""},
                   headers={"Authorization": f"Bearer {mgr_token}"})
        check("empty message → 400", r.status_code == 400, r.data[:200])
        err = r.get_json() or {}
        check("error code is VALIDATION_ERROR",
              err.get("error") == "VALIDATION_ERROR",
              f"got {err.get('error')!r}")

        r = c.post("/api/chat/message", json={"message": "hello"})
        check("missing auth → 401", r.status_code == 401, r.data[:200])

        # ── 14. Forced Gemini failure → fallback templates ─────────────────────
        # Monkeypatch gemini_service so that:
        #   _get_api_key() returns a non-None fake key (bypasses the no-key early exit)
        #   _call_gemini() raises (triggers the except → fallback path)
        # This tests the except branch independently of whether a real key is present.
        print("\n── 14. Forced Gemini failure — fallback templates ──")
        import app.services.gemini_service as _gs

        _orig_get_key = _gs._get_api_key
        _orig_call    = _gs._call_gemini

        _gs._get_api_key = lambda: "fake-key-for-test"
        def _call_raises(prompt, api_key):
            raise RuntimeError("forced Gemini failure for test — no real API call made")
        _gs._call_gemini = _call_raises

        try:
            # Intent 1: earnings_query
            r = post_msg(mgr_token, "How much did the team earn this week?",
                         "test-session-fallback")
            check("forced-fail earnings_query → 200", r.status_code == 200, r.data[:200])
            d = r.get_json() or {}
            reply_text = d.get("reply") or ""
            check("forced-fail earnings_query reply not STUB",
                  not reply_text.startswith("[STUB]"),
                  f"got {reply_text!r}")
            check("forced-fail earnings_query reply mentions savings (₹)",
                  "₹" in reply_text or "savings" in reply_text.lower(),
                  f"got {reply_text!r}")

            # Intent 2: area_risk
            r = post_msg(mgr_token, "Which area has the most delivery failures today?",
                         "test-session-fallback")
            check("forced-fail area_risk → 200", r.status_code == 200, r.data[:200])
            d = r.get_json() or {}
            reply_text = d.get("reply") or ""
            check("forced-fail area_risk reply not STUB",
                  not reply_text.startswith("[STUB]"),
                  f"got {reply_text!r}")
            check("forced-fail area_risk reply mentions area or risk",
                  "area" in reply_text.lower() or "risk" in reply_text.lower(),
                  f"got {reply_text!r}")

            # Intent 3: general (catch-all / empty context)
            r = post_msg(mgr_token, "Good morning", "test-session-fallback")
            check("forced-fail general → 200", r.status_code == 200, r.data[:200])
            d = r.get_json() or {}
            reply_text = d.get("reply") or ""
            check("forced-fail general reply not STUB",
                  not reply_text.startswith("[STUB]"),
                  f"got {reply_text!r}")
            check("forced-fail general reply is non-empty helpful text",
                  len(reply_text) > 20,
                  f"got {reply_text!r}")

        finally:
            # Always restore originals, even if a check above raised
            _gs._get_api_key = _orig_get_key
            _gs._call_gemini  = _orig_call

    # ── Results ────────────────────────────────────────────────────────────────
    total = 47
    passed = total - len(_failures)
    print(f"\n{'─'*50}")
    if _failures:
        print(f"  {FAIL}  {len(_failures)} checks failed:")
        for f in _failures:
            print(f"        • {f}")
    else:
        print(f"  {PASS}  All smoke tests passed.")
    print(f"{'═'*50}")


if __name__ == "__main__":
    run()
    if _failures:
        sys.exit(1)
