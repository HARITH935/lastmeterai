"""
Analytics service — Module 10.

All computation logic for the 7 analytics endpoints.  Routes are thin HTTP
adapters; all business logic lives here.

Documented assumptions are defined as named constants at the top so they are
easy to audit and replace when real operational data is available.
"""

from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta

from sqlalchemy import func, and_, case

from app.extensions import db
from app.models import Order, Decision, User
from app.models.decision import DecisionType, RiskLevel, _risk_level_from_score
from app.models.order import OrderStatus, TimeWindow
from app.models.user import UserRole

# ── Documented cost/fuel assumptions ─────────────────────────────────────────
AVG_FAILED_DELIVERY_COST_INR = 300.0
# Per failed attempt: agent time (≈1.5 h), return-trip fuel, re-scheduling
# overhead, and customer-dissatisfaction allowance.

FUEL_COST_PER_LITRE_INR = 104.0
# Approximate Chennai petrol price (June 2026) used for 2-wheeler riders.

FUEL_CONSUMPTION_PER_KM_LITRES = 0.035
# Typical 2-wheeler fuel consumption (litres/km) for last-mile delivery.

AVG_DISTANCE_PER_ORDER_KM = 4.5
# Median intra-area last-mile distance in Chennai (internal GPS trace estimate).

# Baseline success rate before AI-assisted GO/NO-GO triage.
# Reference: RedSeer India E-commerce Logistics Report 2023 — urban Chennai,
# 2-wheeler last-mile, ~73% first-attempt success industry average.
BASELINE_SUCCESS_RATE = 0.73

# ── Area constants ─────────────────────────────────────────────────────────────
AREAS = ["Anna Nagar", "T Nagar", "Velachery", "Adyar", "Porur"]

AREA_COORDS: dict[str, tuple[float, float]] = {
    "Anna Nagar": (13.0850, 80.2101),
    "T Nagar":    (13.0418, 80.2341),
    "Velachery":  (12.9815, 80.2180),
    "Adyar":      (13.0063, 80.2574),
    "Porur":      (13.0358, 80.1567),
}

VALID_PERIODS = {"today", "week", "month", "all"}


# ── Custom exceptions ─────────────────────────────────────────────────────────

class AnalyticsError(Exception):
    pass


class NotFound(AnalyticsError):
    pass


class Forbidden(AnalyticsError):
    pass


# ── Shared helpers ────────────────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _period_start(period: str) -> datetime:
    now = _utcnow()
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    return datetime(2000, 1, 1, tzinfo=timezone.utc)  # "all"


def _weather_category(snapshot: dict | None) -> str:
    """
    Classify a weather_snapshot dict into one of three strings:
    'clear', 'light_rain', or 'heavy_rain'.
    """
    if not snapshot:
        return "clear"
    combined = (
        (snapshot.get("condition") or "") + " " + (snapshot.get("description") or "")
    ).lower()
    if any(w in combined for w in ("thunderstorm", "heavy", "storm")):
        return "heavy_rain"
    if any(w in combined for w in ("rain", "drizzle", "shower", "mist", "fog")):
        return "light_rain"
    return "clear"


def _is_rainy(snapshot: dict | None) -> bool:
    return _weather_category(snapshot) in ("light_rain", "heavy_rain")


def _risk_band_from_failure_rate(rate: float) -> str:
    if rate <= 0.20:
        return "low"
    if rate <= 0.40:
        return "medium"
    return "high"


def _safe_avg(lst: list[float]) -> float:
    return round(sum(lst) / len(lst), 4) if lst else 0.0


# ── 1. Dashboard ──────────────────────────────────────────────────────────────

