"""
Smoke tests — Agent provisioning (/api/agents/*).

Covers:
  1.  GET /api/agents (manager) → 200, list includes seeded agents
  2.  GET /api/agents (agent role) → 403 FORBIDDEN
  3.  POST /api/agents (manager) → 201, agent created with correct fields
  4.  Newly created agent can log in with the password the manager set
  5.  Newly created agent immediately appears in GET /api/agents
  6.  Duplicate username → 400 VALIDATION_ERROR
  7.  Invalid area → 400 VALIDATION_ERROR
  8.  Short password → 400 VALIDATION_ERROR
  9.  POST /api/agents (agent role) → 403 FORBIDDEN
  10. Missing auth → 401

Run from backend/:
    python3 tests/test_agents.py
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
        def login(username, password):
            r = c.post("/api/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed for {username}: {r.data}"
            return r.get_json()["access_token"]

        def get(path, token):
            return c.get(path, headers={"Authorization": f"Bearer {token}"})

        def post(path, token, body):
            return c.post(path, json=body, headers={"Authorization": f"Bearer {token}"})

        mgr_token   = login("manager", "manager123")
        agent_token = login("ravi.kumar", "agent123")

        # ── 1. Manager can list ────────────────────────────────────────────────
        print("\n── 1. List agents (manager) ──")
        r = get("/api/agents", mgr_token)
        check("GET /api/agents → 200", r.status_code == 200, r.data[:200])
        agents = (r.get_json() or {}).get("agents") or []
        check("at least 5 seeded agents", len(agents) >= 5, f"count={len(agents)}")

        # ── 2. Agent forbidden from listing ────────────────────────────────────
        print("\n── 2. Role guard (list) ──")
        r = get("/api/agents", agent_token)
        check("agent → 403", r.status_code == 403, r.data[:120])

        # ── 3. Create a new agent ──────────────────────────────────────────────
        print("\n── 3. Create agent ──")
        uname = f"test_agent_{uuid.uuid4().hex[:8]}"
        body = {
            "username": uname, "password": "testpass123",
            "name": "Test Agent", "area": "T Nagar", "phone": "9876543210",
        }
        r = post("/api/agents", mgr_token, body)
        check("POST /api/agents → 201", r.status_code == 201, r.data[:300])
        created = r.get_json() or {}
        check("role is agent", created.get("role") == "agent", f"got {created.get('role')}")
        check("area is T Nagar", created.get("area") == "T Nagar")
        check("username matches", created.get("username") == uname)
        check("no password_hash leaked", "password_hash" not in created)

        # ── 4. New agent can log in ────────────────────────────────────────────
        print("\n── 4. New agent can log in ──")
        r = c.post("/api/auth/login", json={"username": uname, "password": "testpass123"})
        check("new agent login → 200", r.status_code == 200, r.data[:200])

        # ── 5. New agent appears in the list ───────────────────────────────────
        print("\n── 5. New agent appears in list ──")
        r = get("/api/agents", mgr_token)
        names = [a["username"] for a in (r.get_json() or {}).get("agents") or []]
        check("new agent in list", uname in names)

        # ── 6. Duplicate username ──────────────────────────────────────────────
        print("\n── 6. Duplicate username ──")
        r = post("/api/agents", mgr_token, body)
        check("duplicate username → 400", r.status_code == 400, r.data[:200])

        # ── 7. Invalid area ─────────────────────────────────────────────────────
        print("\n── 7. Invalid area ──")
        bad = {**body, "username": f"test_agent_{uuid.uuid4().hex[:8]}", "area": "Mumbai"}
        r = post("/api/agents", mgr_token, bad)
        check("invalid area → 400", r.status_code == 400, r.data[:200])

        # ── 8. Short password ───────────────────────────────────────────────────
        print("\n── 8. Short password ──")
        bad2 = {**body, "username": f"test_agent_{uuid.uuid4().hex[:8]}", "password": "short"}
        r = post("/api/agents", mgr_token, bad2)
        check("short password → 400", r.status_code == 400, r.data[:200])

        # ── 9. Agent role forbidden from creating ──────────────────────────────
        print("\n── 9. Role guard (create) ──")
        r = post("/api/agents", agent_token, {**body, "username": f"test_agent_{uuid.uuid4().hex[:8]}"})
        check("agent → 403", r.status_code == 403, r.data[:120])

        # ── 10. No auth ─────────────────────────────────────────────────────────
        print("\n── 10. No auth ──")
        r = c.get("/api/agents")
        check("missing auth → 401", r.status_code == 401, r.data[:120])

    print("\n" + "─" * 50)
    if _failures:
        print(f"  {FAIL}  {len(_failures)} check(s) failed.")
        print("═" * 50)
        sys.exit(1)
    print(f"  {PASS}  All smoke tests passed.")
    print("═" * 50)


if __name__ == "__main__":
    run()
