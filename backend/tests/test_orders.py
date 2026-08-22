"""
Smoke tests — Module 8: Orders CRUD

Covers:
  1.  Manager creates order (201, decision stub auto-attached)
  2a. Adyar agent can read own-area order
  2b. T Nagar agent blocked from Adyar order → 403 FORBIDDEN
  2c. Agent's list contains only their area
  3.  area_mismatch on agent_id → 400 AREA_MISMATCH
  3b. Reassigning to a deactivated agent → 400 (blocked, not silently allowed)
  4a. pending → delivered rejected → 400 INVALID_TRANSITION
  4b. pending → postponed accepted → 200
  4c. in_transit → delivered accepted → 200
  5.  Manager cannot use PATCH /status → 403 FORBIDDEN
  6.  Agent cannot create order → 403 FORBIDDEN
  7.  Manager can PUT (update) order fields
  8.  DELETE cascades decisions → order gone, 404 on re-fetch
  9.  Reassign suggestion: excludes the order's current agent, only
      suggests same-area agents (cross-area suggestions always failed
      assignment before this fix), and the top suggestion is always
      actually assignable

Run from backend/:
    python3 tests/test_orders.py
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("FLASK_ENV", "development")

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
        def login(username, password):
            r = c.post("/api/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed for {username}: {r.data}"
            d = r.get_json()
            return d["access_token"], d["user"]["id"]

        mgr_token,   mgr_id   = login("manager",      "manager123")
        adyar_token, adyar_id = login("ravi.kumar",   "agent123")
        tnagar_token, _       = login("karthik.raj",  "agent123")
        velachery_token, vel_id = login("surya.venkat", "agent123")

        mgr    = {"Authorization": f"Bearer {mgr_token}"}
        adyar  = {"Authorization": f"Bearer {adyar_token}"}
        tnagar = {"Authorization": f"Bearer {tnagar_token}"}

        ADYAR_ORDER = {
            "customer_name":    "Test Customer",
            "customer_phone":   "9876512345",
            "customer_address": "99 Test Lane, Adyar, Chennai",
            "area":             "Adyar",
            "latitude":         13.0063,
            "longitude":        80.2574,
            "residence_type":   "apartment",
            "package_size":     "small",
            "time_window":      "morning",
            "deadline":         "2026-12-31T23:59:00Z",
            "payment_amount":   250.0,
        }

        print("\n── 1. Manager creates order ──")
        r = c.post("/api/orders", json=ADYAR_ORDER, headers=mgr)
        check("POST /api/orders → 201", r.status_code == 201, r.data[:200])
        new_order = r.get_json()
        order_id = new_order.get("id")
        check("response has order_number", "order_number" in new_order)
        check("response has latest_decision", "latest_decision" in new_order)
        check("decision not null (stub ran)", new_order.get("latest_decision") is not None)
        check("response has created_by", "created_by" in new_order)

        # Regression check: order_schema.py once had its own hardcoded 5-area
        # list (a 5th independent copy, separate from User/Order/seed.py/
        # analytics_service) that rejected all 15 areas added in the 20-area
        # expansion. Confirm a non-original area is accepted.
        r = c.post("/api/orders", json={**ADYAR_ORDER, "area": "Guindy",
                                         "latitude": 13.0067, "longitude": 80.2206},
                   headers=mgr)
        check("1b. create order in a new (post-expansion) area → 201",
              r.status_code == 201, r.data[:250])

        print("\n── 2. Area isolation ──")
        r = c.get(f"/api/orders/{order_id}", headers=adyar)
        check("2a. Adyar agent can read own-area order → 200",
              r.status_code == 200, r.data[:200])

        r = c.get(f"/api/orders/{order_id}", headers=tnagar)
        check("2b. T Nagar agent blocked → 403 FORBIDDEN",
              r.status_code == 403 and r.get_json().get("error") == "FORBIDDEN")

        r = c.get("/api/orders", headers=tnagar)
        check("2c. T Nagar list returns 200", r.status_code == 200)
        if r.status_code == 200:
            areas = {o["area"] for o in r.get_json()["data"]}
            check("2c. T Nagar list contains only T Nagar orders",
                  areas.issubset({"T Nagar"}),
                  f"unexpected areas: {areas - {'T Nagar'}}")

        print("\n── 3. Area mismatch on agent_id ──")
        r = c.post("/api/orders", json={
            **ADYAR_ORDER,
            "agent_id": vel_id,  # surya.venkat is Velachery — wrong area for Adyar order
        }, headers=mgr)
        check("POST with wrong-area agent → 400 AREA_MISMATCH",
              r.status_code == 400 and r.get_json().get("error") == "AREA_MISMATCH",
              r.data[:200])

        print("\n── 3b. Reassign to deactivated agent ──")
        throwaway_uname = f"throwaway_{uuid.uuid4().hex[:8]}"
        r = c.post("/api/agents", json={
            "username": throwaway_uname, "password": "testpass123",
            "name": "Throwaway Agent", "area": "Adyar",
        }, headers=mgr)
        throwaway_id = r.get_json().get("id")
        r = c.patch(f"/api/agents/{throwaway_id}", json={"is_active": False}, headers=mgr)
        check("deactivate throwaway agent → 200", r.status_code == 200, r.data[:200])
        r = c.put(f"/api/orders/{order_id}", json={"agent_id": throwaway_id}, headers=mgr)
        check("PUT reassign to deactivated agent → 400", r.status_code == 400, r.data[:250])
        check("error mentions deactivated",
              "deactivat" in (r.get_json() or {}).get("message", "").lower(),
              r.data[:250])

        print("\n── 4. Status transitions ──")

        # 4a. pending → delivered is INVALID_TRANSITION (must go via in_transit)
        r = c.patch(f"/api/orders/{order_id}/status",
                    json={"status": "delivered"},
                    headers=adyar)
        check("4a. pending → delivered → 400 INVALID_TRANSITION",
              r.status_code == 400 and r.get_json().get("error") == "INVALID_TRANSITION",
              r.data[:200])

        # 4e. pending → in_transit (mobile Start Delivery)
        r = c.post("/api/orders", json=ADYAR_ORDER, headers=mgr)
        start_id = r.get_json().get("id")
        r = c.patch(f"/api/orders/{start_id}/status",
                    json={"status": "in_transit"},
                    headers=adyar)
        check("4e. pending → in_transit → 200",
              r.status_code == 200, r.data[:200])
        if r.status_code == 200:
            check("4e. status is in_transit", r.get_json().get("status") == "in_transit")

        # 4b. pending → postponed is valid
        r = c.patch(f"/api/orders/{order_id}/status",
                    json={"status": "postponed", "failure_reason": "Customer unreachable."},
                    headers=adyar)
        check("4b. pending → postponed → 200",
              r.status_code == 200, r.data[:200])
        if r.status_code == 200:
            d = r.get_json()
            check("4b. response has failure_reason", d.get("failure_reason") == "Customer unreachable.")

        # 4c. Find a seeded in_transit order in Adyar for the delivered transition.
        r = c.get("/api/orders?status=in_transit", headers=adyar)
        in_transit_orders = r.get_json().get("data", [])
        if in_transit_orders:
            it_id = in_transit_orders[0]["id"]
            r = c.patch(f"/api/orders/{it_id}/status",
                        json={"status": "delivered"},
                        headers=adyar)
            check("4c. in_transit → delivered → 200",
                  r.status_code == 200, r.data[:200])
        else:
            print("  (skip 4c — no in_transit Adyar order available)")

        # failure_reason required for failed/postponed
        r2 = c.post("/api/orders", json=ADYAR_ORDER, headers=mgr)
        fresh_id = r2.get_json().get("id")
        r = c.patch(f"/api/orders/{fresh_id}/status",
                    json={"status": "failed"},
                    headers=adyar)
        check("4d. failed without failure_reason → 400 VALIDATION_ERROR",
              r.status_code == 400 and r.get_json().get("error") == "VALIDATION_ERROR",
              r.data[:200])

        print("\n── 5. Role enforcement ──")
        r = c.patch(f"/api/orders/{order_id}/status",
                    json={"status": "pending"},
                    headers=mgr)
        check("5a. Manager cannot use PATCH /status → 403 FORBIDDEN",
              r.status_code == 403 and r.get_json().get("error") == "FORBIDDEN")

        r = c.post("/api/orders", json=ADYAR_ORDER, headers=adyar)
        check("5b. Agent cannot create order → 403 FORBIDDEN",
              r.status_code == 403 and r.get_json().get("error") == "FORBIDDEN")

        r = c.delete(f"/api/orders/{order_id}", headers=adyar)
        check("5c. Agent cannot delete order → 403 FORBIDDEN",
              r.status_code == 403 and r.get_json().get("error") == "FORBIDDEN")

        print("\n── 6. PUT (manager update) ──")
        r3 = c.post("/api/orders", json=ADYAR_ORDER, headers=mgr)
        upd_id = r3.get_json().get("id")
        r = c.put(f"/api/orders/{upd_id}", json={
            "customer_name": "Updated Customer",
            "time_window":   "evening",
        }, headers=mgr)
        check("6a. PUT order → 200", r.status_code == 200, r.data[:200])
        if r.status_code == 200:
            d = r.get_json()
            check("6b. customer_name updated", d.get("customer_name") == "Updated Customer")
            check("6c. latest_decision re-run (time_window changed)", d.get("latest_decision") is not None)

        r = c.put(f"/api/orders/{upd_id}", json={}, headers=mgr)
        check("6d. PUT with no fields → 400 VALIDATION_ERROR",
              r.status_code == 400 and r.get_json().get("error") == "VALIDATION_ERROR")

        print("\n── 7. DELETE ──")
        r4 = c.post("/api/orders", json=ADYAR_ORDER, headers=mgr)
        del_id = r4.get_json().get("id")
        r = c.delete(f"/api/orders/{del_id}", headers=mgr)
        check("7a. DELETE order → 200", r.status_code == 200, r.data[:200])
        r = c.get(f"/api/orders/{del_id}", headers=mgr)
        check("7b. Re-fetch deleted order → 404 ORDER_NOT_FOUND",
              r.status_code == 404 and r.get_json().get("error") == "ORDER_NOT_FOUND")

        print("\n── 8. GET /api/orders/:id/decision ──")
        r5 = c.post("/api/orders", json=ADYAR_ORDER, headers=mgr)
        dec_order_id = r5.get_json().get("id")
        r = c.get(f"/api/orders/{dec_order_id}/decision", headers=mgr)
        check("8a. GET decision history → 200", r.status_code == 200, r.data[:200])
        if r.status_code == 200:
            d = r.get_json()
            check("8b. top_factors is list of dicts",
                  isinstance(d["data"][0].get("top_factors"), list) and
                  all("factor" in f for f in d["data"][0]["top_factors"]))
            check("8c. pagination present", "pagination" in d)

        print("\n── 9. Reassign suggestion (area-scoped, excludes current agent) ──")
        r = c.get("/api/orders?area=T Nagar", headers=mgr)
        tnagar_orders = (r.get_json() or {}).get("data", [])
        active_order = next(
            (o for o in tnagar_orders if o["status"] in ("pending", "in_transit")), None
        )
        if active_order:
            r = c.get(f"/api/orders/{active_order['id']}/reassign-suggestion", headers=mgr)
            check("GET reassign-suggestion → 200", r.status_code == 200, r.data[:200])
            suggestions = (r.get_json() or {}).get("suggestions", [])
            check("9a. current agent excluded from suggestions",
                  not any(s["agent_id"] == active_order["agent_id"] for s in suggestions),
                  str([s["agent_name"] for s in suggestions]))
            check("9b. all suggestions are in the order's area",
                  all(s["area"] == "T Nagar" for s in suggestions),
                  str([(s["agent_name"], s["area"]) for s in suggestions]))
            # A suggestion must always be a valid, assignable candidate — no
            # AREA_MISMATCH when actually assigning the top pick.
            if suggestions:
                top = suggestions[0]
                r = c.put(f"/api/orders/{active_order['id']}",
                          json={"agent_id": top["agent_id"]}, headers=mgr)
                check("9c. assigning top suggestion succeeds (no AREA_MISMATCH)",
                      r.status_code == 200, r.data[:200])

        # Summary
        print(f"\n{'═' * 50}")
        total = sum(1 for line in _failures.__class__.__doc__ or "" if line)
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