def get_dashboard() -> dict:
    today_start = _utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_date = _utcnow().date()
    seven_days_ago = _utcnow() - timedelta(days=7)

    # ── Metric cards (aggregate queries — no N+1) ─────────────────────────────

    total_orders_today = (
        db.session.query(func.count(Order.id))
        .filter(Order.created_at >= today_start)
        .scalar() or 0
    )

    deliveries_completed = (
        db.session.query(func.count(Order.id))
        .filter(Order.status == OrderStatus.DELIVERED)
        .scalar() or 0
    )

    # Latest decision per order via max(id) subquery.
    latest_subq = (
        db.session.query(
            Decision.order_id,
            func.max(Decision.id).label("max_id"),
        )
        .group_by(Decision.order_id)
        .subquery()
    )
    high_risk_orders = (
        db.session.query(func.count(Decision.id))
        .join(
            latest_subq,
            and_(
                Decision.order_id == latest_subq.c.order_id,
                Decision.id == latest_subq.c.max_id,
            ),
        )
        .filter(Decision.risk_level == RiskLevel.HIGH)
        .scalar() or 0
    )

    revenue_today = float(
        db.session.query(func.sum(Order.payment_amount))
        .filter(Order.created_at >= today_start)
        .scalar() or 0.0
    )

    no_go_total = (
        db.session.query(func.count(Decision.id))
        .filter(Decision.decision == DecisionType.NO_GO)
        .scalar() or 0
    )
    estimated_savings = round(no_go_total * AVG_FAILED_DELIVERY_COST_INR, 2)

    active_agents = (
        db.session.query(func.count(User.id))
        .filter(User.role == UserRole.AGENT, User.is_active == True)  # noqa: E712
        .scalar() or 0
    )

    # ── Trend: success_rate_over_time (7 days, based on GO/NO-GO decisions) ──
    sr_rows = (
        db.session.query(
            func.date(Decision.created_at).label("day"),
            func.sum(case((Decision.decision == DecisionType.GO, 1), else_=0)).label("go"),
            func.count(Decision.id).label("total"),
        )
        .filter(Decision.created_at >= seven_days_ago)
        .group_by(func.date(Decision.created_at))
        .all()
    )
    sr_map = {
        str(r.day): round(r.go / r.total, 4) if r.total else 0.0
        for r in sr_rows
    }
    success_rate_over_time = [
        {"date": str(today_date - timedelta(days=i)), "success_rate": sr_map.get(str(today_date - timedelta(days=i)), 0.0)}
        for i in range(6, -1, -1)
    ]

    # ── Trend: failure_rate_by_area (all 5 areas, all-time) ──────────────────
    area_rows = (
        db.session.query(
            Order.area,
            func.count(Order.id).label("total"),
            func.sum(
                case((Order.status.in_([OrderStatus.FAILED, OrderStatus.POSTPONED]), 1), else_=0)
            ).label("failures"),
        )
        .group_by(Order.area)
        .all()
    )
    area_rate_map = {
        r.area: round(r.failures / r.total, 4) if r.total else 0.0
        for r in area_rows
    }
    failure_rate_by_area = [
        {"area": a, "failure_rate": area_rate_map.get(a, 0.0)}
        for a in AREAS
    ]

    # ── Trend: revenue_by_day (7 days) ────────────────────────────────────────
    rev_rows = (
        db.session.query(
            func.date(Order.created_at).label("day"),
            func.sum(Order.payment_amount).label("revenue"),
        )
        .filter(Order.created_at >= seven_days_ago)
        .group_by(func.date(Order.created_at))
        .all()
    )
    rev_map = {str(r.day): round(float(r.revenue), 2) for r in rev_rows}
    revenue_by_day = [
        {"date": str(today_date - timedelta(days=i)), "revenue": rev_map.get(str(today_date - timedelta(days=i)), 0.0)}
        for i in range(6, -1, -1)
    ]

    return {
        "cards": {
            "total_orders_today": total_orders_today,
            "deliveries_completed": deliveries_completed,
            "high_risk_orders": high_risk_orders,
            "revenue_today": round(revenue_today, 2),
            "estimated_savings": estimated_savings,
            "active_agents": active_agents,
        },
        "trends": {
            "success_rate_over_time": success_rate_over_time,
            "failure_rate_by_area": failure_rate_by_area,
            "revenue_by_day": revenue_by_day,
        },
    }


