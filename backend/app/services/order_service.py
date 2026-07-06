"""
Order service — all business logic for the Orders module.
No Flask request/response objects. Called from app/routes/orders.py.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, desc as sql_desc, asc as sql_asc

from app.extensions import db
from app.models import (
    User, Order, Decision, AuditLog, AuditAction, EntityType,
    OrderStatus, PackageSize, TimeWindow, ResidenceType,
)
from app.models.decision import DecisionType, RiskLevel


# ── Custom exceptions (keep routes clean) ─────────────────────────────────────

class OrderNotFound(Exception):
    pass

class Forbidden(Exception):
    pass

class AreaMismatch(Exception):
    def __init__(self, msg="Agent area does not match order area."):
        super().__init__(msg)

class InvalidTransition(Exception):
    pass

class PredictionUnavailable(Exception):
    pass


# ── Valid status transitions ───────────────────────────────────────────────────

# Transitions available via PATCH /api/orders/:id/status (Agent endpoint).
# Agents cannot set in_transit — that happens when they start their route.
_AGENT_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PENDING:     {OrderStatus.POSTPONED},
    OrderStatus.IN_TRANSIT:  {OrderStatus.DELIVERED, OrderStatus.FAILED, OrderStatus.POSTPONED},
    OrderStatus.POSTPONED:   set(),   # agent cannot self-reschedule
    OrderStatus.DELIVERED:   set(),   # terminal
    OrderStatus.FAILED:      set(),   # terminal
}


# ── Serialisation helpers ──────────────────────────────────────────────────────

def _decision_to_detail(d: Decision) -> dict:
    """Decision dict for the nested latest_decision field in order detail."""
    return {
        "id":                    d.id,
        "decision":              d.decision.value,
        "success_probability":   round(d.success_probability, 4),
        "risk_score":            d.risk_score,
        "risk_level":            d.risk_level.value,
        "model_name":            d.model_name,
        "model_version":         d.model_version,
        "top_factors": [
            {"factor": factor, "contribution": round(contrib, 2)}
            for factor, contrib in d.top_shap_factors
        ],
        "weather_snapshot":      d.weather_snapshot,
        "reschedule_suggestion": d.reschedule_suggestion,
        "created_at":            d.created_at.isoformat(),
    }


def _order_detail_dict(order: Order) -> dict:
    """
    Extended serialisation for GET /api/orders/:id.
    Adds created_by and nested latest_decision (vs flat fields in list view).
    """
    base = order.to_dict()
    # Remove flat decision fields — detail view uses nested object instead.
    base.pop("decision",   None)
    base.pop("risk_score", None)
    base.pop("risk_level", None)
    base["created_by"]       = order.created_by
    latest = order.latest_decision
    base["latest_decision"]  = _decision_to_detail(latest) if latest else None
    from app.services import tracking_service
    base["tracking_token"]   = tracking_service.make_token(order.id)
    return base


def _serialize_list_row(order: Order, decision: Decision | None) -> dict:
    """
    Serialise one row from the list query — avoids lazy-load N+1.
    decision is pre-fetched from the LEFT OUTER JOIN.
    """
    return {
        "id":               order.id,
        "order_number":     order.order_number,
        "customer_name":    order.customer_name,
        "customer_phone":   order.customer_phone,
        "customer_address": order.customer_address,
        "area":             order.area,
        "city":             order.city,
        "latitude":         order.latitude,
        "longitude":        order.longitude,
        "residence_type":   order.residence_type.value,
        "agent_id":         order.agent_id,
        "agent_name":       order.agent.name if order.agent else None,
        "package_size":     order.package_size.value,
        "time_window":      order.time_window.value,
        "deadline":         order.deadline.isoformat(),
        "status":           order.status.value,
        "failure_reason":   order.failure_reason,
        "payment_amount":   order.payment_amount,
        "is_urgent":        order.is_urgent,
        "decision":         decision.decision.value if decision else None,
        "risk_score":       decision.risk_score if decision else None,
        "risk_level":       decision.risk_level.value if decision else None,
        "created_at":       order.created_at.isoformat(),
        "updated_at":       order.updated_at.isoformat(),
    }


# ── Internal helpers ───────────────────────────────────────────────────────────

def _assert_area_access(order: Order, current_user: User) -> None:
    """Raise Forbidden if an Agent requests an order outside their area."""
    if current_user.is_agent and order.area != current_user.area:
        raise Forbidden()


def _next_order_number() -> str:
    """Generate next LM-NNNN sequence. Uses MAX(id) so gaps from deletes don't matter."""
    max_id = db.session.query(func.max(Order.id)).scalar() or 0
    return f"LM-{max_id + 1:04d}"


