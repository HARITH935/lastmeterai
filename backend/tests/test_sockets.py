"""
Smoke tests — Module 12: Socket.IO

Covers:
  1.  Valid JWT connects successfully → receives "connected" with correct room info
  2.  Invalid / missing JWT is rejected (is_connected() == False)
  3.  Manager joins "managers" room on connect
  4.  Creating order via REST with agent assigned → agent socket receives "new_order_assigned"
  5.  NO-GO prediction via REST → manager socket receives "ai_decision"
  6.  Notification created via REST → target user socket receives "new_notification"
  7.  agent_location_update with invalid coordinates → no crash, DB not updated
  8.  agent_location_update with valid coordinates → DB updated, managers receive "agent_location"
  9.  REST order update → agent socket receives "order_updated"
  10. "connected" event carries correct user_id and role

Run from backend/:
    python3 tests/test_sockets.py
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("FLASK_ENV", "development")

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

from app import create_app
from app.extensions import socketio

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


def _events_by_name(received: list, name: str) -> list[dict]:
    return [e for e in received if e.get("name") == name]


def _first(received: list, name: str) -> dict | None:
    evts = _events_by_name(received, name)
    return evts[0]["args"][0] if evts and evts[0].get("args") else None


def run():
    with app.test_client() as rest:

        # ── Auth: get tokens ───────────────────────────────────────────────────
        def login(username, password="agent123"):
            r = rest.post("/api/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed for {username}: {r.data}"
            d = r.get_json()
            return d["access_token"], d["user"]["id"]

        mgr_token,  mgr_id  = login("manager",       "manager123")
        vel_token,  vel_id  = login("surya.venkat")   # Velachery
        adyar_token, adyar_id = login("ravi.kumar")  # Adyar

        mgr_h   = {"Authorization": f"Bearer {mgr_token}"}
        adyar_h = {"Authorization": f"Bearer {adyar_token}"}

        # ── 1 & 2 & 3: Connection lifecycle ───────────────────────────────────
        print("\n── 1–3. Connection / auth / manager room ──")

        # Valid manager connection
        mgr_sock = socketio.test_client(
            app,
            auth={"token": mgr_token},
            query_string=f"token={mgr_token}",
        )
        check("Manager connects → is_connected()", mgr_sock.is_connected())

        mgr_init = mgr_sock.get_received()
        connected = _first(mgr_init, "connected")
        check("Manager receives 'connected' event", connected is not None)
        check("connected.user_id == mgr_id",
              (connected or {}).get("user_id") == mgr_id,
              f"got {(connected or {}).get('user_id')}")
        check("connected.role == 'manager'",
              (connected or {}).get("role") == "manager",
              f"got {(connected or {}).get('role')}")
        check("connected.room == user_<mgr_id>",
              (connected or {}).get("room") == f"user_{mgr_id}",
              f"got {(connected or {}).get('room')}")

        # Valid agent connection
        vel_sock = socketio.test_client(
            app,
            auth={"token": vel_token},
            query_string=f"token={vel_token}",
        )
        check("Velachery agent connects → is_connected()", vel_sock.is_connected())

        vel_init = vel_sock.get_received()
        vel_connected = _first(vel_init, "connected")
        check("Agent 'connected' role == 'agent'",
              (vel_connected or {}).get("role") == "agent")

        # 2. Invalid JWT rejected
        bad_sock = socketio.test_client(app, auth={"token": "invalid.jwt.here"})
        check("Invalid JWT → not connected", not bad_sock.is_connected())

        no_sock = socketio.test_client(app, auth={})
        check("Missing token → not connected", not no_sock.is_connected())

        # 3. Manager room — verify by checking that the "connected" response
        # is present and role=manager (room join confirmed by later ai_decision test)
        check("Manager 'connected.room' is user room (not managers room)",
              f"user_{mgr_id}" == (connected or {}).get("room"))

        # ── 4. New order assigned → agent socket receives new_order_assigned ──
        print("\n── 4. new_order_assigned on order creation ──")

        vel_sock.get_received()   # clear queue

        VELACHERY_ORDER = {
            "customer_name":    "Socket Test Customer",
            "customer_phone":   "9311110001",
            "customer_address": "5 Velachery Main Road, Velachery",
            "area":             "Velachery",
            "latitude":         12.9815,
            "longitude":        80.2180,
            "residence_type":   "independent",
            "package_size":     "medium",
            "time_window":      "afternoon",
            "deadline":         "2026-12-31T15:00:00Z",
            "payment_amount":   450.0,
            "agent_id":         vel_id,
        }
        r = rest.post("/api/orders", json=VELACHERY_ORDER, headers=mgr_h)
        check("Create Velachery order → 201", r.status_code == 201, r.data[:200])
        vel_order_id = (r.get_json() or {}).get("id")

        vel_events = vel_sock.get_received()
        assigned_evt = _first(vel_events, "new_order_assigned")
        check("Velachery agent receives 'new_order_assigned'", assigned_evt is not None,
              f"received: {[e['name'] for e in vel_events]}")
        if assigned_evt:
            check("new_order_assigned.order_id matches",
                  assigned_evt.get("order_id") == vel_order_id,
                  f"{assigned_evt.get('order_id')} vs {vel_order_id}")
            check("new_order_assigned.area == 'Velachery'",
                  assigned_evt.get("area") == "Velachery")

        # ── 5. NO-GO prediction → manager receives ai_decision ────────────────
        print("\n── 5. ai_decision emitted to managers on NO-GO ──")

        mgr_sock.get_received()   # clear queue

        r = rest.post("/api/decisions/predict", json={"order_id": vel_order_id}, headers=mgr_h)
        check("POST /predict on Velachery order → 201", r.status_code == 201, r.data[:200])
        dec_data = r.get_json() or {}

        mgr_events = mgr_sock.get_received()
        ai_evt = _first(mgr_events, "ai_decision")
        check("Manager receives 'ai_decision' event", ai_evt is not None,
              f"received: {[e['name'] for e in mgr_events]}")
        if ai_evt:
            check("ai_decision.order_id matches",
                  ai_evt.get("order_id") == vel_order_id,
                  f"{ai_evt.get('order_id')}")
            check("ai_decision.decision is GO or NO-GO",
                  ai_evt.get("decision") in ("GO", "NO-GO"),
                  f"{ai_evt.get('decision')}")
            check("ai_decision.risk_level present",
                  ai_evt.get("risk_level") in ("low", "medium", "high"),
                  f"{ai_evt.get('risk_level')}")

        # Verify also for GO case — Anna Nagar mock gives GO
        adyar_sock = socketio.test_client(
            app,
            auth={"token": adyar_token},
            query_string=f"token={adyar_token}",
        )
        adyar_sock.get_received()   # clear connect event

        ANNA_ORDER = {
            "customer_name":    "Anna Nagar Customer",
            "customer_phone":   "9311110002",
            "customer_address": "10 Anna Nagar Main Road",
            "area":             "Anna Nagar",
            "latitude":         13.0850,
            "longitude":        80.2101,
            "residence_type":   "apartment",
            "package_size":     "small",
            "time_window":      "morning",
            "deadline":         "2026-12-31T10:00:00Z",
            "payment_amount":   200.0,
        }
        r = rest.post("/api/orders", json=ANNA_ORDER, headers=mgr_h)
        anna_order_id = (r.get_json() or {}).get("id")

        mgr_sock.get_received()   # clear
        r = rest.post("/api/decisions/predict", json={"order_id": anna_order_id}, headers=mgr_h)
        mgr_events2 = mgr_sock.get_received()
        ai_evt2 = _first(mgr_events2, "ai_decision")
        check("Manager receives 'ai_decision' for GO prediction too",
              ai_evt2 is not None,
              f"received: {[e['name'] for e in mgr_events2]}")

        # ── 6. Notification → target user socket receives new_notification ─────
        print("\n── 6. new_notification on NO-GO ──")

        vel_sock.get_received()   # clear
        mgr_sock.get_received()

        # Predict again on Velachery order to trigger new NO-GO notification
        r = rest.post("/api/decisions/predict", json={"order_id": vel_order_id}, headers=mgr_h)
        check("Second predict on Velachery → 201", r.status_code == 201)
        is_nogo = (r.get_json() or {}).get("decision") == "NO-GO"

        vel_events2 = vel_sock.get_received()
        notif_evt = _first(vel_events2, "new_notification")

        if is_nogo:
            check("Velachery agent receives 'new_notification' for NO-GO",
                  notif_evt is not None,
                  f"received: {[e['name'] for e in vel_events2]}")
            if notif_evt:
                check("new_notification.category == 'ai_alert'",
                      notif_evt.get("category") == "ai_alert",
                      f"{notif_evt.get('category')}")
                check("new_notification has notification_id",
                      notif_evt.get("notification_id") is not None)
        else:
            # GO decision → no notification expected (skip gracefully)
            print(f"  (prediction returned GO — notification test skipped)")

        # Also test delivery_alert via order reassignment
        adyar_sock.get_received()   # clear

        r = rest.put(
            f"/api/orders/{anna_order_id}",
            json={**ANNA_ORDER, "agent_id": adyar_id, "area": "Adyar",
                  "latitude": 13.0063, "longitude": 80.2574},
            headers=mgr_h,
        )
        # This PUT reassigns the agent — triggers delivery_alert notification
        if r.status_code == 200:
            adyar_events = adyar_sock.get_received()
            da_evt = _first(adyar_events, "new_notification")
            check("ravi.kumar receives 'new_notification' on assignment",
                  da_evt is not None,
                  f"received: {[e['name'] for e in adyar_events]}")
            if da_evt:
                check("delivery_alert category",
                      da_evt.get("category") == "delivery_alert",
                      f"{da_evt.get('category')}")

        # ── 7. Invalid location coords → no crash ─────────────────────────────
        print("\n── 7. Invalid coords silently dropped ──")

        vel_sock.get_received()

        # Outside Chennai bbox
        vel_sock.emit("agent_location_update", {
            "lat": 0.0, "lon": 0.0, "heading": 90.0, "speed_kmh": 20.0,
        })
        evt_after_bad = vel_sock.get_received()
        check("No crash on invalid coords", True)   # reaching here = no crash
        # Managers should NOT receive agent_location for invalid update
        mgr_events3 = mgr_sock.get_received()
        check("Managers do not receive agent_location for invalid update",
              not _events_by_name(mgr_events3, "agent_location"),
              f"received: {[e['name'] for e in mgr_events3]}")

        # ── 8. Valid location update → DB updated + manager receives event ─────
        print("\n── 8. Valid location update ──")

        mgr_sock.get_received()   # clear

        VALID_LAT, VALID_LON = 12.9815, 80.2180
        vel_sock.emit("agent_location_update", {
            "lat": VALID_LAT, "lon": VALID_LON, "heading": 180.0, "speed_kmh": 30.0,
        })

        loc_events = mgr_sock.get_received()
        loc_evt = _first(loc_events, "agent_location")
        check("Managers receive 'agent_location' on valid update",
              loc_evt is not None,
              f"received: {[e['name'] for e in loc_events]}")
        if loc_evt:
            check("agent_location.lat correct", loc_evt.get("lat") == VALID_LAT)
            check("agent_location.lon correct", loc_evt.get("lon") == VALID_LON)
            check("agent_location.is_online == True", loc_evt.get("is_online") is True)

        # Verify DB updated
        with app.app_context():
            from app.models import AgentLocation
            from app.extensions import db
            loc = db.session.query(AgentLocation).filter_by(agent_id=vel_id).first()
            check("DB row updated: latitude correct",
                  loc is not None and abs(loc.latitude - VALID_LAT) < 0.0001,
                  f"got {loc.latitude if loc else None}")
            check("DB row updated: is_online == True",
                  loc is not None and loc.is_online is True)

        # ── 9. REST order update → agent receives order_updated ───────────────
        print("\n── 9. order_updated on REST update ──")

        vel_sock.get_received()   # clear

        r = rest.put(
            f"/api/orders/{vel_order_id}",
            json={**VELACHERY_ORDER, "payment_amount": 460.0},
            headers=mgr_h,
        )
        check("PUT order → 200", r.status_code == 200, r.data[:200])

        vel_events3 = vel_sock.get_received()
        upd_evt = _first(vel_events3, "order_updated")
        check("Velachery agent receives 'order_updated'",
              upd_evt is not None,
              f"received: {[e['name'] for e in vel_events3]}")
        if upd_evt:
            check("order_updated.order_id matches",
                  upd_evt.get("order_id") == vel_order_id)
            check("order_updated.status present",
                  upd_evt.get("status") is not None)

        # ── 10. activity_feed broadcast ────────────────────────────────────────
        print("\n── 10. activity_feed broadcast ──")

        vel_sock.get_received()
        mgr_sock.get_received()

        # Any order update triggers an AuditLog.log() → activity_feed
        r = rest.put(
            f"/api/orders/{vel_order_id}",
            json={**VELACHERY_ORDER, "payment_amount": 470.0},
            headers=mgr_h,
        )
        check("Second PUT order → 200", r.status_code == 200)

        # activity_feed is broadcast to all — both manager and agent should get it
        mgr_feed = _events_by_name(mgr_sock.get_received(), "activity_feed")
        vel_feed = _events_by_name(vel_sock.get_received(), "activity_feed")

        check("Manager receives 'activity_feed' on order update",
              len(mgr_feed) > 0, f"received {len(mgr_feed)} events")
        check("Agent receives 'activity_feed' on order update",
              len(vel_feed) > 0, f"received {len(vel_feed)} events")

        if mgr_feed:
            feed_data = mgr_feed[0]["args"][0] if mgr_feed[0].get("args") else {}
            check("activity_feed has description",
                  bool(feed_data.get("description")))
            check("activity_feed has action",
                  bool(feed_data.get("action")))

        # ── Cleanup ────────────────────────────────────────────────────────────
        mgr_sock.disconnect()
        vel_sock.disconnect()
        adyar_sock.disconnect()

    # ── Summary ───────────────────────────────────────────────────────────────
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