# ── 2. KPI ────────────────────────────────────────────────────────────────────

def get_kpi(period: str) -> dict:
    if period not in ("today", "week", "month"):
        period = "week"
    period_start = _period_start(period)

    # ── Summary aggregate ─────────────────────────────────────────────────────
    order_stats = (
        db.session.query(
            func.count(Order.id).label("total"),
            func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)).label("delivered"),
            func.sum(case((Order.status == OrderStatus.FAILED, 1), else_=0)).label("failed"),
        )
        .filter(Order.created_at >= period_start)
        .one()
    )
    total_orders = order_stats.total or 0
    total_delivered = order_stats.delivered or 0
    total_failed = order_stats.failed or 0
    failed_pct = round((total_failed / total_orders * 100) if total_orders else 0.0, 2)

    # avg_delivery_time_minutes — Python-level: SQLite datetime arithmetic is unreliable.
    delivered_rows = (
        db.session.query(Order.created_at, Order.updated_at)
        .filter(Order.status == OrderStatus.DELIVERED)
        .filter(Order.created_at >= period_start)
        .all()
    )
    times: list[float] = []
    for row in delivered_rows:
        try:
            diff_min = (row.updated_at - row.created_at).total_seconds() / 60
            if 1 <= diff_min <= 1440:
                times.append(diff_min)
        except Exception:
            pass
    avg_delivery_time = round(sum(times) / len(times), 1) if times else 0.0

    # ── Agent performance (one aggregate query) ───────────────────────────────
    agent_rows = (
        db.session.query(
            User.id.label("agent_id"),
            User.name.label("agent_name"),
            User.area.label("area"),
            func.count(Order.id).label("order_count"),
            func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)).label("delivered_count"),
        )
        .outerjoin(
            Order,
            and_(Order.agent_id == User.id, Order.created_at >= period_start),
        )
        .filter(User.role == UserRole.AGENT, User.is_active == True)  # noqa: E712
        .group_by(User.id, User.name, User.area)
        .all()
    )
    max_orders = max((r.order_count or 0 for r in agent_rows), default=1) or 1
    agent_perf: list[dict] = []
    for r in agent_rows:
        cnt = r.order_count or 0
        deliv = r.delivered_count or 0
        success_rate = round(deliv / cnt, 4) if cnt else 0.0
        # performance_score: 70% success rate + 30% relative volume
        perf_score = round(0.7 * success_rate + 0.3 * (cnt / max_orders), 4)
        agent_perf.append({
            "agent_id": r.agent_id,
            "agent_name": r.agent_name,
            "area": r.area,
            "order_count": cnt,
            "delivered_count": deliv,
            "success_rate": success_rate,
            "performance_score": perf_score,
        })
    agent_perf.sort(key=lambda x: x["performance_score"], reverse=True)

    # ── Area performance (one aggregate query with avg risk from all decisions) ──
    area_rows = (
        db.session.query(
            Order.area,
            func.count(func.distinct(Order.id)).label("total"),
            func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)).label("success"),
            func.sum(
                case((Order.status.in_([OrderStatus.FAILED, OrderStatus.POSTPONED]), 1), else_=0)
            ).label("failures"),
            func.avg(Decision.risk_score).label("avg_risk"),
        )
        .outerjoin(Decision, Decision.order_id == Order.id)
        .filter(Order.created_at >= period_start)
        .group_by(Order.area)
        .all()
    )
    area_perf_map = {
        r.area: {
            "area": r.area,
            "total_orders": r.total or 0,
            "success_count": r.success or 0,
            "failure_count": r.failures or 0,
            "avg_risk_score": round(float(r.avg_risk or 0), 1),
        }
        for r in area_rows
    }
    area_performance = [
        area_perf_map.get(a, {
            "area": a, "total_orders": 0, "success_count": 0,
            "failure_count": 0, "avg_risk_score": 0.0,
        })
        for a in AREAS
    ]

    # ── Weather impact (Python-level JSON parsing) ────────────────────────────
    weather_rows = (
        db.session.query(Decision.decision, Decision.weather_snapshot, Decision.success_probability)
        .join(Order, Decision.order_id == Order.id)
        .filter(Order.created_at >= period_start)
        .all()
    )
    clear_probs: list[float] = []
    rainy_probs: list[float] = []
    for row in weather_rows:
        sp = row.success_probability or 0.0
        (_is_rainy(row.weather_snapshot) and rainy_probs or clear_probs).append(sp)

    return {
        "period": period,
        "summary": {
            "avg_delivery_time_minutes": avg_delivery_time,
            "failed_delivery_pct": failed_pct,
            "total_orders": total_orders,
            "total_delivered": total_delivered,
        },
        "agent_performance": agent_perf,
        "area_performance": area_performance,
        "weather_impact": {
            "clear_days_success_rate": _safe_avg(clear_probs),
            "rainy_days_success_rate": _safe_avg(rainy_probs),
            "clear_count": len(clear_probs),
            "rainy_count": len(rainy_probs),
        },
    }


