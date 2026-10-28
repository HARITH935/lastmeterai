"""
Shared fixtures for the RAG test suite.

Unlike the rest of backend/tests/ (hand-rolled smoke scripts run against
whatever's in the local dev DB), this suite is real, hermetic pytest:
session-scoped fixtures spin up a throwaway SQLite DB + throwaway Chroma
index (both in pytest's tmp dir), seeded via the project's own seed.py so
fixture data stays realistic and in sync with schema changes, and torn down
automatically when the test session ends.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Env vars must be set before `app.config` (or anything importing it) is
# first imported anywhere in the process — Config reads os.environ.get(...)
# at class-body evaluation time, once.
_TMP_ROOT = Path(__file__).parent / "_tmp_test_state"
_TMP_ROOT.mkdir(exist_ok=True)
_DB_PATH = _TMP_ROOT / "rag_test.db"
_CHROMA_PATH = _TMP_ROOT / "rag_test_chroma"

if _DB_PATH.exists():
    _DB_PATH.unlink()

os.environ["FLASK_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ["RAG_CHROMA_DIR"] = str(_CHROMA_PATH)

# Force the grounded-fallback generation path. With a real key present in the
# developer's .env, answers become live Gemini prose — non-deterministic and
# network-dependent, so assertions on answer text would pass or fail by luck.
# The live-Gemini path is exercised by test_generation.py with an explicit mock.
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import pytest

from app import create_app
from app.extensions import db as _db, limiter
from app.models import User


@pytest.fixture(scope="session", autouse=True)
def _seeded_app():
    """Seed the throwaway DB once per test session via the project's own
    seed.py (realistic data, stays in sync with schema), then build both
    RAG indexes against it once."""
    import seed as seed_module
    seed_module.seed(force=True)

    app = create_app("development")
    limiter.enabled = False  # tests fire far more than 10 req/min

    with app.app_context():
        from app.rag import sop_loader, decision_indexer
        sop_loader.reindex()
        decision_indexer.reindex_all()

    yield app


@pytest.fixture(scope="session")
def app(_seeded_app):
    return _seeded_app


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture(scope="session")
def manager_user(app):
    with app.app_context():
        u = User.query.filter_by(username="manager").first()
        _db.session.expunge(u)
        return u


@pytest.fixture(scope="session")
def agent_user(app):
    """An agent seeded in Adyar (seed.py's first agent, ravi.kumar)."""
    with app.app_context():
        u = User.query.filter_by(username="ravi.kumar").first()
        _db.session.expunge(u)
        return u


def _login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.data
    return r.get_json()["access_token"]


@pytest.fixture()
def manager_token(client):
    return _login(client, "manager", "manager123")


@pytest.fixture()
def agent_token(client):
    return _login(client, "ravi.kumar", "agent123")
