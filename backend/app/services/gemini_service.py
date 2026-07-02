"""
Gemini reply generation service — A9.

Public API:
    generate_reply(user_role, intent, context_data, message_text)
        → (reply_text: str, tokens_used: int | None)

Behaviour:
    1. Build a structured prompt: role instruction + plain-English context summary
       + the original question + grounding instructions for Gemini.
    2. Call Gemini API via _call_gemini() (model: gemini-2.5-flash).
    3. On any failure (missing key, network, quota exceeded, any exception):
       return a deterministic fallback reply built from context_data.
       Never raises. Always returns a useful string.

tokens_used convention:
    int  ≥ 1  — real Gemini response; value is total_token_count from usage_metadata
    None      — fallback path used (key absent, any exception, or SDK missing usage info)

Internal hooks (module-level, patchable by tests):
    _get_api_key()               — reads GEMINI_API_KEY from Config
    _call_gemini(prompt, key)    — actual SDK call; may raise; never catches exceptions
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)

_GEMINI_MODEL = "gemini-2.5-flash"


# ── Internal hooks ─────────────────────────────────────────────────────────────

def _get_api_key() -> str | None:
    from app.config import Config
    return Config.GEMINI_API_KEY


def _call_gemini(prompt: str, api_key: str) -> tuple[str, int | None]:
    """
    Single generate_content call. May raise on any SDK/network error.
    Callers are responsible for catching exceptions.
    """
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(_GEMINI_MODEL)
    response = model.generate_content(prompt)
    reply_text = response.text.strip()

    tokens_used: int | None = None
    try:
        tokens_used = int(response.usage_metadata.total_token_count)
    except (AttributeError, TypeError, ValueError):
        pass

    return reply_text, tokens_used


# ── Context → plain English (per-intent, not a generic dict dump) ──────────────

def _build_context_summary(intent: str, ctx: dict) -> str:
    """
    Convert each intent's specific context_data shape into 2-4 readable sentences.
    Each intent has a different dict structure (confirmed in A8), so each branch
    knows exactly which keys to pull.
    """
    if intent == "order_status":
        orders = ctx.get("recent_orders") or []
        scope = ctx.get("scope", "")
        if not orders:
            return f"No recent orders found ({scope})."
        parts = []
        for o in orders[:3]:
            urg = " [URGENT]" if o.get("is_urgent") else ""
            parts.append(
                f"Order #{o['order_number']} for {o['customer_name']}"
                f" in {o['area']} — {o['status']} ({o['time_window']}){urg}"
            )
        return (
            f"Recent orders ({scope}): {'; '.join(parts)}."
            f" Total in view: {len(orders)}."
        )

    elif intent == "earnings_query":
        m = ctx.get("metrics") or {}
        period = ctx.get("period", "this period")
        scope = ctx.get("scope", "team")
        go = m.get("go_count", 0)
        no_go = m.get("no_go_count", 0)
        savings = m.get("total_savings_inr", 0)
        sr = round((m.get("success_rate_with_ai") or 0) * 100, 1)
        baseline = round((m.get("baseline_success_rate") or 0) * 100, 1)
        imp = m.get("improvement_pct", 0)
        return (
            f"This {period} ({scope}): {go} GO deliveries completed,"
            f" {no_go} NO-GO decisions made."
            f" Estimated cost savings: ₹{savings:,.2f}."
            f" AI-assisted success rate: {sr}% vs {baseline}% baseline ({imp:+.1f}%)."
        )

    elif intent == "area_risk":
        zones = sorted(
            ctx.get("zones") or [],
            key=lambda z: z.get("failure_rate", 0),
            reverse=True,
        )
        if not zones:
            return "No area risk data available."
        top3 = [
            f"{z['area']} ({z.get('risk_band', '?')} risk,"
            f" {round(z.get('failure_rate', 0) * 100, 1)}% failure rate)"
            for z in zones[:3]
        ]
        result = f"Area risk overview ({len(zones)} zones). Highest risk: {top3[0]}."
        if len(top3) > 1:
            result += f" Also elevated: {', '.join(top3[1:])}."
        safest = zones[-1]
        if safest["area"] != zones[0]["area"]:
            result += (
                f" Safest area: {safest['area']}"
                f" ({round(safest.get('failure_rate', 0) * 100, 1)}% failure rate)."
            )
        return result

    elif intent == "reassign_suggestion":
        wb = ctx.get("workload_by_area") or []
        if not wb:
            return "No pending orders found across any area."
        total = sum(r.get("pending_orders", 0) for r in wb)
        parts = [f"{r['area']}: {r['pending_orders']}" for r in wb[:5]]
        return (
            f"Pending order workload — {total} orders across {len(wb)} areas:"
            f" {', '.join(parts)}."
        )

    elif intent == "weather_query":
        s = ctx.get("summary") or {}
        period = ctx.get("period", "this period")
        clear = round((s.get("clear_avg_success") or 0) * 100, 1)
        light = round((s.get("light_rain_avg_success") or 0) * 100, 1)
        heavy = round((s.get("heavy_rain_avg_success") or 0) * 100, 1)
        rev_lost = s.get("estimated_revenue_lost_to_weather_inr", 0)
        daily = ctx.get("daily_correlation") or []
        latest = daily[-1] if daily else None
        text = (
            f"This {period}: success rate in clear weather {clear}%,"
            f" light rain {light}%, heavy rain {heavy}%."
            f" Estimated revenue lost to weather: ₹{rev_lost:,.2f}."
        )
        if latest:
            text += (
                f" Most recent day ({latest['date']}):"
                f" {latest['weather_condition']},"
                f" {round(latest['success_rate'] * 100, 1)}% success."
            )
        return text

    elif intent == "agent_performance":
        summary = ctx.get("summary") or {}
        agents = ctx.get("agent_performance") or []
        total = summary.get("total_orders", 0)
        delivered = summary.get("total_delivered", 0)
        fail_pct = summary.get("failed_delivery_pct", 0)
        if not agents:
            return (
                f"This period: {total} orders total,"
                f" {delivered} delivered, {fail_pct}% failure rate."
            )
        top = agents[0]
        bottom = agents[-1] if len(agents) > 1 else None
        text = (
            f"Team overview: {total} orders, {delivered} delivered"
            f" ({fail_pct:.1f}% failed)."
            f" Top performer: {top['agent_name']}"
            f" ({round(top['success_rate'] * 100, 1)}% success,"
            f" {top['order_count']} orders)."
        )
        if bottom and bottom["agent_id"] != top["agent_id"]:
            text += (
                f" Needs attention: {bottom['agent_name']}"
                f" ({round(bottom['success_rate'] * 100, 1)}% success,"
                f" {bottom['order_count']} orders)."
            )
        return text

    elif intent == "postpone_query":
        candidates = ctx.get("no_go_candidates") or []
        scope = ctx.get("scope", "")
        if not candidates:
            return f"No pending NO-GO orders found ({scope}) — nothing to postpone."
        parts = []
        for c in candidates[:3]:
            prob = round((c.get("success_probability") or 0) * 100, 1)
            parts.append(
                f"Order #{c['order_number']} in {c['area']}"
                f" ({c.get('risk_level', '?')} risk, {prob}% success probability)"
            )
        return (
            f"Postponement candidates ({scope}): {'; '.join(parts)}."
            f" {len(candidates)} NO-GO order(s) pending in total."
        )

    else:  # general — no structured context to summarise
        return ""


# ── Prompt builder ─────────────────────────────────────────────────────────────

_ROLE_INSTRUCTIONS: dict[str, str] = {
    "manager": (
        "You are an analytics assistant for a last-mile delivery operations manager "
        "in Chennai, India. Your tone is professional and business-focused. "
        "Provide concise, data-driven insights that support operational decisions."
    ),
    "agent": (
        "You are a helpful assistant for a delivery agent in Chennai, India. "
        "Your tone is friendly, direct, and practical. "
        "Give clear, actionable answers about deliveries, earnings, and routes."
    ),
}


def _build_prompt(
    user_role: str,
    intent: str,
    context_data: dict,
    message_text: str,
) -> str:
    role_instruction = _ROLE_INSTRUCTIONS.get(user_role, _ROLE_INSTRUCTIONS["agent"])
    context_summary = _build_context_summary(intent, context_data)

    parts = [
        role_instruction,
        "",
        f"Detected intent: {intent}",
    ]
    if context_summary:
        parts += ["", "System context:", context_summary]
    parts += [
        "",
        f'User asked: "{message_text}"',
        "",
        (
            "Instructions: Answer based only on the context provided above. "
            "Do not invent data, figures, or area names not mentioned. "
            "Keep your reply to 2-4 sentences and reference the actual numbers when available."
        ),
    ]
    return "\n".join(parts)


# ── Per-intent fallback templates ──────────────────────────────────────────────

def _fallback_reply(intent: str, context_data: dict) -> str:
    """
    Deterministic, intent-specific reply when Gemini is unavailable.
    Uses real values from context_data so the user receives a genuinely
    informative response even when Gemini is down or the key is absent.
    Never returns the [STUB] sentinel.
    """
    if intent == "order_status":
        orders = context_data.get("recent_orders") or []
        scope = context_data.get("scope", "")
        if not orders:
            return f"No recent orders found in your view ({scope})."
        top = orders[0]
        urg = " [URGENT]" if top.get("is_urgent") else ""
        return (
            f"Most recent: Order #{top['order_number']} for {top['customer_name']}"
            f" in {top['area']} — {top['status']} ({top['time_window']}){urg}."
            f" {len(orders)} order(s) visible in your view ({scope})."
        )

    elif intent == "earnings_query":
        m = context_data.get("metrics") or {}
        period = context_data.get("period", "this period")
        scope = context_data.get("scope", "team")
        return (
            f"Earnings summary for {period} ({scope}):"
            f" {m.get('go_count', 0)} deliveries completed,"
            f" {m.get('no_go_count', 0)} skipped by the AI."
            f" Estimated savings from avoided failed deliveries:"
            f" ₹{m.get('total_savings_inr', 0):,.2f}."
        )

    elif intent == "area_risk":
        zones = sorted(
            context_data.get("zones") or [],
            key=lambda z: z.get("failure_rate", 0),
            reverse=True,
        )
        if not zones:
            return "Area risk data is not available at this time."
        top = zones[0]
        return (
            f"Highest risk area: {top['area']}"
            f" ({top.get('risk_band', '?')} risk,"
            f" {round(top.get('failure_rate', 0) * 100, 1)}% failure rate)."
            f" Check the heatmap for all {len(zones)} zones."
        )

    elif intent == "reassign_suggestion":
        wb = context_data.get("workload_by_area") or []
        if not wb:
            return "No pending orders to reassign — all areas are clear."
        total = sum(r.get("pending_orders", 0) for r in wb)
        top = wb[0]
        return (
            f"{top['area']} has the highest pending load"
            f" ({top['pending_orders']} orders) out of {total} total"
            f" across {len(wb)} areas."
            f" Consider redistributing orders from {top['area']} to lighter zones."
        )

    elif intent == "weather_query":
        s = context_data.get("summary") or {}
        heavy = round((s.get("heavy_rain_avg_success") or 0) * 100, 1)
        clear = round((s.get("clear_avg_success") or 0) * 100, 1)
        rev_lost = s.get("estimated_revenue_lost_to_weather_inr", 0)
        return (
            f"Weather impact: success rate drops from {clear}% (clear)"
            f" to {heavy}% (heavy rain)."
            f" Estimated revenue lost to weather-related cancellations:"
            f" ₹{rev_lost:,.2f}."
        )

    elif intent == "agent_performance":
        agents = context_data.get("agent_performance") or []
        summary = context_data.get("summary") or {}
        if not agents:
            return (
                f"Team: {summary.get('total_orders', 0)} orders this period,"
                f" {summary.get('total_delivered', 0)} delivered."
            )
        top = agents[0]
        return (
            f"Top performer: {top['agent_name']} —"
            f" {round(top['success_rate'] * 100, 1)}% success rate"
            f" across {top['order_count']} orders."
            f" Team failure rate: {summary.get('failed_delivery_pct', 0):.1f}%."
        )

    elif intent == "postpone_query":
        candidates = context_data.get("no_go_candidates") or []
        scope = context_data.get("scope", "")
        if not candidates:
            return (
                f"No pending NO-GO orders found ({scope})"
                f" — nothing to postpone right now."
            )
        top = candidates[0]
        prob = round((top.get("success_probability") or 0) * 100, 1)
        return (
            f"Top postponement candidate: Order #{top['order_number']}"
            f" in {top['area']}"
            f" ({top.get('risk_level', '?')} risk, {prob}% success probability)."
            f" {len(candidates)} NO-GO order(s) pending ({scope})."
        )

    else:  # general
        return (
            "I'm the LastMeter AI assistant. I can help with order status, earnings,"
            " area risk, reassignment suggestions, weather impact, agent performance,"
            " and postponement decisions. What would you like to know?"
        )


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_reply(
    user_role: str,
    intent: str,
    context_data: dict,
    message_text: str,
) -> tuple[str, int | None]:
    """
    Generate a natural-language reply using Gemini, with automatic fallback.

    Parameters
    ----------
    user_role    : "agent" or "manager" — controls prompt tone
    intent       : one of the ChatIntent string constants
    context_data : dict fetched from the backend for this intent
    message_text : original user message text

    Returns
    -------
    (reply_text, tokens_used)
        tokens_used is None when the fallback path is used.
    """
    api_key = _get_api_key()
    if not api_key:
        log.info(
            "GEMINI_API_KEY not configured — using fallback reply for intent %r.", intent
        )
        return _fallback_reply(intent, context_data), None

    prompt = _build_prompt(user_role, intent, context_data, message_text)

    try:
        reply_text, tokens_used = _call_gemini(prompt, api_key)
        log.info(
            "Gemini reply generated for intent %r (%s tokens).", intent, tokens_used
        )
        return reply_text, tokens_used
    except Exception as exc:
        log.warning(
            "Gemini call failed (%s) — using fallback reply for intent %r.", exc, intent
        )
        return _fallback_reply(intent, context_data), None