# ── 3. Cost savings ───────────────────────────────────────────────────────────

def get_cost_savings(user, period: str = "all") -> dict:
    if period not in VALID_PERIODS:
        period = "all"
    period_start = _period_start(period)

    # ── Decision-level aggregates ─────────────────────────────────────────────
    dec_q = (
        db.session.query(
            func.count(Decision.id).label("total_decisions"),
            func.sum(case((Decision.decision == DecisionType.GO, 1), else_=0)).label("go_count"),
            func.sum(case((Decision.decision == DecisionType.NO_GO, 1), else_=0)).label("no_go_count"),
        )
        .join(Order, Decision.order_id == Order.id)
    )
    if not user.is_manager:
        dec_q = dec_q.filter(Order.area == user.area)
    if period != "all":
        dec_q = dec_q.filter(Decision.created_at >= period_start)
    dec_stats = dec_q.one()

    total_decisions = dec_stats.total_decisions or 0
    go_count = dec_stats.go_count or 0
    no_go_count = dec_stats.no_go_count or 0

    # ── Order-level aggregates (for success_rate_with_ai) ────────────────────
    ord_q = (
        db.session.query(
            func.count(func.distinct(Order.id)).label("total"),
            func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)).label("delivered"),
            func.sum(
                case((Order.status.in_([OrderStatus.DELIVERED, OrderStatus.FAILED, OrderStatus.POSTPONED]), 1), else_=0)
            ).label("outcome_count"),
        )
        .join(Decision, Decision.order_id == Order.id)
    )
    if not user.is_manager:
        ord_q = ord_q.filter(Order.area == user.area)
    if period != "all":
        ord_q = ord_q.filter(Decision.created_at >= period_start)
    ord_stats = ord_q.one()

    outcome_count = ord_stats.outcome_count or 0
    delivered_count = ord_stats.delivered or 0
    success_rate_with_ai = (
        round(delivered_count / outcome_count, 4) if outcome_count else BASELINE_SUCCESS_RATE
    )
    improvement_pct = round(
        (success_rate_with_ai - BASELINE_SUCCESS_RATE) / BASELINE_SUCCESS_RATE * 100, 2
    )

    deliveries_avoided = no_go_count
    fuel_saved_litres = round(
        deliveries_avoided * AVG_DISTANCE_PER_ORDER_KM * FUEL_CONSUMPTION_PER_KM_LITRES, 3
    )
    fuel_saved_inr = round(fuel_saved_litres * FUEL_COST_PER_LITRE_INR, 2)
    failed_cost_avoided_inr = round(deliveries_avoided * AVG_FAILED_DELIVERY_COST_INR, 2)
    total_savings_inr = round(fuel_saved_inr + failed_cost_avoided_inr, 2)

    return {
        "period": period,
        "scope": "all" if user.is_manager else user.area,
        "metrics": {
            "total_orders": total_decisions,
            "go_count": go_count,
            "no_go_count": no_go_count,
            "deliveries_avoided": deliveries_avoided,
            "fuel_saved_litres": fuel_saved_litres,
            "fuel_saved_inr": fuel_saved_inr,
            "failed_cost_avoided_inr": failed_cost_avoided_inr,
            "total_savings_inr": total_savings_inr,
            "success_rate_with_ai": success_rate_with_ai,
            "baseline_success_rate": BASELINE_SUCCESS_RATE,
            "improvement_pct": improvement_pct,
        },
        "assumptions": {
            "fuel_cost_per_litre_inr": FUEL_COST_PER_LITRE_INR,
            "fuel_consumption_per_km_litres": FUEL_CONSUMPTION_PER_KM_LITRES,
            "avg_distance_per_order_km": AVG_DISTANCE_PER_ORDER_KM,
            "avg_failed_delivery_cost_inr": AVG_FAILED_DELIVERY_COST_INR,
        },
    }


