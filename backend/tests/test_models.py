"""
Smoke tests — ModelMetadata admin endpoints (/api/models/*, spec §2.10d).

Covers:
  1.  GET /api/models               → manager 200, list of rows
  2.  agent role                    → 403 FORBIDDEN (manager-only)
  3.  missing auth                  → 401
  4.  ?model_name= filter           → only that model's rows returned
  5.  GET /api/models/production    → only is_production=True rows, one per name
  6.  GET /api/models/<id>          → single row detail matches list
  7.  GET /api/models/<bad id>      → 404 NOT_FOUND
  8.  row shape                     → has metrics, feature_importance, artifact_path

Run from backend/:
    python3 tests/test_models.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.extensions import limiter

app = create_app("development")
limiter.enabled = False  # admin endpoints aren't rate-limited, but keep parity with other suites

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
            assert r.status_code == 200, f"Login failed for {username!r}: {r.data}"
            return r.get_json()["access_token"]

        def get(path, token=None):
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            return c.get(path, headers=headers)

        mgr_token   = login("manager", "manager123")
        agent_token = login("ravi.kumar", "agent123")

        # ── 1. Manager can list ────────────────────────────────────────────────
        print("\n── 1. List (manager) ──")
        r = get("/api/models", mgr_token)
        check("GET /api/models → 200", r.status_code == 200, r.data[:200])
        body = r.get_json() or {}
        models = body.get("models")
        check("response has 'models' list", isinstance(models, list), f"got {type(models)}")
        check("at least one model row (seeded)", bool(models), f"count={len(models or [])}")

        # ── 2. Agent forbidden ─────────────────────────────────────────────────
        print("\n── 2. Role guard ──")
        r = get("/api/models", agent_token)
        check("agent → 403", r.status_code == 403, r.data[:120])
        check("error code FORBIDDEN", (r.get_json() or {}).get("error") == "FORBIDDEN")

        # ── 3. No auth ─────────────────────────────────────────────────────────
        r = get("/api/models")
        check("missing auth → 401", r.status_code == 401, r.data[:120])

        # ── 4. model_name filter ───────────────────────────────────────────────
        print("\n── 4. model_name filter ──")
        sample_name = models[0]["model_name"]
        r = get(f"/api/models?model_name={sample_name}", mgr_token)
        check("filtered → 200", r.status_code == 200, r.data[:120])
        filtered = (r.get_json() or {}).get("models") or []
        check("all rows match model_name",
              all(m["model_name"] == sample_name for m in filtered),
              f"names={{m['model_name'] for m in filtered}}")

        # ── 5. Production models ────────────────────────────────────────────────
        print("\n── 5. Production models ──")
        r = get("/api/models/production", mgr_token)
        check("GET /api/models/production → 200", r.status_code == 200, r.data[:120])
        prod = (r.get_json() or {}).get("models") or []
        check("all production rows have is_production=True",
              all(m["is_production"] is True for m in prod),
              f"prod={[m['model_name'] for m in prod]}")
        names = [m["model_name"] for m in prod]
        check("at most one production row per model_name",
              len(names) == len(set(names)), f"names={names}")

        # ── 6. Single detail ────────────────────────────────────────────────────
        print("\n── 6. Detail by id ──")
        mid = models[0]["id"]
        r = get(f"/api/models/{mid}", mgr_token)
        check(f"GET /api/models/{mid} → 200", r.status_code == 200, r.data[:120])
        detail = r.get_json() or {}
        check("detail id matches", detail.get("id") == mid, f"got {detail.get('id')}")

        # ── 7. Not found ────────────────────────────────────────────────────────
        print("\n── 7. Not found ──")
        r = get("/api/models/99999", mgr_token)
        check("bad id → 404", r.status_code == 404, r.data[:120])
        check("error code NOT_FOUND", (r.get_json() or {}).get("error") == "NOT_FOUND")

        # ── 8. Row shape ────────────────────────────────────────────────────────
        print("\n── 8. Row shape ──")
        row = models[0]
        for key in ("accuracy", "precision_score", "recall_score", "f1_score",
                    "artifact_path", "trained_at", "dataset_size"):
            check(f"row has '{key}'", key in row, f"keys={list(row.keys())}")

    print("\n" + "─" * 50)
    if _failures:
        print(f"  {FAIL}  {len(_failures)} check(s) failed.")
        print("═" * 50)
        sys.exit(1)
    print(f"  {PASS}  All smoke tests passed.")
    print("═" * 50)


if __name__ == "__main__":
    run()
