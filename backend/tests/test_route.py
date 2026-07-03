"""
Smoke tests — B15: Route Optimization

Covers:
  1.  Role enforcement: manager → 403 FORBIDDEN
  2a. Agent GET /api/orders/optimized-route → 200
  2b. Response has all required top-level fields
  2c. Each stop has required fields
  2d. stop.sequence values are consecutive starting at 1
  2e. total_distance_km and total_duration_min are non-negative
  3.  Status change to postponed triggers route recalculation (update_status runs without crash)

Run from backend/:
    python3 tests/test_route.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("FLASK_ENV", "development")

from app import create_app

app = create_app("development")

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
        def login(username, password):
            r = c.post("/api/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed for {username}: {r.data}"
            d = r.get_json()
            return d["access_token"], d["user"]["id"]

        mgr_token,   _       = login("manager",    "manager123")
        adyar_token, adyar_id = login("ravi.kumar", "agent123")

        mgr   = {"Authorization": f"Bearer {mgr_token}"}
        adyar = {"Authorization": f"Bearer {adyar_token}"}

        # ── 1. Role enforcement ────────────────────────────────────────────────
        print("\n── 1. Role enforcement ──")
        r = c.get("/api/orders/optimized-route", headers=mgr)
        check("1a. Manager → 403 FORBIDDEN",
              r.status_code == 403 and r.get_json().get("error") == "FORBIDDEN",
              r.data[:200])

        # No token → 401
        r = c.get("/api/orders/optimized-route")
        check("1b. No token → 401", r.status_code == 401, r.data[:200])

        # ── 2. Agent gets route ────────────────────────────────────────────────
        print("\n── 2. Agent GET /api/orders/optimized-route ──")
        r = c.get("/api/orders/optimized-route", headers=adyar)
        check("2a. → 200", r.status_code == 200, r.data[:300])

        if r.status_code == 200:
            d = r.get_json()

            required_top = [
                "stops", "total_distance_km", "total_duration_min",
                "route_geometry", "start_location", "recalculated_at",
                "traffic_factor", "weather_risk",
            ]
            for field in required_top:
                check(f"2b. has '{field}'", field in d, str(d.keys()))

            check("2c. stops is a list",   isinstance(d.get("stops"),         list))
            check("2d. geometry is a list", isinstance(d.get("route_geometry"), list))
            check("2e. total_distance_km >= 0",
                  isinstance(d.get("total_distance_km"), (int, float)) and
                  d["total_distance_km"] >= 0)
            check("2f. total_duration_min >= 0",
                  isinstance(d.get("total_duration_min"), (int, float)) and
                  d["total_duration_min"] >= 0)
            check("2g. traffic_factor >= 1.0",
                  isinstance(d.get("traffic_factor"), (int, float)) and
                  d["traffic_factor"] >= 1.0)
            check("2h. weather_risk in [0, 1]",
                  isinstance(d.get("weather_risk"), (int, float)) and
                  0.0 <= d["weather_risk"] <= 1.0)

            stops = d.get("stops", [])
            if stops:
                s0 = stops[0]
                required_stop = [
                    "order_id", "order_number", "sequence", "customer_name",
                    "customer_address", "latitude", "longitude", "area",
                    "status", "risk_level", "is_urgent", "eta",
                    "duration_from_prev_min", "distance_from_prev_km",
                ]
                for field in required_stop:
                    check(f"2i. stop has '{field}'", field in s0)

                check("2j. sequences start at 1",        s0["sequence"] == 1)
                check("2k. sequences are consecutive",
                      [s["sequence"] for s in stops] == list(range(1, len(stops) + 1)))
                check("2l. all ETAs are strings",
                      all(isinstance(s["eta"], str) for s in stops))
            else:
                print("  (2i-2l skipped — no stops in route, agent may have no pending orders)")

        # ── 3. Status change triggers route recalculation ──────────────────────
        print("\n── 3. Status change → route_updated triggered ──")
        ADYAR_ORDER = {
            "customer_name":    "Route Test User",
            "customer_phone":   "9900000001",
            "customer_address": "1 Test Street, Adyar, Chennai",
            "area":             "Adyar",
            "latitude":         13.0063,
            "longitude":        80.2574,
            "residence_type":   "apartment",
            "package_size":     "small",
            "time_window":      "morning",
            "deadline":         "2026-12-31T23:59:00Z",
            "payment_amount":   150.0,
        }
        r = c.post("/api/orders", json=ADYAR_ORDER, headers=mgr)
        check("3a. Create Adyar order → 201", r.status_code == 201, r.data[:200])

        if r.status_code == 201:
            test_id = r.get_json()["id"]
            # pending → postponed triggers route recalculation in order_service.update_status
            r = c.patch(
                f"/api/orders/{test_id}/status",
                json={"status": "postponed", "failure_reason": "B15 smoke test."},
                headers=adyar,
            )
            check("3b. pending → postponed → 200 (route_updated emitted async)",
                  r.status_code == 200, r.data[:200])

            # Re-fetch route and confirm it still returns 200 (recalculated)
            r = c.get("/api/orders/optimized-route", headers=adyar)
            check("3c. Route endpoint still → 200 after status change",
                  r.status_code == 200, r.data[:200])

        # ── Summary ────────────────────────────────────────────────────────────
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