# ── 4. Area analytics ─────────────────────────────────────────────────────────

def _empty_area_response(area: str, time_slot_filter: str) -> dict:
    empty_slot = {"total": 0, "success_count": 0, "failure_count": 0, "go_rate": 0.0}
    return {
        "area": area,
        "time_slot_filter": time_slot_filter,
        "summary": {"total_orders": 0, "success_rate": 0.0, "failure_rate": 0.0, "risk_level": "low"},
        "weather_impact": {"clear_success_rate": 0.0, "rainy_success_rate": 0.0, "rain_impact": "low"},
        "best_delivery_window": {"window": "morning", "predicted_success_rate": 0.0},
        "by_time_slot": {"morning": empty_slot, "afternoon": empty_slot, "evening": empty_slot},
        "top_failure_reasons": [],
        "model_predicted_failure_rate": 0.0,
    }


def get_area_analytics(area: str, time_slot: str | None = None) -> dict:
    time_slot_filter = time_slot or "all"

    # Build order query
    order_q = db.session.query(Order).filter(Order.area == area)
    if time_slot:
        try:
            tw_enum = TimeWindow[time_slot.upper()]
            order_q = order_q.filter(Order.time_window == tw_enum)
        except KeyError:
            pass

    orders = order_q.all()
    if not orders:
        return _empty_area_response(area, time_slot_filter)

    order_ids = [o.id for o in orders]
    decisions = (
        db.session.query(Decision)
        .filter(Decision.order_id.in_(order_ids))
        .all()
    )

    total_orders = len(orders)
    go_count = sum(1 for d in decisions if d.decision == DecisionType.GO)
    no_go_count = sum(1 for d in decisions if d.decision == DecisionType.NO_GO)
    total_dec = len(decisions)

    success_rate = round(go_count / total_dec, 4) if total_dec else 0.0
    failure_rate = round(no_go_count / total_dec, 4) if total_dec else 0.0
    avg_risk = sum(d.risk_score for d in decisions) / total_dec if total_dec else 0
    risk_level = _risk_level_from_score(round(avg_risk)).value

    # Weather impact
    clear_decs = [d for d in decisions if not _is_rainy(d.weather_snapshot)]
    rainy_decs = [d for d in decisions if _is_rainy(d.weather_snapshot)]
    clear_go = sum(1 for d in clear_decs if d.decision == DecisionType.GO)
    rainy_go = sum(1 for d in rainy_decs if d.decision == DecisionType.GO)
    clear_sr = round(clear_go / len(clear_decs), 4) if clear_decs else 1.0
    rainy_sr = round(rainy_go / len(rainy_decs), 4) if rainy_decs else 0.0
    diff = clear_sr - rainy_sr
    rain_impact = "high" if diff >= 0.20 else ("medium" if diff >= 0.10 else "low")

    # By time slot
    order_id_to_order = {o.id: o for o in orders}
    by_slot: dict[str, dict] = {}
    best_slot_name = "morning"
    best_slot_rate = 0.0
    for slot in ("morning", "afternoon", "evening"):
        try:
            tw_enum = TimeWindow[slot.upper()]
        except KeyError:
            continue
        slot_orders = [o for o in orders if o.time_window == tw_enum]
        slot_ids = {o.id for o in slot_orders}
        slot_decs = [d for d in decisions if d.order_id in slot_ids]
        slot_go = sum(1 for d in slot_decs if d.decision == DecisionType.GO)
        slot_delivered = sum(1 for o in slot_orders if o.status == OrderStatus.DELIVERED)
        slot_failures = sum(
            1 for o in slot_orders
            if o.status in (OrderStatus.FAILED, OrderStatus.POSTPONED)
        )
        go_rate = round(slot_go / len(slot_decs), 4) if slot_decs else 0.0
        by_slot[slot] = {
            "total": len(slot_orders),
            "success_count": slot_delivered,
            "failure_count": slot_failures,
            "go_rate": go_rate,
        }
        if go_rate >= best_slot_rate:
            best_slot_rate = go_rate
            best_slot_name = slot

    # Top failure reasons — NLP classifier primary, keyword bucketing fallback
    from app.ml import failure_reason_predictor  # local import avoids circular at module load
    buckets: dict[str, int] = {"weather": 0, "customer": 0, "traffic": 0, "other": 0}
    for o in orders:
        if not o.failure_reason:
            continue
        category = failure_reason_predictor.predict_category(o.failure_reason)
        if category is None:
            # model absent — fall back to keyword bucketing
            r = o.failure_reason.lower()
            if any(w in r for w in ("rain", "weather", "storm", "flood")):
                category = "weather"
            elif any(w in r for w in ("customer", "not available", "absent", "refused", "nobody")):
                category = "customer"
            elif any(w in r for w in ("traffic", "jam", "road", "blocked", "accident")):
                category = "traffic"
            else:
                category = "other"
        buckets[category if category in buckets else "other"] += 1
    top_failure_reasons = sorted(
        [{"category": k, "count": v} for k, v in buckets.items() if v > 0],
        key=lambda x: x["count"],
        reverse=True,
    )

    model_predicted_failure_rate = round(avg_risk / 100, 4)

    return {
        "area": area,
        "time_slot_filter": time_slot_filter,
        "summary": {
            "total_orders": total_orders,
            "success_rate": success_rate,
            "failure_rate": failure_rate,
            "risk_level": risk_level,
        },
        "weather_impact": {
            "clear_success_rate": clear_sr,
            "rainy_success_rate": rainy_sr,
            "rain_impact": rain_impact,
        },
        "best_delivery_window": {
            "window": best_slot_name,
            "predicted_success_rate": best_slot_rate,
        },
        "by_time_slot": by_slot,
        "top_failure_reasons": top_failure_reasons,
        "model_predicted_failure_rate": model_predicted_failure_rate,
    }


