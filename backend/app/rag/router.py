"""
Query router — classifies a natural-language question into one of three
retrieval paths, and pulls out structured filters (date, agent, area, order
number, decision type) so retrieval can combine semantic search with exact
filters (hybrid retrieval requirement).

Rule-based rather than LLM-based, matching the existing rule-based intent
classifier (app/ml/intent_predictor.py) — deterministic, free, and the
router's only job is to pick a retrieval path, not to understand the
question deeply (that's the generation step's job, working from retrieved
context).

There is no persisted "route" entity in this codebase (routes are computed
live per-agent, never stored — see route_service.py), so a query like
"Route 12" has nothing to bind to; ROUTE_RE is deliberately absent. Order
number, agent, area, and date are the filterable dimensions that actually
exist on Order/Decision.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from enum import Enum


class QueryRoute(str, Enum):
    POLICY_LOOKUP = "policy_lookup"
    HISTORICAL_LOOKUP = "historical_lookup"
    LIVE_DECISION_EXPLANATION = "live_decision_explanation"


_ORDER_RE = re.compile(r"\bLM-?\d{1,6}\b", re.IGNORECASE)
_BARE_ORDER_RE = re.compile(r"\border\s*(?:no\.?|number)?\s*#?\s*(\d{1,6})\b", re.IGNORECASE)
_AGENT_ID_RE =re.compile(r"\bagent\s*#?\s*(\d+)\b", re.IGNORECASE)
_AGENT_NAME_RE = re.compile(r"\bagent\s+([A-Z][a-zA-Z]+)\b")
_DECISION_RE = re.compile(r"\bno[-\s]?go\b", re.IGNORECASE)
_GO_RE = re.compile(r"(?<![-\s]no)(?<![-\s]no-)\bgo\b", re.IGNORECASE)

_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

_LIVE_MARKERS = [
    "why", "explain", "flagged", "shap", "factor", "contributed", "reason for",
    "why was", "why did", "risk factors",
]
_HISTORICAL_MARKERS = [
    "similar", "before", "previously", "past", "history", "historical",
    "have we", "did we", "last time", "overrides", "trend", "how often",
]
_POLICY_MARKERS = [
    "policy", "sop", "rule", "procedure", "guideline", "threshold",
    "supposed to", "should we", "what's our", "what is our", "allowed",
    # Plain-language phrasings of the same questions. Without these, "what do
    # we do in heavy rain?" hits no marker at all and falls through to the
    # historical default, searching decision logs for a policy answer.
    "what do we do", "what should", "when should", "who can", "who approves",
    "can i", "can we", "can a ", "can an ", "can agent", "am i",
    "do we need", "permitted", "authority", "approval", "escalate",
    "escalation", "required",
    # Domain terms that name an SOP section directly.
    "risk band", "risk bands",
]

# Which route wins when two score equally. A data-shaped question ("can we
# see past orders in Adyar?") scores on both lists, so a tie is broken toward
# whichever route the extracted filters support, and toward policy otherwise.
_DATA_FILTER_KEYS = ("area", "agent_id", "agent_name", "decision", "date_from")

# Typo tolerance: single-word markers only (multi-word phrases don't survive
# token comparison), words long enough that a close match means something.
_FUZZY_MIN_LEN = 5
_FUZZY_CUTOFF = 0.82
_FUZZY_VOCAB = {
    QueryRoute.LIVE_DECISION_EXPLANATION: [
        m for m in _LIVE_MARKERS if " " not in m and len(m) >= _FUZZY_MIN_LEN
    ],
    QueryRoute.HISTORICAL_LOOKUP: [
        m for m in _HISTORICAL_MARKERS if " " not in m and len(m) >= _FUZZY_MIN_LEN
    ],
    QueryRoute.POLICY_LOOKUP: [
        m for m in _POLICY_MARKERS if " " not in m and len(m) >= _FUZZY_MIN_LEN
    ],
}


def _fuzzy_marker_scores(q_lower: str) -> dict:
    """Score routes by near-matching each word against the marker vocabularies."""
    import difflib

    scores = dict.fromkeys(_FUZZY_VOCAB, 0)
    for token in re.findall(rf"[a-z]{{{_FUZZY_MIN_LEN},}}", q_lower):
        for route, vocab in _FUZZY_VOCAB.items():
            if difflib.get_close_matches(token, vocab, n=1, cutoff=_FUZZY_CUTOFF):
                scores[route] += 1
    return scores


def _extract_area(query: str) -> str | None:
    from app.models.order import Order
    q_lower = query.lower()
    for area in Order.VALID_AREAS:
        if area.lower() in q_lower:
            return area
    return None


def _extract_date_range(query: str) -> tuple[str, str] | None:
    q_lower = query.lower()
    today = date.today()

    if "today" in q_lower:
        return today.isoformat(), today.isoformat()
    if "yesterday" in q_lower:
        d = today - timedelta(days=1)
        return d.isoformat(), d.isoformat()
    if "this week" in q_lower:
        start = today - timedelta(days=today.weekday())
        return start.isoformat(), today.isoformat()
    if "last week" in q_lower:
        this_week_start = today - timedelta(days=today.weekday())
        start = this_week_start - timedelta(days=7)
        end = this_week_start - timedelta(days=1)
        return start.isoformat(), end.isoformat()

    for i, day_name in enumerate(_WEEKDAYS):
        if day_name in q_lower:
            days_back = (today.weekday() - i) % 7
            days_back = days_back or 7  # "Tuesday" means the most recent past Tuesday, not today
            d = today - timedelta(days=days_back)
            return d.isoformat(), d.isoformat()

    return None


def extract_filters(query: str) -> dict:
    """Pull structured filters out of free text. Every key is optional;
    absent keys mean 'no constraint on this dimension'."""
    filters: dict = {}

    order_match = _ORDER_RE.search(query)
    if order_match:
        digits = re.sub(r"\D", "", order_match.group(0))
        filters["order_number"] = f"LM-{int(digits):04d}"
    else:
        # "order #12" / "order 12" / "order no. 12" → LM-0012
        bare_match = _BARE_ORDER_RE.search(query)
        if bare_match:
            filters["order_number"] = f"LM-{int(bare_match.group(1)):04d}"

    agent_id_match = _AGENT_ID_RE.search(query)
    if agent_id_match:
        filters["agent_id"] = int(agent_id_match.group(1))
    else:
        agent_name_match = _AGENT_NAME_RE.search(query)
        if agent_name_match:
            filters["agent_name"] = agent_name_match.group(1)

    area = _extract_area(query)
    if area:
        filters["area"] = area

    date_range = _extract_date_range(query)
    if date_range:
        filters["date_from"], filters["date_to"] = date_range

    if _DECISION_RE.search(query):
        filters["decision"] = "NO-GO"
    elif _GO_RE.search(query):
        filters["decision"] = "GO"

    return filters


def _marker_scores(q_lower: str) -> tuple[int, int, int]:
    """(live, historical, policy) keyword hits, falling back to near-matches
    when nothing matched exactly — so a misspelling ("wat is the polcy for
    raine") still scores, while a confident exact match is never second-
    guessed by a fuzzy one."""
    live = sum(1 for m in _LIVE_MARKERS if m in q_lower)
    historical = sum(1 for m in _HISTORICAL_MARKERS if m in q_lower)
    policy = sum(1 for m in _POLICY_MARKERS if m in q_lower)

    if not (live or historical or policy):
        fuzzy = _fuzzy_marker_scores(q_lower)
        return (
            fuzzy[QueryRoute.LIVE_DECISION_EXPLANATION],
            fuzzy[QueryRoute.HISTORICAL_LOOKUP],
            fuzzy[QueryRoute.POLICY_LOOKUP],
        )
    return live, historical, policy


def classify(query: str, filters: dict) -> QueryRoute:
    """Score each route by keyword hits; a specific order_number plus an
    explanatory marker ("why...") is the strongest live-decision signal."""
    q_lower = query.lower()
    live_score, historical_score, policy_score = _marker_scores(q_lower)

    # A specific order number is the strongest live-decision signal: that one
    # order is a concrete entity with a stored decision and SHAP factors, so
    # any question about it ("order #12 NO-GO?", "tell me about LM-0012") wants
    # that record — unless the wording asks to compare it against history
    # ("have we seen orders like LM-0012 before?").
    if filters.get("order_number") and historical_score == 0:
        return QueryRoute.LIVE_DECISION_EXPLANATION

    # A "why was X flagged" about a specific agent+recent date, with no
    # explicit "similar/before" comparison language, is still asking to
    # explain one concrete decision rather than search history.
    if live_score > 0 and historical_score == 0 and (filters.get("agent_id") or filters.get("agent_name") or filters.get("order_number")):
        return QueryRoute.LIVE_DECISION_EXPLANATION

    scores = {
        QueryRoute.POLICY_LOOKUP: policy_score,
        QueryRoute.HISTORICAL_LOOKUP: historical_score,
        QueryRoute.LIVE_DECISION_EXPLANATION: live_score,
    }
    top = max(scores.values())
    if top > 0:
        leaders = [r for r, s in scores.items() if s == top]
        if len(leaders) == 1:
            return leaders[0]
        # Tied: explaining one decision needs a concrete order to explain, and
        # searching history needs something to filter on. With neither, the
        # SOPs are the better source than a scan of decision logs.
        if QueryRoute.LIVE_DECISION_EXPLANATION in leaders and filters.get("order_number"):
            return QueryRoute.LIVE_DECISION_EXPLANATION
        if QueryRoute.HISTORICAL_LOOKUP in leaders and any(
            filters.get(k) for k in _DATA_FILTER_KEYS
        ):
            return QueryRoute.HISTORICAL_LOOKUP
        if QueryRoute.POLICY_LOOKUP in leaders:
            return QueryRoute.POLICY_LOOKUP
        return leaders[0]

    # No keyword signal at all: a bare filtered question ("orders in Adyar
    # last week?") is a historical/data question, not a policy one.
    return QueryRoute.HISTORICAL_LOOKUP
