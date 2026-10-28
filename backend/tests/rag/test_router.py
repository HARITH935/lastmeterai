"""
Router: 3-way classification + structured filter extraction.

Covers the spec's own example queries plus the edge cases that motivated
each rule (NO-GO vs GO regex collision, "why + order number" as the
strongest live-decision signal, no-signal fallback to historical).
"""

from app.rag.router import QueryRoute, classify, extract_filters


def test_live_decision_with_agent_and_date():
    q = "Why did Agent 4 get flagged NO-GO on Tuesday route?"
    filters = extract_filters(q)
    assert filters["agent_id"] == 4
    assert filters["decision"] == "NO-GO"
    assert "date_from" in filters and filters["date_from"] == filters["date_to"]
    assert classify(q, filters) == QueryRoute.LIVE_DECISION_EXPLANATION


def test_policy_lookup_no_filters():
    q = "What's our policy when TomTom shows severe congestion but OSRM ETA is under threshold?"
    filters = extract_filters(q)
    assert filters == {}
    assert classify(q, filters) == QueryRoute.POLICY_LOOKUP


def test_historical_lookup_similar_before():
    q = "Have we had similar overrides before?"
    filters = extract_filters(q)
    assert classify(q, filters) == QueryRoute.HISTORICAL_LOOKUP


def test_live_decision_with_order_number():
    q = "Why was order LM-0042 flagged NO-GO?"
    filters = extract_filters(q)
    assert filters["order_number"] == "LM-0042"
    assert filters["decision"] == "NO-GO"
    assert classify(q, filters) == QueryRoute.LIVE_DECISION_EXPLANATION


def test_bare_order_number_is_normalised():
    """Users type "order #12", not "LM-0012" — both must resolve to the same
    canonical order_number the DB stores."""
    for q in ["Why was order #12 marked NO-GO?", "why was order 12 no-go", "order no. 12 NO-GO"]:
        filters = extract_filters(q)
        assert filters["order_number"] == "LM-0012", q
        assert classify(q, filters) == QueryRoute.LIVE_DECISION_EXPLANATION


def test_short_form_order_number_is_zero_padded():
    filters = extract_filters("Why was LM-12 flagged NO-GO?")
    assert filters["order_number"] == "LM-0012"


def test_order_number_without_why_still_routes_live():
    """A named order is a concrete record, so it wins even with no "why"."""
    q = "tell me about LM-0012"
    filters = extract_filters(q)
    assert classify(q, filters) == QueryRoute.LIVE_DECISION_EXPLANATION


def test_order_number_with_comparison_language_stays_historical():
    """...but explicit comparison wording still means a history search."""
    q = "have we seen orders similar to LM-0012 before?"
    filters = extract_filters(q)
    assert filters["order_number"] == "LM-0012"
    assert classify(q, filters) == QueryRoute.HISTORICAL_LOOKUP


def test_plain_language_policy_questions_route_to_policy():
    """Users rarely say "policy" — these all asked for an SOP answer and used
    to fall through to a decision-log search instead."""
    for q in [
        "what do we do in heavy rain?",
        "can agent Karthik override a NO-GO?",
        "what is the risk band for 75?",
        "who can approve an override?",
    ]:
        assert classify(q, extract_filters(q)) == QueryRoute.POLICY_LOOKUP, q


def test_misspelled_query_still_routes_by_near_match():
    q = "wat is the polcy for raine"
    assert classify(q, extract_filters(q)) == QueryRoute.POLICY_LOOKUP


def test_fuzzy_never_overrides_an_exact_match():
    """The fuzzy pass runs only when nothing matched exactly."""
    q = "have we had similar NO-GO decisions before?"
    assert classify(q, extract_filters(q)) == QueryRoute.HISTORICAL_LOOKUP


def test_no_signal_falls_back_to_historical():
    q = "orders in Adyar last week"
    filters = extract_filters(q)
    assert filters["area"] == "Adyar"
    assert "date_from" in filters
    assert classify(q, filters) == QueryRoute.HISTORICAL_LOOKUP


def test_go_regex_does_not_match_inside_no_go():
    """_GO_RE's negative lookbehind must not match the "go" inside "no-go" —
    tested directly against the regex object so this stays a safety net even
    if the if/elif ordering in classify() is ever refactored."""
    from app.rag.router import _GO_RE
    assert _GO_RE.search("was this order a no-go call?") is None


def test_go_regex_matches_standalone_go():
    filters = extract_filters("Is order LM-0099 a GO?")
    assert filters["decision"] == "GO"


def test_area_extraction_matches_known_area_only():
    filters = extract_filters("what happened in Nungambakkam yesterday")
    assert filters["area"] == "Nungambakkam"
    assert filters["date_from"] == filters["date_to"]


def test_area_extraction_absent_for_unknown_area():
    filters = extract_filters("what happened in Narnia yesterday")
    assert "area" not in filters