# ── 5. Customer analytics ─────────────────────────────────────────────────────

def get_customer_analytics(address: str) -> dict:
    orders = (
        db.session.query(Order)
        .filter(Order.customer_address == address)
        .order_by(Order.created_at.desc())
        .all()
    )
    if not orders:
        raise NotFound("No order history found for this address.")

    total = len(orders)
    delivered = sum(1 for o in orders if o.status == OrderStatus.DELIVERED)
    failed = sum(1 for o in orders if o.status == OrderStatus.FAILED)
    postponed = sum(1 for o in orders if o.status == OrderStatus.POSTPONED)
    outcome_count = delivered + failed + postponed
    success_rate = round(delivered / outcome_count, 4) if outcome_count else 0.0
    failure_rate_pct = round((1 - success_rate) * 100)
    risk_level = _risk_level_from_score(failure_rate_pct).value

    # Preferred delivery time: most common window among delivered orders; fall back to all.
    source = [o for o in orders if o.status == OrderStatus.DELIVERED] or orders
    window_counts = Counter(o.time_window.value for o in source)
    preferred = window_counts.most_common(1)[0][0] if window_counts else "morning"

    recent_orders = [
        {
            "order_number": o.order_number,
            "date": o.created_at.date().isoformat() if o.created_at else None,
            "status": o.status.value,
            "time_window": o.time_window.value,
        }
        for o in orders[:5]
    ]

    return {
        "address": address,
        "summary": {
            "total_orders": total,
            "delivered": delivered,
            "failed": failed,
            "postponed": postponed,
            "success_rate": success_rate,
            "risk_level": risk_level,
        },
        "preferred_delivery_time": preferred,
        "recent_orders": recent_orders,
    }


