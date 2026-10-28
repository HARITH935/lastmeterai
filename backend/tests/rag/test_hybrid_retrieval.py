"""
Both indexes are searched for every question except a named live decision.

Routing used to be a hard switch between the SOP index and the decision log,
so any misroute guaranteed a refusal — the policy answer simply isn't in the
decision log. Keyword lists can't cover how people actually phrase questions
("What does a risk score of 75 mean?" contains no policy keyword at all), so
the fix is to stop making the choice and let the reranker pick from both.

Measured on 21 realistic questions, this took the share whose answering source
actually reached the model from 15 to 20.
"""

from app.rag.service import answer_query


def _citations(user, query):
    return [s["citation"] for s in answer_query(user, query)["sources"]]


def test_policy_answers_survive_phrasings_with_no_keyword(app, manager_user):
    """None of these contain a policy keyword, so all three used to be
    answered out of the decision log and refused."""
    # Asserted against the *local* embedding model, because the suite runs
    # without a Gemini key for hermeticity. Production uses Gemini embeddings,
    # which score better: on the same 21-question set, local reaches 20 and
    # Gemini 21 — "is it ok to deliver when it's pouring?" is the difference,
    # so it is deliberately not asserted here.
    expected = {
        "What does a risk score of 75 mean?": "risk-band",
        "Should I postpone or reassign?": "postpone",
        "how many NO-GOs before I involve a manager": "escalation",
        "it's flooding on that road": "weather",
    }
    with app.app_context():
        for query, slug in expected.items():
            cites = _citations(manager_user, query)
            assert any(slug in c for c in cites), f"{query!r} -> {cites}"


def test_data_questions_still_reach_the_decision_log(app, manager_user):
    """The policy half must not crowd out the records for data questions."""
    with app.app_context():
        for query in [
            "show me recent NO-GO decisions",
            "orders for Ravi Kumar",
            "which decisions had bad weather",
        ]:
            cites = _citations(manager_user, query)
            assert any(c.startswith("decision_log:") for c in cites), f"{query!r} -> {cites}"


def test_named_order_answers_from_that_record_alone(app, manager_user):
    """A concrete order is the one case worth answering from a single source:
    its own SHAP breakdown is the answer, and nothing else competes."""
    with app.app_context():
        assert _citations(manager_user, "Why was order LM-0002 marked NO-GO?") == ["decision_log:2"]


def test_agent_scoping_still_applies_across_both_indexes(app, agent_user):
    """Searching both indexes must not widen what an agent can see."""
    from app.extensions import db
    from app.models import Decision, Order

    with app.app_context():
        cites = _citations(agent_user, "show me recent delivery decisions")
        areas = set()
        for c in cites:
            if not c.startswith("decision_log:"):
                continue
            decision = db.session.get(Decision, int(c.split(":")[1]))
            areas.add(db.session.get(Order, decision.order_id).area)
        assert areas <= {"Adyar"}, f"agent saw other areas: {areas}"
