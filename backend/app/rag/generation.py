"""
Grounded generation — the final step. Builds a prompt that only allows the
model to answer from retrieved/injected context, requires a citation per
claim, and instructs an explicit refusal when context is insufficient.

Reuses the exact Gemini call/fallback contract from gemini_service.py
(_get_api_key / _call_gemini, catch-everything, never raises) rather than
duplicating it, since generate_reply()'s per-intent fallback shape doesn't
fit RAG (there's no fixed intent schema here — the fallback below is
context-driven instead).
"""

from __future__ import annotations

import logging
import re

log = logging.getLogger(__name__)

_NO_CONTEXT_REFUSAL = (
    "I don't have enough information in the SOP docs or decision logs to answer "
    "that confidently. Try rephrasing with a specific order number, agent, area, "
    "or date range."
)

_SYSTEM_INSTRUCTIONS = (
    "You are the LastMeter AI operations assistant. Answer ONLY using the "
    "numbered context blocks below — each is tagged with a citation like "
    "[SOP:weather-override-policy#0] or [decision_log:1042]. "
    "Rules:\n"
    "1. Every factual claim in your answer must be followed by its citation tag "
    "in brackets, e.g. \"...risk_score was 72 [decision_log:1042].\"\n"
    "2. Do not invent, assume, or use outside knowledge not present in the "
    "context blocks below.\n"
    "3. If the context blocks do not contain enough information to answer the "
    "question, say so explicitly and do not guess.\n"
    "4. Keep the answer to 3-6 sentences unless the question needs a list."
)


def _build_prompt(query: str, context_blocks: list[str]) -> str:
    numbered = "\n\n".join(f"Context {i + 1}: {b}" for i, b in enumerate(context_blocks))
    return (
        f"{_SYSTEM_INSTRUCTIONS}\n\n"
        f"{numbered}\n\n"
        f'Question: "{query}"\n\n'
        f"Answer (with inline citations):"
    )


_CITATION_PREFIX_RE = re.compile(r"^\[([^\]]+)\]\s*")

# Readability substitutions for decision-log blocks only. Policy text keeps its
# exact field names (`weather_risk` et al. are quoted deliberately in the SOPs),
# so these are never applied to SOP blocks. Each is a plain substitution: a
# pattern that doesn't match leaves the text untouched, so nothing is ever
# silently dropped.
_DECISION_CLEANUPS: list[tuple[re.Pattern, object]] = [
    (re.compile(r"^LIVE DECISION — "), ""),
    (re.compile(r"\s*\(agent_id=[^)]*\)"), ""),  # [^)]* — the id is None when unassigned
    (re.compile(r"\s*\(model [^)]*\)"), ""),
    (re.compile(r"SHAP factor breakdown \(signed % contribution toward NO-GO\):"), "Main factors:"),
    (re.compile(r"Top contributing factors:"), "Main factors:"),
    (re.compile(r"\s*toward NO-GO"), ""),
    (re.compile(r"\brisk_score=(\d+)"), r"risk score \1"),
    # Bounded so a sentence-ending period isn't swallowed into the number.
    (re.compile(r"\bsuccess_probability=(\d+(?:\.\d+)?)"),
     lambda m: f"{round(float(m.group(1)) * 100)}% predicted success"),
    (re.compile(r"\b([a-z]+(?:_[a-z]+)+)\b"), lambda m: m.group(1).replace("_", " ")),
    # "weather risk: +35.2%" → "weather risk +35.2%", matching how the
    # historical blocks already read. Anchored on the sign so the "Main
    # factors:" label itself is left alone.
    (re.compile(r":\s+([+-]\d)"), r" \1"),
]


def _readable_decision(body: str) -> str:
    for pattern, repl in _DECISION_CLEANUPS:
        body = pattern.sub(repl, body)
    return body


def _readable_policy(body: str) -> str:
    """SOP bodies are markdown starting with a `# Title` heading. Lift the
    title out so it reads as a section label, and keep the policy wording
    verbatim — precision matters more than prose in a policy quote."""
    # Markdown bold renders literally in a plain-text chat bubble.
    body = body.replace("**", "")
    lines = body.strip().splitlines()
    if lines and lines[0].lstrip().startswith("#"):
        title = lines[0].lstrip("# ").strip()
        rest = "\n".join(lines[1:]).strip()
        return f"{title}\n{rest}" if rest else title
    return body.strip()


def _fallback_answer(context_blocks: list[str], sources: list[dict], lead_in: bool = True) -> str:
    """Gemini unavailable (no key, an error, or the free tier's daily cap).
    Still grounded and still cited — the retrieved sources are presented
    directly, cleaned up to read as an answer rather than fabricating prose
    the model didn't produce.

    `lead_in=False` omits the "From the …:" opener, for callers that have
    already introduced the list with a heading of their own."""
    if not context_blocks:
        return _NO_CONTEXT_REFUSAL

    items, kinds = [], set()
    for block in context_blocks[:4]:
        match = _CITATION_PREFIX_RE.match(block)
        citation = match.group(1) if match else None
        body = block[match.end():] if match else block

        if citation and citation.startswith("SOP:"):
            kinds.add("policy")
            body = _readable_policy(body)
        else:
            kinds.add("decisions")
            body = _readable_decision(body)

        items.append(f"{body} [{citation}]" if citation else body)

    if kinds == {"policy"}:
        lead = "From the policy docs:"
    elif kinds == {"decisions"}:
        lead = "From the decision log:"
    else:
        lead = "From the policy docs and the decision log:"

    body = "\n\n".join(items)
    return f"{lead}\n\n{body}" if lead_in else body


def generate_answer(query: str, context_blocks: list[str], sources: list[dict]) -> tuple[str, int | None]:
    """
    Returns (answer_text, tokens_used). tokens_used is None on the fallback
    path. Refuses (via _NO_CONTEXT_REFUSAL) when context_blocks is empty,
    even before calling Gemini — an empty-context call would just invite
    hallucination.
    """
    if not context_blocks:
        return _NO_CONTEXT_REFUSAL, None

    from app.services.gemini_service import _get_api_key, _call_gemini

    api_key = _get_api_key()
    if not api_key:
        log.info("GEMINI_API_KEY not configured — using fallback RAG answer.")
        return _fallback_answer(context_blocks, sources), None

    prompt = _build_prompt(query, context_blocks)
    try:
        answer, tokens_used = _call_gemini(prompt, api_key)
        return answer, tokens_used
    except Exception as exc:
        log.warning("Gemini call failed (%s) — using fallback RAG answer.", exc)
        return _fallback_answer(context_blocks, sources), None
