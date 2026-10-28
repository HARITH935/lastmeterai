"""
Retrieval layer, with role-scoping as the priority — an agent must never be
able to pull another area's decisions out of Index B, whether by semantic
search or by a direct live-decision lookup.
"""

from app.rag.retrievers import (
    retrieve_policy,
    retrieve_historical,
    build_live_decision_context,
)


def test_retrieve_policy_returns_sop_citations(app):
    with app.app_context():
        blocks, sources = retrieve_policy("what is our weather override policy", k=3)
    assert len(blocks) > 0
    assert all(s["citation"].startswith("SOP:") for s in sources)
    assert any("weather" in s["citation"] for s in sources)


def test_retrieve_historical_manager_sees_multiple_areas(app, manager_user):
    with app.app_context():
        blocks, sources = retrieve_historical("NO-GO decisions", {}, k=20, user=manager_user)
    assert len(sources) > 0

    # Manager view isn't area-restricted — check the underlying index itself
    # (unfiltered) actually spans multiple areas, so this test would fail if
    # someone accidentally added an area filter to the manager path.
    from app.rag.vectorstore import get_vectorstore, DECISION_COLLECTION
    with app.app_context():
        store = get_vectorstore(DECISION_COLLECTION)
        docs = store.similarity_search("NO-GO decisions", k=20)
    assert len({d.metadata["area"] for d in docs}) > 1


def test_retrieve_historical_agent_scoped_to_own_area(app, agent_user):
    assert agent_user.area == "Adyar"
    with app.app_context():
        blocks, sources = retrieve_historical("delivery decisions", {}, k=20, user=agent_user)
    assert len(blocks) > 0
    for block in blocks:
        assert "Adyar" in block


def test_live_decision_context_own_area_succeeds(app, agent_user):
    with app.app_context():
        from app.models import Order
        own_order = Order.query.filter_by(area=agent_user.area).first()
        blocks, sources = build_live_decision_context(
            {"order_number": own_order.order_number}, agent_user
        )
    assert len(blocks) == 1
    assert "SHAP factor breakdown" in blocks[0]
    assert sources[0]["citation"].startswith("decision_log:")


def test_live_decision_context_other_area_blocked(app, agent_user):
    """The critical security boundary: an agent asking about an order
    outside their own area must get nothing back, not another area's data."""
    with app.app_context():
        from app.models import Order
        other_order = Order.query.filter(Order.area != agent_user.area).first()
        blocks, sources = build_live_decision_context(
            {"order_number": other_order.order_number}, agent_user
        )
    assert blocks == []
    assert sources == []


def test_live_decision_context_manager_unrestricted(app, manager_user):
    with app.app_context():
        from app.models import Order
        any_order = Order.query.first()
        blocks, _ = build_live_decision_context(
            {"order_number": any_order.order_number}, manager_user
        )
    assert len(blocks) == 1
