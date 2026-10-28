"""
The RAG indexing hook in decision_service must never be able to break the
prediction pipeline. Index B is a derived convenience; a decision is the
product's actual output, so a Chroma/embedding failure has to stay contained.
"""

import logging


def test_indexing_failure_does_not_block_decision(app, monkeypatch, caplog):
    from app.extensions import db
    from app.models import Decision, Order
    from app.services import decision_service

    def _explode(decision):
        raise RuntimeError("chroma is down")

    monkeypatch.setattr(
        "app.rag.decision_indexer.upsert_decision", _explode, raising=True
    )

    with app.app_context():
        order = Order.query.first()
        with caplog.at_level(logging.WARNING):
            decision = decision_service.predict_and_save(order, commit=True)

        assert decision is not None
        assert decision.id is not None
        # Committed and readable back, not rolled back by the failed index.
        assert db.session.get(Decision, decision.id) is not None
        assert any("Failed to index decision" in r.message for r in caplog.records)