# ── 6. Heatmap ────────────────────────────────────────────────────────────────

def get_heatmap(time_slot: str | None = None) -> dict:
    from app.ml import area_predictor  # local import avoids circular at module load

    # Live SQL aggregation — provides order_count and actual live failure rate.
    area_q = (
        db.session.query(
            Order.area,
            func.count(func.distinct(Order.id)).label("order_count"),
            func.sum(
                case((Order.status.in_([OrderStatus.FAILED, OrderStatus.POSTPONED]), 1), else_=0)
            ).label("failures"),
            func.avg(Decision.risk_score).label("avg_risk"),
        )
        .outerjoin(Decision, Decision.order_id == Order.id)
    )
    if time_slot:
        try:
            tw_enum = TimeWindow[time_slot.upper()]
            area_q = area_q.filter(Order.time_window == tw_enum)
        except KeyError:
            pass
    area_q = area_q.group_by(Order.area)
    rows = {r.area: r for r in area_q.all()}

    zones = []
    for area in AREAS:
        lat, lon = AREA_COORDS[area]
        r = rows.get(area)
        if r:
            cnt = r.order_count or 0
            failures = r.failures or 0
            live_failure_rate = round(failures / cnt, 4) if cnt else 0.0
        else:
            cnt, live_failure_rate = 0, 0.0

        # ML model prediction — primary source for heatmap coloring.
        # Falls back to live_failure_rate when model file is absent.
        if time_slot:
            ml_rate = area_predictor.predict_failure_rate(area, time_slot)
        else:
            ml_rate = area_predictor.predict_area_aggregate(area)
        failure_rate = ml_rate if ml_rate is not None else live_failure_rate

        zones.append({
            "area": area,
            "lat": lat,
            "lon": lon,
            "order_count": cnt,
            "failure_rate": failure_rate,
            "predicted_failure_rate": ml_rate,
            "live_failure_rate": live_failure_rate,
            "risk_band": _risk_band_from_failure_rate(failure_rate),
        })

    return {"zones": zones}


# ── 6b. Area Intelligence ─────────────────────────────────────────────────────