def _validate_agent_assignment(area: str, agent_id: int | None) -> User | None:
    """
    If agent_id provided: verify the agent exists and their area matches.
    Returns the Agent User object or None.
    """
    if agent_id is None:
        return None
    agent = db.session.get(User, agent_id)
    if not agent or not agent.is_agent:
        raise ValueError("AGENT_NOT_FOUND")
    if agent.area != area:
        raise AreaMismatch(
            f"Agent {agent.username!r} is assigned to {agent.area!r},"
            f" but order area is {area!r}."
        )
    return agent


def _run_prediction_stub(order: Order) -> Decision | None:
    """
    Module 8 stub: attempts to call decision_service.predict_and_save()
    if Module 9 is already wired; otherwise creates a deterministic placeholder Decision.
    Returns None only on hard failure.
    """
    # Try real decision_service first (available after Module 9).
    try:
        from app.services import decision_service  # noqa: PLC0415
        return decision_service.predict_and_save(order)
    except (ImportError, AttributeError):
        pass
    except Exception:
        return None  # real ML error — fall through to stub

    # ── Deterministic placeholder ──────────────────────────────────────────────
    size_risk   = {"small": 0.10, "medium": 0.30, "large": 0.50}.get(order.package_size.value, 0.30)
    window_risk = {"morning": 0.10, "afternoon": 0.20, "evening": 0.40}.get(order.time_window.value, 0.20)
    success_p   = round(max(0.35, min(0.95, 0.80 - size_risk * 0.30 - window_risk * 0.20)), 4)
    risk_score  = round((1.0 - success_p) * 100)
    risk_level  = (
        RiskLevel.LOW    if risk_score <= 30 else
        RiskLevel.MEDIUM if risk_score <= 60 else
        RiskLevel.HIGH
    )

    shap = {
        "weather_risk":           5.1,
        "customer_history_score": 3.2,
        "traffic_impact":         2.9,
        "agent_profit_score":    -1.2,
        "distance_score":         8.4,
        "time_of_day_score":      round(window_risk * 20, 1),
        "package_size_score":     round(size_risk  * 20, 1),
    }

    reschedule = None
    if success_p < 0.5:
        reschedule = {
            "suggested_date":                 (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d"),
            "suggested_window":               "morning",
            "predicted_success_probability":  0.82,
            "reason":                         "Stub recommendation — real prediction available after Module 9.",
        }

    decision = Decision(
        order_id          = order.id,
        model_name        = "gonogo_lr",
        model_version     = "v1.0-stub",
        decision          = DecisionType.GO if success_p >= 0.5 else DecisionType.NO_GO,
        success_probability = success_p,
        risk_score        = risk_score,
        risk_level        = risk_level,
        weather_risk      = 0.15,
        customer_history_score = 0.10,
        traffic_impact    = 0.20,
        agent_profit_score = 0.75,
        distance_score    = 0.30,
        time_of_day_score = window_risk,
        package_size_score = size_risk,
        shap_values       = shap,
        reschedule_suggestion = reschedule,
        weather_snapshot  = {
            "condition":   "Clear",
            "temp_c":      31.0,
            "humidity":    65,
            "wind_kmh":    12.0,
            "description": "clear sky",
        },
    )
    db.session.add(decision)
    return decision


# ── list_orders ────────────────────────────────────────────────────────────────

def list_orders(current_user: User, filters: dict) -> dict:
    """
    Return paginated orders joined with their latest decision.
    Uses LEFT OUTER JOIN to pre-fetch decisions and avoid N+1 on serialization.
    Area isolation for agents enforced here (not at route layer).
    """
    # Subquery: max decision id per order = latest decision.
    max_dec_sq = (
        db.session.query(
            func.max(Decision.id).label("max_id"),
            Decision.order_id.label("order_id"),
        )
        .group_by(Decision.order_id)
        .subquery("max_d")
    )

    query = (
        db.session.query(Order, Decision)
        .outerjoin(max_dec_sq, Order.id == max_dec_sq.c.order_id)
        .outerjoin(Decision, Decision.id == max_dec_sq.c.max_id)
    )

    # ── Area isolation ─────────────────────────────────────────────────────────
    if current_user.is_agent:
        query = query.filter(Order.area == current_user.area)

    # ── Manager-only filters ───────────────────────────────────────────────────
    if current_user.is_manager:
        if filters.get("area"):
            query = query.filter(Order.area == filters["area"])
        if filters.get("agent_id"):
            query = query.filter(Order.agent_id == filters["agent_id"])

    # ── Common filters ─────────────────────────────────────────────────────────
    if filters.get("status"):
        query = query.filter(Order.status == OrderStatus(filters["status"]))
    if filters.get("package_size"):
        query = query.filter(Order.package_size == PackageSize(filters["package_size"]))
    if filters.get("is_urgent") is not None:
        query = query.filter(Order.is_urgent == filters["is_urgent"])
    if filters.get("date_from"):
        query = query.filter(Order.created_at >= filters["date_from"])
    if filters.get("date_to"):
        query = query.filter(Order.created_at <= filters["date_to"])
    if filters.get("search"):
        term = f"%{filters['search']}%"
        query = query.filter(
            db.or_(
                Order.order_number.ilike(term),
                Order.customer_name.ilike(term),
            )
        )
    if filters.get("risk_level"):
        query = query.filter(Decision.risk_level == RiskLevel(filters["risk_level"]))

    # ── Sort ───────────────────────────────────────────────────────────────────
    _SORT_COLS = {
        "created_at":     Order.created_at,
        "deadline":       Order.deadline,
        "payment_amount": Order.payment_amount,
        "risk_score":     Decision.risk_score,
    }
    sort_col = _SORT_COLS.get(filters.get("sort_by", "created_at"), Order.created_at)
    dir_fn = sql_desc if filters.get("sort_dir", "desc") == "desc" else sql_asc
    query = query.order_by(dir_fn(sort_col))

    # ── Paginate manually (avoids paginate() surprises on tuple queries) ────────
    page     = max(1, filters.get("page", 1))
    per_page = min(100, max(1, filters.get("per_page", 20)))
    total    = query.count()
    rows     = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "data": [_serialize_list_row(order, decision) for order, decision in rows],
        "pagination": {
            "page":     page,
            "per_page": per_page,
            "total":    total,
            "pages":    max(1, -(-total // per_page)),  # ceiling division
        },
    }


# ── create_order ───────────────────────────────────────────────────────────────

def create_order(current_user: User, data: dict) -> tuple[dict, bool]:
    """
    Create a new Order and run GO/NO-GO prediction.
    Returns (order_dict, prediction_failed).
    Raises: AreaMismatch, ValueError("AGENT_NOT_FOUND").
    """
    area     = data["area"]
    agent_id = data.get("agent_id")

    _validate_agent_assignment(area, agent_id)

    deadline = data["deadline"]
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    order = Order(
        order_number    = _next_order_number(),
        customer_name   = data["customer_name"].strip(),
        customer_phone  = (data.get("customer_phone") or "").strip() or None,
        customer_address = data["customer_address"].strip(),
        area            = area,
        city            = "Chennai",
        latitude        = data["latitude"],
        longitude       = data["longitude"],
        residence_type  = ResidenceType(data["residence_type"]),
        agent_id        = agent_id,
        package_size    = PackageSize(data["package_size"]),
        time_window     = TimeWindow(data["time_window"]),
        deadline        = deadline,
        status          = OrderStatus.PENDING,
        payment_amount  = data["payment_amount"],
        is_urgent       = deadline.date() <= datetime.now(timezone.utc).date(),
        created_by      = current_user.id,
    )
    db.session.add(order)
    db.session.flush()   # assign order.id before prediction

    prediction_failed = False
    try:
        _run_prediction_stub(order)
        db.session.flush()
    except Exception:
        prediction_failed = True

    AuditLog.log(
        entity_type = EntityType.ORDER,
        entity_id   = order.id,
        action      = AuditAction.ORDER_CREATED,
        description = f"Order {order.order_number} created by {current_user.name}",
        actor_id    = current_user.id,
        new_value   = {"order_number": order.order_number, "area": area},
    )

    db.session.commit()

    try:
        from app.sockets import events as _se  # noqa: PLC0415
        if order.agent_id:
            _se.emit_new_order_assigned(order)
        _se.emit_order_updated(order)
    except Exception:
        pass

    return _order_detail_dict(order), prediction_failed


# ── get_order ──────────────────────────────────────────────────────────────────

def get_order(order_id: int, current_user: User) -> dict:
    """
    Return full order detail dict.
    Raises: OrderNotFound, Forbidden.
    """
    order = db.session.get(Order, order_id)
    if not order:
        raise OrderNotFound()
    _assert_area_access(order, current_user)
    return _order_detail_dict(order)


# ── update_order ───────────────────────────────────────────────────────────────

# Fields whose change triggers a new GO/NO-GO prediction.
_PREDICTION_TRIGGER_FIELDS = {
    "area", "latitude", "longitude",
    "residence_type", "package_size", "time_window",
    "deadline", "payment_amount",
}


def update_order(order_id: int, current_user: User, data: dict) -> dict:
    """
    Full update of an order (Manager only).
    Re-runs prediction if any factor-input field changed.
    Raises: OrderNotFound, AreaMismatch, ValueError("AGENT_NOT_FOUND").
    """
    order = db.session.get(Order, order_id)
    if not order:
        raise OrderNotFound()

    old_snapshot = order.to_dict()
    prediction_inputs_changed = False

    # Collect which fields actually changed so we can set prediction_inputs_changed.
    updated_fields: dict = {}

    if data.get("customer_name") is not None:
        v = data["customer_name"].strip()
        if v != order.customer_name:
            order.customer_name = v
            updated_fields["customer_name"] = v

    if "customer_phone" in data:
        v = (data["customer_phone"] or "").strip() or None
        if v != order.customer_phone:
            order.customer_phone = v
            updated_fields["customer_phone"] = v

    if data.get("customer_address") is not None:
        v = data["customer_address"].strip()
        if v != order.customer_address:
            order.customer_address = v
            updated_fields["customer_address"] = v

    if data.get("area") is not None:
        if data["area"] != order.area:
            order.area = data["area"]
            updated_fields["area"] = data["area"]
            prediction_inputs_changed = True

    if data.get("latitude") is not None:
        if data["latitude"] != order.latitude:
            order.latitude = data["latitude"]
            updated_fields["latitude"] = data["latitude"]
            prediction_inputs_changed = True

    if data.get("longitude") is not None:
        if data["longitude"] != order.longitude:
            order.longitude = data["longitude"]
            updated_fields["longitude"] = data["longitude"]
            prediction_inputs_changed = True

    if data.get("residence_type") is not None:
        new_rt = ResidenceType(data["residence_type"])
        if new_rt != order.residence_type:
            order.residence_type = new_rt
            updated_fields["residence_type"] = data["residence_type"]
            prediction_inputs_changed = True

    if "agent_id" in data:
        new_agent_id = data["agent_id"]
        _validate_agent_assignment(order.area, new_agent_id)
        if new_agent_id != order.agent_id:
            order.agent_id = new_agent_id
            updated_fields["agent_id"] = new_agent_id
            # Notify the newly assigned agent (non-fatal; same transaction)
            if new_agent_id is not None:
                try:
                    from app.services import notification_service  # noqa: PLC0415
                    notification_service.create_notification(
                        user_id  = new_agent_id,
                        category = "delivery_alert",
                        title    = f"Order {order.order_number} assigned to you",
                        message  = (
                            f"Order {order.order_number} has been assigned to you in "
                            f"{order.area}. "
                            f"Package: {order.package_size.value}, "
                            f"Window: {order.time_window.value}."
                        ),
                        order_id = order.id,
                    )
                except Exception:
                    pass  # notification failure is non-fatal

    if data.get("package_size") is not None:
        new_ps = PackageSize(data["package_size"])
        if new_ps != order.package_size:
            order.package_size = new_ps
            updated_fields["package_size"] = data["package_size"]
            prediction_inputs_changed = True

    if data.get("time_window") is not None:
        new_tw = TimeWindow(data["time_window"])
        if new_tw != order.time_window:
            order.time_window = new_tw
            updated_fields["time_window"] = data["time_window"]
            prediction_inputs_changed = True

    if data.get("deadline") is not None:
        dl = data["deadline"]
        if dl.tzinfo is None:
            dl = dl.replace(tzinfo=timezone.utc)
        if dl != order.deadline:
            order.deadline = dl
            order.is_urgent = dl.date() <= datetime.now(timezone.utc).date()
            updated_fields["deadline"] = dl.isoformat()
            prediction_inputs_changed = True

    if data.get("payment_amount") is not None:
        if data["payment_amount"] != order.payment_amount:
            order.payment_amount = data["payment_amount"]
            updated_fields["payment_amount"] = data["payment_amount"]
            prediction_inputs_changed = True

    order.updated_at = datetime.now(timezone.utc)
    db.session.flush()

    if prediction_inputs_changed:
        try:
            _run_prediction_stub(order)
            db.session.flush()
        except Exception:
            pass  # prediction failure is non-fatal

    AuditLog.log(
        entity_type = EntityType.ORDER,
        entity_id   = order.id,
        action      = AuditAction.ORDER_UPDATED,
        description = f"Order {order.order_number} updated by {current_user.name}",
        actor_id    = current_user.id,
        old_value   = old_snapshot,
        new_value   = updated_fields,
    )
    db.session.commit()

    try:
        from app.sockets import events as _se  # noqa: PLC0415
        if "agent_id" in updated_fields and order.agent_id:
            _se.emit_new_order_assigned(order)
        _se.emit_order_updated(order)
    except Exception:
        pass

    return _order_detail_dict(order)


# ── delete_order ───────────────────────────────────────────────────────────────

def delete_order(order_id: int, current_user: User) -> str:
    """
    Hard-delete an order (and CASCADE decisions). Writes audit entry first.
    Returns the order_number for the success message.
    Raises: OrderNotFound.
    """
    order = db.session.get(Order, order_id)
    if not order:
        raise OrderNotFound()

    order_number = order.order_number

    AuditLog.log(
        entity_type = EntityType.ORDER,
        entity_id   = order_id,
        action      = AuditAction.ORDER_DELETED,
        description = f"Order {order_number} deleted by {current_user.name}",
        actor_id    = current_user.id,
        old_value   = order.to_dict(),
    )

    db.session.delete(order)
    db.session.commit()
    return order_number


# ── update_status ──────────────────────────────────────────────────────────────

def update_status(
    order_id: int,
    current_user: User,
    new_status_str: str,
    failure_reason: str | None,
) -> dict:
    """
    Agent marks an order delivered / failed / postponed.
    Enforces area isolation and valid transition rules.
    Raises: OrderNotFound, Forbidden, InvalidTransition.
    """
    order = db.session.get(Order, order_id)
    if not order:
        raise OrderNotFound()

    _assert_area_access(order, current_user)

    new_status = OrderStatus(new_status_str)
    allowed = _AGENT_TRANSITIONS.get(order.status, set())

    if new_status not in allowed:
        raise InvalidTransition(
            f"Cannot transition from '{order.status.value}' to '{new_status.value}'."
        )

    old_status = order.status
    order.status = new_status
    order.failure_reason = failure_reason
    order.updated_at = datetime.now(timezone.utc)

    AuditLog.log(
        entity_type = EntityType.ORDER,
        entity_id   = order.id,
        action      = AuditAction.ORDER_STATUS_CHANGED,
        description = (
            f"Order {order.order_number} marked"
            f" {new_status.value.title()} by {current_user.name}"
            + (f" — {failure_reason}" if failure_reason else "")
        ),
        actor_id    = current_user.id,
        old_value   = {"status": old_status.value},
        new_value   = {"status": new_status.value, "failure_reason": failure_reason},
    )
    db.session.commit()

    try:
        from app.sockets import events as _se  # noqa: PLC0415
        _se.emit_order_updated(order)
        # Recalculate route when an order exits active delivery (failed / postponed).
        if new_status in (OrderStatus.FAILED, OrderStatus.POSTPONED) and order.agent_id:
            from app.services import route_service as _rs  # noqa: PLC0415
            new_route = _rs.get_optimized_route_for_agent(order.agent_id)
            if new_route is not None:
                _se.emit_route_updated(order.agent_id, new_route)
    except Exception:
        pass

    return {
        "id":             order.id,
        "order_number":   order.order_number,
        "status":         order.status.value,
        "failure_reason": order.failure_reason,
        "updated_at":     order.updated_at.isoformat(),
    }


# ── get_decision_history ───────────────────────────────────────────────────────

def get_decision_history(order_id: int, current_user: User, page: int, per_page: int) -> dict:
    """
    Paginated decision history for an order, newest-first.
    Raises: OrderNotFound, Forbidden.
    """
    order = db.session.get(Order, order_id)
    if not order:
        raise OrderNotFound()

    _assert_area_access(order, current_user)

    page     = max(1, page)
    per_page = min(100, max(1, per_page))

    q = (
        Decision.query
        .filter_by(order_id=order_id)
        .order_by(Decision.created_at.desc())
    )
    total = q.count()
    rows  = q.offset((page - 1) * per_page).limit(per_page).all()

    def _fmt(d: Decision) -> dict:
        base = d.to_dict()
        base["top_factors"] = [
            {"factor": f, "contribution": round(c, 2)}
            for f, c in d.top_shap_factors
        ]
        return base

    return {
        "data": [_fmt(d) for d in rows],
        "pagination": {
            "page":     page,
            "per_page": per_page,
            "total":    total,
            "pages":    max(1, -(-total // per_page)),
        },
    }
