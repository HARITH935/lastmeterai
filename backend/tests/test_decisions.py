"""
Smoke tests — Module 9: Decision Engine

Covers:
  1.  Good conditions (Anna Nagar, morning, small, good payment) → GO, low risk
  2.  Poor conditions (Velachery, evening, large, rain mock) → NO-GO, high risk
  3.  reschedule_suggestion present on NO-GO decision
  4.  top_factors format: list of {factor, contribution} with ≥3 factors
  5.  Order creation (Module 8 flow) now uses real decision_service, not heuristic
      (verified by model_version = 'v1.0-placeholder', NOT the old Module 8 stub)
  6.  Role enforcement: agent cannot call POST /api/decisions/predict → 403
  7.  GET /api/decisions/:id works for manager
  8.  GET /api/decisions/:id blocked for agent from another area → 403

Run from backend/:
    python3 tests/test_decisions.py
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("FLASK_ENV", "development")

# Surface [M9-VERIFY] log so we can see it in output.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from app import create_app
from app.extensions import limiter

app = create_app("development")
# Test suites log in multiple times per run, which can trip the
# production login rate limit (5/min). Disable it for tests only.
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
        # ── Login helpers ──────────────────────────────────────────────────────
        def login(username, password="agent123"):
            r = c.post("/api/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed for {username}: {r.data}"
            d = r.get_json()
            return d["access_token"], d["user"]["id"]

        mgr_token,   mgr_id    = login("manager",      "manager123")
        adyar_token, adyar_id  = login("ravi.kumar")      # Adyar agent
        tnagar_token, _        = login("karthik.raj")      # T Nagar agent

        mgr    = {"Authorization": f"Bearer {mgr_token}"}
        adyar  = {"Authorization": f"Bearer {adyar_token}"}
        tnagar = {"Authorization": f"Bearer {tnagar_token}"}

        # ── Shared order payloads ──────────────────────────────────────────────
        GOOD_ORDER = {
            "customer_name":    "Good Test Customer",
            "customer_phone":   "9444400001",
            "customer_address": "12 Anna Main Road, Anna Nagar, Chennai",
            "area":             "Anna Nagar",
            "latitude":         13.0850,
            "longitude":        80.2101,
            "residence_type":   "apartment",
            "package_size":     "small",
            "time_window":      "morning",
            "deadline":         "2026-12-31T08:00:00Z",
            "payment_amount":   350.0,
        }

        POOR_ORDER = {
            "customer_name":    "Poor Test Customer",
            "customer_phone":   "9555500002",
            "customer_address": "55 Velachery Main Road, Velachery, Chennai",
            "area":             "Velachery",
            "latitude":         12.9810,
            "longitude":        80.2209,
            "residence_type":   "independent",
            "package_size":     "large",
            "time_window":      "evening",
            "deadline":         "2026-12-31T18:00:00Z",
            "payment_amount":   500.0,
        }

        # ── 1. Create orders (verifies Module 8 flow now uses real decision_service) ──
        print("\n── 1-2. Create test orders (Module 8 flow) ──")
        r = c.post("/api/orders", json=GOOD_ORDER, headers=mgr)
        check("Create good-conditions order → 201", r.status_code == 201, r.data[:200])
        good_order = r.get_json()
        good_order_id = good_order.get("id")

        ld = good_order.get("latest_decision") or {}
        check(
            "Module 8 flow uses real model (model_version=v1.0)",
            ld.get("model_version") == "v1.0",
            f"got model_version={ld.get('model_version')!r}"
        )

        r = c.post("/api/orders", json=POOR_ORDER, headers=mgr)
        check("Create poor-conditions order → 201", r.status_code == 201, r.data[:200])
        poor_order_id = r.get_json().get("id")

        # ── 3. POST /api/decisions/predict — good conditions ──────────────────
        print("\n── 3. Good conditions → GO, low risk ──")
        r = c.post("/api/decisions/predict", json={"order_id": good_order_id}, headers=mgr)
        check("POST /predict → 201", r.status_code == 201, r.data[:300])
        good_dec = r.get_json() or {}

        check("decision == 'GO'",
              good_dec.get("decision") == "GO",
              f"got {good_dec.get('decision')!r}")
        check("risk_level == 'low'",
              good_dec.get("risk_level") == "low",
              f"got {good_dec.get('risk_level')!r}, score={good_dec.get('risk_score')}")
        check("success_probability > 0.60",
              (good_dec.get("success_probability") or 0) > 0.60,
              f"got {good_dec.get('success_probability')}")
        check("reschedule_suggestion is null for GO",
              good_dec.get("reschedule_suggestion") is None)
        check("weather_snapshot present",
              isinstance(good_dec.get("weather_snapshot"), dict))
        good_dec_id = good_dec.get("id")

        # ── 4. POST /api/decisions/predict — poor conditions ─────────────────
        print("\n── 4. Poor conditions → NO-GO, high risk ──")
        r = c.post("/api/decisions/predict", json={"order_id": poor_order_id}, headers=mgr)
        check("POST /predict → 201", r.status_code == 201, r.data[:300])
        poor_dec = r.get_json() or {}

        check("decision == 'NO-GO'",
              poor_dec.get("decision") == "NO-GO",
              f"got {poor_dec.get('decision')!r}")
        check("risk_level == 'high'",
              poor_dec.get("risk_level") == "high",
              f"got {poor_dec.get('risk_level')!r}, score={poor_dec.get('risk_score')}")
        check("success_probability < 0.50",
              (poor_dec.get("success_probability") or 1) < 0.50,
              f"got {poor_dec.get('success_probability')}")
        check("risk_score > 60",
              (poor_dec.get("risk_score") or 0) > 60,
              f"got {poor_dec.get('risk_score')}")
        poor_dec_id = poor_dec.get("id")

        # ── 5. reschedule_suggestion on NO-GO ─────────────────────────────────
        print("\n── 5. reschedule_suggestion ──")
        resc = poor_dec.get("reschedule_suggestion")
        check("reschedule_suggestion present on NO-GO",
              isinstance(resc, dict),
              f"got {resc!r}")
        if isinstance(resc, dict):
            check("reschedule has suggested_date",   "suggested_date" in resc)
            check("reschedule has suggested_window",  "suggested_window" in resc)
            check("reschedule has predicted_success_probability",
                  "predicted_success_probability" in resc)
            check("reschedule has reason",            "reason" in resc)
            check("predicted_success_probability > current probability",
                  (resc.get("predicted_success_probability") or 0) >
                  (poor_dec.get("success_probability") or 1),
                  f"resc_prob={resc.get('predicted_success_probability')}, "
                  f"current={poor_dec.get('success_probability')}")

        # ── 6. top_factors format ──────────────────────────────────────────────
        print("\n── 6. top_factors format ──")
        for label, dec in [("good-conditions", good_dec), ("poor-conditions", poor_dec)]:
            tf = dec.get("top_factors") or []
            check(f"{label}: top_factors is a list",
                  isinstance(tf, list), f"got type {type(tf).__name__}")
            check(f"{label}: ≥3 factors returned",
                  len(tf) >= 3, f"got {len(tf)}")
            if tf:
                first = tf[0]
                check(f"{label}: each item has 'factor' key",
                      all("factor" in f for f in tf))
                check(f"{label}: each item has 'contribution' key",
                      all("contribution" in f for f in tf))
                check(f"{label}: all |contribution| >= 5.0",
                      all(abs(f["contribution"]) >= 5.0 for f in tf),
                      str([f["contribution"] for f in tf]))
                check(f"{label}: factors sorted by |contribution| desc",
                      all(abs(tf[i]["contribution"]) >= abs(tf[i+1]["contribution"])
                          for i in range(len(tf)-1)))

        # ── 7. SHAP values stored correctly ───────────────────────────────────
        print("\n── 7. shap_values in Decision row ──")
        check("shap_values present", isinstance(poor_dec.get("shap_values"), dict))
        if isinstance(poor_dec.get("shap_values"), dict):
            sv = poor_dec["shap_values"]
            expected_keys = {
                "weather_risk", "customer_history_score", "traffic_impact",
                "agent_profit_score", "distance_score", "time_of_day_score",
                "package_size_score",
            }
            check("all 7 SHAP factors present", set(sv.keys()) == expected_keys,
                  f"missing={expected_keys - set(sv.keys())}")
            total_abs = sum(abs(v) for v in sv.values())
            check("SHAP values sum to ~100% (±2)", abs(total_abs - 100) < 2,
                  f"sum(|shap|) = {total_abs:.1f}")

        # ── 8. GET /api/decisions/:id ──────────────────────────────────────────
        print("\n── 8. GET /api/decisions/:id ──")
        r = c.get(f"/api/decisions/{good_dec_id}", headers=mgr)
        check("GET /decisions/:id → 200 (manager)", r.status_code == 200, r.data[:200])
        if r.status_code == 200:
            d = r.get_json()
            check("response has top_factors", isinstance(d.get("top_factors"), list))
            check("response has weather_snapshot", isinstance(d.get("weather_snapshot"), dict))

        # Poor-order is in Velachery; Adyar agent should be blocked.
        r = c.get(f"/api/decisions/{poor_dec_id}", headers=adyar)
        check("GET Velachery decision by Adyar agent → 403 FORBIDDEN",
              r.status_code == 403 and r.get_json().get("error") == "FORBIDDEN")

        # ── 9. Role enforcement on /predict ───────────────────────────────────
        print("\n── 9. Role enforcement ──")
        r = c.post("/api/decisions/predict",
                   json={"order_id": good_order_id},
                   headers=adyar)
        check("Agent cannot POST /predict → 403 FORBIDDEN",
              r.status_code == 403 and r.get_json().get("error") == "FORBIDDEN")

        r = c.post("/api/decisions/predict",
                   json={},
                   headers=mgr)
        check("Missing order_id → 400 VALIDATION_ERROR",
              r.status_code == 400 and r.get_json().get("error") == "VALIDATION_ERROR")

        r = c.post("/api/decisions/predict",
                   json={"order_id": 999999},
                   headers=mgr)
        check("Non-existent order_id → 404 ORDER_NOT_FOUND",
              r.status_code == 404 and r.get_json().get("error") == "ORDER_NOT_FOUND")

        # ── 10. factors dict present ──────────────────────────────────────────
        print("\n── 10. Raw factor scores ──")
        factors = good_dec.get("factors") or {}
        check("factors dict present with 7 keys", len(factors) == 7,
              f"got {list(factors.keys())}")
        if factors:
            check("all factor values in [0.0, 1.0]",
                  all(0.0 <= v <= 1.0 for v in factors.values()),
                  str({k: v for k, v in factors.items() if not (0.0 <= v <= 1.0)}))

        # ── Summary ───────────────────────────────────────────────────────────
        print(f"\n{'═' * 50}")
        if _failures:
            print(f"  {FAIL}  {len(_failures)} test(s) FAILED:")
            for f in _failures:
                print(f"       • {f}")
        else:
            print(f"  {PASS}  All smoke tests passed.")
        print('═' * 50)

    return len(_failures) == 0


if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
