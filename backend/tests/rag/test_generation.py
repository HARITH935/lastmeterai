"""
Grounded generation: refusal on empty context, and citation presence in the
fallback (no-Gemini-key) path — the two guarantees the whole "grounded, not
hallucinated" pitch depends on.
"""

from app.rag.generation import generate_answer, _NO_CONTEXT_REFUSAL


def test_refuses_on_empty_context():
    answer, tokens_used = generate_answer("some question", [], [])
    assert answer == _NO_CONTEXT_REFUSAL
    assert tokens_used is None


def test_fallback_answer_includes_citations_without_gemini_key(monkeypatch):
    import app.services.gemini_service as gs
    monkeypatch.setattr(gs, "_get_api_key", lambda: None)

    blocks = ["[SOP:weather-override-policy#0] weather_risk above 0.7 does not force a NO-GO by itself."]
    sources = [{"citation": "SOP:weather-override-policy#0", "description": "Weather Override Policy"}]

    answer, tokens_used = generate_answer("what's our weather policy", blocks, sources)

    assert tokens_used is None
    assert "SOP:weather-override-policy#0" in answer
    assert "weather_risk" in answer


def test_gemini_failure_falls_back_gracefully(monkeypatch):
    """Even with a configured key, if the Gemini call itself raises, the
    function must still return a grounded (cited) answer, never propagate
    the exception."""
    import app.services.gemini_service as gs
    monkeypatch.setattr(gs, "_get_api_key", lambda: "fake-key-for-test")

    def _raise(prompt, api_key):
        raise RuntimeError("forced failure for test")
    monkeypatch.setattr(gs, "_call_gemini", _raise)

    blocks = ["[decision_log:1] Order LM-0001 in Adyar. Decision: NO-GO."]
    sources = [{"citation": "decision_log:1", "description": "Order LM-0001 — NO-GO"}]

    answer, tokens_used = generate_answer("why NO-GO", blocks, sources)

    assert tokens_used is None
    assert "decision_log:1" in answer


# ── Fallback readability ───────────────────────────────────────────────────────
# The free tier allows 20 generate requests/day, shared with chat, so this path
# is routinely what users see — not just a rare error path. It has to read as an
# answer while staying verbatim about policy wording.

def test_fallback_translates_decision_log_jargon():
    from app.rag.generation import _fallback_answer

    blocks = [
        "[decision_log:12] LIVE DECISION — Order LM-0012, T Nagar, agent Karthik Raj. "
        "Decision: NO-GO (risk_score=53, medium risk, success_probability=0.47). "
        "SHAP factor breakdown (signed % contribution toward NO-GO): "
        "weather_risk: +35.2% toward NO-GO; customer_history_score: +24.8% toward NO-GO. "
        "Decided 2026-08-22."
    ]
    answer = _fallback_answer(blocks, [{"citation": "decision_log:12", "description": ""}])

    assert answer.startswith("From the decision log:")
    assert "risk score 53" in answer
    assert "47% predicted success" in answer
    assert "Main factors: weather risk +35.2%" in answer
    assert "[decision_log:12]" in answer
    # None of the internal vocabulary should survive.
    for jargon in ("risk_score=", "success_probability=", "SHAP factor breakdown",
                   "toward NO-GO", "LIVE DECISION", "AI synthesis unavailable"):
        assert jargon not in answer, jargon


def test_fallback_keeps_policy_wording_verbatim():
    """Policy text quotes field names deliberately, so the decision-log
    cleanups must not touch it — only the heading and markdown markers go."""
    from app.rag.generation import _fallback_answer

    blocks = [
        "[SOP:weather-override-policy#0] # Weather Override Policy\n\n"
        "`weather_risk` above 0.7 does not force a NO-GO by itself.\n\n"
        "Dispatchers may **not** override an AI NO-GO to GO."
    ]
    answer = _fallback_answer(blocks, [{"citation": "SOP:weather-override-policy#0", "description": ""}])

    assert answer.startswith("From the policy docs:")
    assert "Weather Override Policy" in answer
    assert "`weather_risk` above 0.7" in answer   # verbatim, not reworded
    assert "may not override" in answer           # emphasis markers stripped
    assert "**" not in answer
    # The markdown heading marker is gone (the "#0" in the citation stays).
    assert not any(line.lstrip().startswith("#") for line in answer.splitlines())


def test_fallback_handles_unassigned_agent_and_sentence_boundaries():
    """Regression: success_probability=0.8. swallowed the sentence period, and
    an unassigned order carries agent_id=None rather than a number."""
    from app.rag.generation import _fallback_answer

    blocks = [
        "[decision_log:3] Order LM-0003 in Adyar. Agent: unassigned (agent_id=None). "
        "Decision: GO, risk_score=20 (low risk), success_probability=0.8. "
        "Top contributing factors: distance_score +8.4%. (model gonogo_lr vv1.0)"
    ]
    answer = _fallback_answer(blocks, [{"citation": "decision_log:3", "description": ""}])

    assert "80% predicted success" in answer
    assert "agent_id" not in answer and "agent id" not in answer
    assert "gonogo_lr" not in answer
    assert "Main factors: distance score +8.4%" in answer


def test_mixed_sources_get_a_combined_lead():
    from app.rag.generation import _fallback_answer

    blocks = [
        "[SOP:escalation-policy#0] # Escalation Policy\n\nEscalate after 3 NO-GOs.",
        "[decision_log:5] Order LM-0005 in Adyar. Decision: NO-GO.",
    ]
    sources = [{"citation": "SOP:escalation-policy#0", "description": ""},
               {"citation": "decision_log:5", "description": ""}]

    answer = _fallback_answer(blocks, sources)
    assert answer.startswith("From the policy docs and the decision log:")