def get_area_intelligence(area: str) -> dict | None:
    """
    Per-area drill-down powered by the RF area/time model.

    Returns:
      success_rate        — model's average predicted success rate across time windows
      best_delivery_time  — time window with lowest predicted failure rate
      rain_impact         — pp increase in failure rate from clear (sev=0.1) to rainy (sev=0.7)
      weather_sensitivity — "high" / "medium" / "low" based on rain_impact magnitude
      risk_level          — "low" / "medium" / "high" based on average failure rate
      predictions_by_time — per-window predicted failure rates {morning, afternoon, evening}

    Returns None if area is not one of the five known Chennai areas.
    Accuracy caveat: predictions come from a model trained on synthetic data
    (see docs/progress.md Known Issue #3).
    """
    from app.ml import area_predictor

    if area not in AREAS:
        return None

    # Predictions across time windows under typical conditions.
    by_time = {
        tw: area_predictor.predict_failure_rate(area, tw, weather_severity=0.15)
        for tw in area_predictor.TIME_WINDOWS
    }

    # If model is unavailable, fall back to an empty response structure
    # that the caller can detect (all None values).
    if all(v is None for v in by_time.values()):
        return {
            "area": area,
            "success_rate": None,
            "best_delivery_time": None,
            "rain_impact": None,
            "weather_sensitivity": None,
            "risk_level": None,
            "predictions_by_time": by_time,
            "model_available": False,
        }

    avg_failure = sum(by_time.values()) / len(by_time)       # type: ignore[arg-type]
    best_time   = min(by_time, key=lambda tw: by_time[tw] or 1.0)

    # Rain impact: difference between rainy and clear predicted failure rate
    # (averaged across time windows to get a stable area-level estimate).
    rain_rates  = [area_predictor.predict_failure_rate(area, tw, weather_severity=0.70) or 0.0
                   for tw in area_predictor.TIME_WINDOWS]
    clear_rates = [area_predictor.predict_failure_rate(area, tw, weather_severity=0.10) or 0.0
                   for tw in area_predictor.TIME_WINDOWS]
    rain_impact = round(
        sum(rain_rates) / len(rain_rates) - sum(clear_rates) / len(clear_rates), 4
    )

    weather_sensitivity = (
        "high"   if rain_impact > 0.15 else
        "medium" if rain_impact > 0.08 else
        "low"
    )

    return {
        "area": area,
        "success_rate":        round(1.0 - avg_failure, 4),
        "best_delivery_time":  best_time,
        "rain_impact":         rain_impact,
        "weather_sensitivity": weather_sensitivity,
        "risk_level":          _risk_band_from_failure_rate(avg_failure),
        "predictions_by_time": {tw: round(1.0 - (v or 0.0), 4) for tw, v in by_time.items()},
        "model_available": True,
    }


# ── 7. Weather impact ─────────────────────────────────────────────────────────

def get_weather_impact(period: str) -> dict:
    if period not in ("week", "month"):
        period = "week"
    period_start = _period_start(period)

    rows = (
        db.session.query(
            Decision.created_at,
            Decision.weather_snapshot,
            Decision.decision,
            Decision.success_probability,
            Order.payment_amount,
        )
        .join(Order, Decision.order_id == Order.id)
        .filter(Decision.created_at >= period_start)
        .all()
    )

    # Group by date for daily correlation
    by_date: dict[str, list] = defaultdict(list)
    for row in rows:
        try:
            day = row.created_at.date().isoformat()
        except AttributeError:
            continue
        by_date[day].append(row)

    daily_correlation = []
    for day in sorted(by_date.keys()):
        day_rows = by_date[day]
        conds = [(r.weather_snapshot or {}).get("condition", "Unknown") for r in day_rows]
        dominant = max(set(conds), key=conds.count)
        go_count = sum(1 for r in day_rows if r.decision == DecisionType.GO)
        total = len(day_rows)
        daily_correlation.append({
            "date": day,
            "weather_condition": dominant,
            "success_rate": round(go_count / total, 4) if total else 0.0,
            "order_count": total,
        })

    # Summary by weather category
    cat_probs: dict[str, list[float]] = {"clear": [], "light_rain": [], "heavy_rain": []}
    revenue_lost = 0.0
    for row in rows:
        cat = _weather_category(row.weather_snapshot)
        cat_probs[cat].append(row.success_probability or 0.0)
        if _is_rainy(row.weather_snapshot) and row.decision == DecisionType.NO_GO:
            revenue_lost += row.payment_amount or 0.0

    return {
        "period": period,
        "daily_correlation": daily_correlation,
        "summary": {
            "clear_avg_success": _safe_avg(cat_probs["clear"]),
            "light_rain_avg_success": _safe_avg(cat_probs["light_rain"]),
            "heavy_rain_avg_success": _safe_avg(cat_probs["heavy_rain"]),
            "estimated_revenue_lost_to_weather_inr": round(revenue_lost, 2),
        },
    }
