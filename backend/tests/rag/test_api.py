"""
POST /api/rag/query — auth, validation, and the happy path for all three
routes, exercised as real HTTP requests through the Flask test client.
"""


def test_missing_auth_returns_401(client):
    r = client.post("/api/rag/query", json={"query": "test"})
    assert r.status_code == 401


def test_empty_query_returns_400(client, manager_token):
    r = client.post(
        "/api/rag/query",
        json={"query": ""},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 400
    assert r.get_json()["error"] == "VALIDATION_ERROR"


def test_policy_query_happy_path(client, manager_token):
    r = client.post(
        "/api/rag/query",
        json={"query": "What's our policy on manager overrides?"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["route"] == "policy_lookup"
    assert len(body["sources"]) > 0
    # Both indexes are searched now, so decision records legitimately appear
    # alongside the SOPs; what matters is that the policy docs are in there.
    assert any(s["citation"].startswith("SOP:") for s in body["sources"])


def test_historical_query_happy_path(client, manager_token):
    r = client.post(
        "/api/rag/query",
        json={"query": "Have we had similar NO-GO decisions before?"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["route"] == "historical_lookup"
    assert len(body["sources"]) > 0


def test_live_decision_query_happy_path(client, manager_token):
    r = client.post(
        "/api/rag/query",
        json={"query": "Why was order LM-0002 flagged NO-GO?"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["route"] == "live_decision_explanation"
    assert body["filters_applied"]["order_number"] == "LM-0002"


def test_agent_historical_query_is_area_scoped(client, agent_token, app):
    """Scoping is enforced at retrieval, so assert on the cited sources rather
    than on answer prose — prose wording varies with the generation path."""
    r = client.post(
        "/api/rag/query",
        json={"query": "delivery decisions"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert len(body["sources"]) > 0

    from app.extensions import db
    from app.models import Decision, Order

    with app.app_context():
        areas = set()
        for s in body["sources"]:
            # SOP docs carry no area and aren't scoped; only records are.
            if not s["citation"].startswith("decision_log:"):
                continue
            decision_id = int(s["citation"].split(":")[1])
            decision = db.session.get(Decision, decision_id)
            areas.add(db.session.get(Order, decision.order_id).area)

    assert areas == {"Adyar"}, f"agent saw decisions outside their area: {areas}"


def test_agent_asking_about_out_of_area_order_is_told_so(client, agent_token):
    """The live lookup finds nothing (LM-0012 is in T Nagar, the agent is in
    Adyar) and falls back to a historical search that drops the order number.
    Without an explicit notice the agent gets a confident answer about a
    *different* order, with nothing saying the one they asked for wasn't used."""
    r = client.post(
        "/api/rag/query",
        json={"query": "Why was order LM-0012 marked NO-GO?"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert r.status_code == 200
    body = r.get_json()

    assert "LM-0012" in body["answer"]
    assert "outside your area" in body["answer"]
    # Still no leak: nothing returned is the out-of-area order itself.
    assert "decision_log:12" not in [s["citation"] for s in body["sources"]]


def test_manager_asking_about_unknown_order_is_told_so(client, manager_token):
    r = client.post(
        "/api/rag/query",
        json={"query": "Why was order LM-9999 marked NO-GO?"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    answer = r.get_json()["answer"]

    assert "couldn't find a decision record for LM-9999" in answer
    # A manager has no area restriction, so the agent wording must not appear.
    assert "outside your area" not in answer
    # The related list is presented, not synthesized: asking the model to
    # answer a question about a missing order over *other* orders produces a
    # second refusal directly under the heading promising those decisions.
    assert "Related decisions:" in answer
    assert "do not contain" not in answer
    assert r.get_json()["tokens_used"] is None


def test_order_the_user_can_access_gets_no_notice(client, agent_token):
    """The notice must not fire on the happy path — LM-0002 is in Adyar."""
    r = client.post(
        "/api/rag/query",
        json={"query": "Why was order LM-0002 marked NO-GO?"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert r.status_code == 200
    body = r.get_json()

    assert "outside your area" not in body["answer"]
    assert "couldn't find" not in body["answer"]
    assert [s["citation"] for s in body["sources"]] == ["decision_log:2"]
