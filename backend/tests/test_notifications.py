"""
Smoke tests — Module 11: Notifications

Covers:
  1.  Agent sees only own notifications (user_id isolation)
  2.  unread_counts matches actual unread rows per category
  3.  PATCH /:id/read marks notification read; idempotent on second call
  4.  PATCH /read-all with category filter marks only that category read
  5.  PATCH /read-all without category marks all categories read
  6.  Cross-user: agent cannot read or delete another user's notification → 403
  7.  NO-GO decision auto-creates ai_alert for the assigned agent
  8.  Order reassignment creates delivery_alert for the new agent
  9.  DELETE /:id removes the notification; 404 on second attempt
  10. Pagination + category query param filter

Run from backend/:
    python3 tests/test_notifications.py
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("FLASK_ENV", "development")

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

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

        # ── Auth helpers ───────────────────────────────────────────────────────
        def login(username, password="agent123"):
            r = c.post("/api/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed for {username}: {r.data}"
            d = r.get_json()
            return d["access_token"], d["user"]["id"]

        mgr_token,       mgr_id       = login("manager",       "manager123")
        adyar_token,     adyar_id     = login("ravi.kumar")        # Adyar
        tnagar_token,    tnagar_id    = login("karthik.raj")       # T Nagar
        velachery_token, velachery_id = login("surya.venkat")      # Velachery

        mgr       = {"Authorization": f"Bearer {mgr_token}"}
        adyar     = {"Authorization": f"Bearer {adyar_token}"}
        tnagar    = {"Authorization": f"Bearer {tnagar_token}"}
        velachery = {"Authorization": f"Bearer {velachery_token}"}

        # ── 7-setup: create Velachery order with agent assigned ────────────────
        # This will trigger predict_and_save → NO-GO (heavy rain mock) → ai_alert
        # for surya.venkat.  Count BEFORE so we can verify the delta.
        r = c.get("/api/notifications", headers=velachery)
        velachery_before_total = (r.get_json() or {}).get("pagination", {}).get("total", 0)

        VELACHERY_ORDER = {
            "customer_name":    "Velachery NO-GO Customer",
            "customer_phone":   "9300000001",
            "customer_address": "10 Velachery Main Road, Velachery, Chennai",
            "area":             "Velachery",
            "latitude":         12.9815,
            "longitude":        80.2180,
            "residence_type":   "independent",
            "package_size":     "large",
            "time_window":      "evening",
            "deadline":         "2026-12-31T18:00:00Z",
            "payment_amount":   500.0,
            "agent_id":         velachery_id,
        }
        r = c.post("/api/orders", json=VELACHERY_ORDER, headers=mgr)
        check("Create Velachery order with agent → 201", r.status_code == 201, r.data[:200])
        velachery_order_id = (r.get_json() or {}).get("id")

        # ── 8-setup: create Adyar order without agent, then reassign ──────────
        r = c.get("/api/notifications", headers=adyar)
        adyar_before_total = (r.get_json() or {}).get("pagination", {}).get("total", 0)

        ADYAR_ORDER = {
            "customer_name":    "Adyar Reassign Customer",
            "customer_phone":   "9300000002",
            "customer_address": "20 Adyar Main Road, Adyar, Chennai",
            "area":             "Adyar",
            "latitude":         13.0063,
            "longitude":        80.2574,
            "residence_type":   "apartment",
            "package_size":     "small",
            "time_window":      "morning",
            "deadline":         "2026-12-31T08:00:00Z",
            "payment_amount":   300.0,
        }
        r = c.post("/api/orders", json=ADYAR_ORDER, headers=mgr)
        check("Create Adyar order without agent → 201", r.status_code == 201, r.data[:200])
        adyar_order_id = (r.get_json() or {}).get("id")

        # Reassign order to ravi.kumar → triggers delivery_alert
        r = c.put(
            f"/api/orders/{adyar_order_id}",
            json={**ADYAR_ORDER, "agent_id": adyar_id},
            headers=mgr,
        )
        check("Reassign Adyar order to ravi.kumar → 200", r.status_code == 200, r.data[:200])

        # ── 1. Agent sees only own notifications ───────────────────────────────
        print("\n── 1. Own notifications isolation ──")
        r = c.get("/api/notifications", headers=adyar)
        check("GET /notifications → 200 (ravi.kumar)", r.status_code == 200, r.data[:200])
        adyar_resp = r.get_json() or {}
        adyar_notifs = adyar_resp.get("data", [])

        check("All returned notifications belong to ravi.kumar",
              all(n["user_id"] == adyar_id for n in adyar_notifs),
              str([n["user_id"] for n in adyar_notifs if n["user_id"] != adyar_id]))

        # Pagination shape
        pag = adyar_resp.get("pagination") or {}
        check("pagination has page/per_page/total/pages", all(
            k in pag for k in ("page", "per_page", "total", "pages")
        ))

        # ── 2. unread_counts matches actual unread rows ────────────────────────
        print("\n── 2. unread_counts accuracy ──")
        uc = adyar_resp.get("unread_counts") or {}
        check("unread_counts has all 5 keys",
              all(k in uc for k in ("ai_alert", "delivery_alert", "weather_alert", "system_alert", "total")))

        actual_unread = sum(1 for n in adyar_notifs if not n["is_read"])
        # total count in unread_counts may span multiple pages; check at least ≥ page 1 unreads
        check("unread_counts.total >= unreads on page 1",
              uc.get("total", 0) >= actual_unread,
              f"unread_counts.total={uc.get('total')}, page-1 unreads={actual_unread}")

        # category sum == total
        cat_sum = (
            uc.get("ai_alert", 0) + uc.get("delivery_alert", 0) +
            uc.get("weather_alert", 0) + uc.get("system_alert", 0)
        )
        check("sum of category counts == total", cat_sum == uc.get("total", -1),
              f"sum={cat_sum}, total={uc.get('total')}")

        # ── 3. Mark single notification read + idempotency ────────────────────
        print("\n── 3. Mark single read (idempotent) ──")
        # Find the newest unread notification for ravi.kumar
        r_unread = c.get("/api/notifications?is_read=false", headers=adyar)
        unread_notifs = (r_unread.get_json() or {}).get("data", [])
        check("Unread notifications list non-empty", len(unread_notifs) > 0,
              "No unread notifications for ravi.kumar — run seed.py first")

        if unread_notifs:
            target_id = unread_notifs[0]["id"]

            r = c.patch(f"/api/notifications/{target_id}/read", headers=adyar)
            check("PATCH /:id/read → 200", r.status_code == 200, r.data[:200])
            marked = r.get_json() or {}
            check("is_read == True after mark", marked.get("is_read") is True,
                  f"got {marked.get('is_read')}")
            check("id matches", marked.get("id") == target_id)

            # Idempotent: second call still 200
            r2 = c.patch(f"/api/notifications/{target_id}/read", headers=adyar)
            check("Second PATCH /:id/read → 200 (idempotent)", r2.status_code == 200)
            check("Still is_read == True", (r2.get_json() or {}).get("is_read") is True)

        # ── 4. Mark-all-read with category filter ─────────────────────────────
        print("\n── 4. Mark-all-read with category filter ──")
        # Get unread counts before
        r_before = c.get("/api/notifications?is_read=false", headers=adyar)
        uc_before = (c.get("/api/notifications", headers=adyar).get_json() or {}).get("unread_counts", {})

        r = c.patch("/api/notifications/read-all",
                    json={"category": "delivery_alert"},
                    headers=adyar)
        check("PATCH /read-all with category=delivery_alert → 200",
              r.status_code == 200, r.data[:200])
        result = r.get_json() or {}
        check("response has updated_count", "updated_count" in result)

        # After: delivery_alert unread count should be 0
        r_after = c.get("/api/notifications", headers=adyar)
        uc_after = (r_after.get_json() or {}).get("unread_counts", {})
        check("delivery_alert unread == 0 after category mark-all-read",
              uc_after.get("delivery_alert", 0) == 0,
              f"got {uc_after.get('delivery_alert')}")
        # Other categories untouched (if there were any)
        if uc_before.get("ai_alert", 0) > 0:
            check("ai_alert count unchanged by delivery_alert mark-all-read",
                  uc_after.get("ai_alert") == uc_before.get("ai_alert"),
                  f"before={uc_before.get('ai_alert')}, after={uc_after.get('ai_alert')}")

        # Invalid category → 400
        r = c.patch("/api/notifications/read-all",
                    json={"category": "not_a_category"},
                    headers=adyar)
        check("Invalid category in read-all → 400", r.status_code == 400)

        # ── 5. Mark-all-read without category ────────────────────────────────
        print("\n── 5. Mark-all-read without category ──")
        r = c.patch("/api/notifications/read-all", json={}, headers=adyar)
        check("PATCH /read-all (no category) → 200", r.status_code == 200)

        r_check = c.get("/api/notifications", headers=adyar)
        uc_all_read = (r_check.get_json() or {}).get("unread_counts", {})
        check("unread_counts.total == 0 after mark-all-read",
              uc_all_read.get("total", -1) == 0,
              f"got {uc_all_read.get('total')}")

        # ── 6. Cross-user 403 enforcement ─────────────────────────────────────
        print("\n── 6. Cross-user 403 ──")
        # Get any notification belonging to ravi.kumar
        r_list = c.get("/api/notifications", headers=adyar)
        adyar_all = (r_list.get_json() or {}).get("data", [])

        if adyar_all:
            other_id = adyar_all[0]["id"]

            r = c.patch(f"/api/notifications/{other_id}/read", headers=tnagar)
            check("T Nagar agent cannot read Adyar notification → 403",
                  r.status_code == 403 and
                  (r.get_json() or {}).get("error") == "FORBIDDEN",
                  f"got {r.status_code}")

            r = c.delete(f"/api/notifications/{other_id}", headers=tnagar)
            check("T Nagar agent cannot delete Adyar notification → 403",
                  r.status_code == 403 and
                  (r.get_json() or {}).get("error") == "FORBIDDEN",
                  f"got {r.status_code}")

        # Non-existent notification → 404
        r = c.patch("/api/notifications/999999/read", headers=adyar)
        check("Non-existent notification → 404 NOTIFICATION_NOT_FOUND",
              r.status_code == 404 and
              (r.get_json() or {}).get("error") == "NOTIFICATION_NOT_FOUND")

        # ── 7. NO-GO auto-creates ai_alert for assigned agent ─────────────────
        print("\n── 7. NO-GO notification auto-creation ──")
        r = c.get("/api/notifications", headers=velachery)
        velachery_after_total = (r.get_json() or {}).get("pagination", {}).get("total", 0)

        check("Velachery agent received ≥1 new notification after NO-GO order",
              velachery_after_total > velachery_before_total,
              f"before={velachery_before_total}, after={velachery_after_total}")

        # Verify the newest notification is an ai_alert for the NO-GO
        velachery_notifs = (r.get_json() or {}).get("data", [])
        if velachery_notifs:
            newest = velachery_notifs[0]
            check("Newest notification category == ai_alert",
                  newest.get("category") == "ai_alert",
                  f"got {newest.get('category')}")
            check("Notification title mentions NO-GO",
                  "NO-GO" in (newest.get("title") or ""),
                  f"title={newest.get('title')!r}")
            check("Notification linked to the Velachery order",
                  newest.get("order_id") == velachery_order_id,
                  f"order_id={newest.get('order_id')}, expected={velachery_order_id}")

        # Also verify via POST /predict to trigger a second notification
        r = c.post("/api/decisions/predict",
                   json={"order_id": velachery_order_id},
                   headers=mgr)
        check("POST /predict on Velachery order → 201", r.status_code == 201, r.data[:200])
        predict_dec = r.get_json() or {}
        if predict_dec.get("decision") == "NO-GO":
            r2 = c.get("/api/notifications", headers=velachery)
            after2 = (r2.get_json() or {}).get("pagination", {}).get("total", 0)
            check("Second NO-GO predict → another notification for agent",
                  after2 > velachery_after_total,
                  f"before={velachery_after_total}, after={after2}")

        # ── 8. Reassignment creates delivery_alert for new agent ──────────────
        print("\n── 8. Reassignment delivery_alert ──")
        r = c.get("/api/notifications", headers=adyar)
        adyar_after_total = (r.get_json() or {}).get("pagination", {}).get("total", 0)

        check("ravi.kumar received delivery_alert after reassignment",
              adyar_after_total > adyar_before_total,
              f"before={adyar_before_total}, after={adyar_after_total}")

        # Find the delivery_alert notification for the reassigned order
        r_da = c.get("/api/notifications?category=delivery_alert", headers=adyar)
        da_notifs = (r_da.get_json() or {}).get("data", [])
        check("category=delivery_alert filter returns results",
              len(da_notifs) > 0, f"got {len(da_notifs)}")

        # Check the newest delivery_alert is about the reassigned order
        if da_notifs:
            newest_da = da_notifs[0]
            check("delivery_alert linked to the reassigned order",
                  newest_da.get("order_id") == adyar_order_id,
                  f"order_id={newest_da.get('order_id')}, expected={adyar_order_id}")
            check("delivery_alert title mentions the order",
                  str(adyar_order_id) in str(newest_da.get("title") or "") or
                  "assigned" in (newest_da.get("title") or "").lower(),
                  f"title={newest_da.get('title')!r}")

        # ── 9. DELETE notification ─────────────────────────────────────────────
        print("\n── 9. DELETE notification ──")
        # Get a notification to delete (belongs to ravi.kumar)
        r_list2 = c.get("/api/notifications", headers=adyar)
        adyar_all2 = (r_list2.get_json() or {}).get("data", [])
        if adyar_all2:
            del_id = adyar_all2[-1]["id"]

            r = c.delete(f"/api/notifications/{del_id}", headers=adyar)
            check("DELETE own notification → 200", r.status_code == 200, r.data[:200])

            # Second delete → 404
            r = c.delete(f"/api/notifications/{del_id}", headers=adyar)
            check("Second DELETE → 404 NOTIFICATION_NOT_FOUND",
                  r.status_code == 404 and
                  (r.get_json() or {}).get("error") == "NOTIFICATION_NOT_FOUND")

        # ── 10. Pagination and query param filters ─────────────────────────────
        print("\n── 10. Pagination and filters ──")
        r = c.get("/api/notifications?per_page=2&page=1", headers=adyar)
        check("GET with per_page=2 → 200", r.status_code == 200)
        page1 = r.get_json() or {}
        check("per_page respected", len(page1.get("data", [])) <= 2)
        check("pagination.per_page == 2", (page1.get("pagination") or {}).get("per_page") == 2,
              f"got {(page1.get('pagination') or {}).get('per_page')}")

        # Filter by is_read=false
        r = c.get("/api/notifications?is_read=false", headers=adyar)
        check("GET is_read=false → 200", r.status_code == 200)
        unread_filtered = (r.get_json() or {}).get("data", [])
        check("is_read=false filter: all items are unread",
              all(not n["is_read"] for n in unread_filtered),
              str([n["is_read"] for n in unread_filtered if n["is_read"]]))

        # Filter by is_read=true
        r = c.get("/api/notifications?is_read=true", headers=adyar)
        check("GET is_read=true → 200", r.status_code == 200)
        read_filtered = (r.get_json() or {}).get("data", [])
        check("is_read=true filter: all items are read",
              all(n["is_read"] for n in read_filtered),
              str([n["is_read"] for n in read_filtered if not n["is_read"]]))

        # per_page capped at 50
        r = c.get("/api/notifications?per_page=999", headers=adyar)
        check("per_page capped at 50",
              (r.get_json() or {}).get("pagination", {}).get("per_page", 0) <= 50)

        # ── Summary ────────────────────────────────────────────────────────────
        print(f"\n{'═' * 50}")
        if _failures:
            print(f"  {FAIL}  {len(_failures)} test(s) FAILED:")
            for f in _failures:
                print(f"       • {f}")
        else:
            print(f"  {PASS}  All smoke tests passed.")
        print("═" * 50)

    return len(_failures) == 0


if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
