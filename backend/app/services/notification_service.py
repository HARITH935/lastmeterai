"""
Notification service — Module 11.

Exposes create_notification() for internal callers (decision_service,
order_service) and the full CRUD for the /api/notifications routes.

Design notes:
  - create_notification() does NOT commit — caller owns the transaction so
    the notification is rolled back together with its parent operation on failure.
  - mark_all_read() issues a single bulk UPDATE (not a loop), per arch doc §4.
  - unread_counts is computed with one GROUP BY query, not 4 separate counts.
"""

from sqlalchemy import and_, func
from sqlalchemy import update as sql_update

from app.extensions import db
from app.models.notification import Notification, NotificationCategory


# ── Custom exceptions ─────────────────────────────────────────────────────────

class NotificationNotFound(Exception):
    pass


class Forbidden(Exception):
    pass


class InvalidCategory(Exception):
    pass


# ── Shared creation helper ─────────────────────────────────────────────────────

def create_notification(
    user_id: int,
    category: str,
    title: str,
    message: str,
    order_id: int | None = None,
    extra: dict | None = None,
) -> Notification:
    """
    Stage a Notification row in the current session.  Does NOT commit.

    Called by:
      - decision_service.predict_and_save()  when a NO-GO is produced
      - order_service.update_order()         when agent_id changes

    Callers wrap this in their own transaction and commit after all side-effects.
    """
    try:
        cat = NotificationCategory(category)
    except ValueError:
        cat = NotificationCategory.SYSTEM_ALERT  # safe fallback

    notif = Notification(
        user_id=user_id,
        category=cat,
        title=title[:200],       # enforce VARCHAR(200) column limit
        message=message,
        order_id=order_id,
        extra=extra,
        is_read=False,
    )
    db.session.add(notif)
    db.session.flush()  # assign notif.id so the socket event carries the real ID

    try:
        from app.sockets.events import emit_new_notification  # noqa: PLC0415
        emit_new_notification(notif)
    except Exception:
        pass

    return notif


# ── Internal aggregate helper ──────────────────────────────────────────────────

def _unread_counts(user_id: int) -> dict:
    """
    Return unread notification counts per category for one user.
    Single GROUP BY query — not 4 separate scalar queries.
    """
    rows = (
        db.session.query(
            Notification.category,
            func.count(Notification.id).label("cnt"),
        )
        .filter(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
        .group_by(Notification.category)
        .all()
    )
    cnt_map = {row.category.value: row.cnt for row in rows}
    return {
        "ai_alert":       cnt_map.get("ai_alert", 0),
        "delivery_alert": cnt_map.get("delivery_alert", 0),
        "weather_alert":  cnt_map.get("weather_alert", 0),
        "system_alert":   cnt_map.get("system_alert", 0),
        "total":          sum(cnt_map.values()),
    }


# ── 1. List notifications ──────────────────────────────────────────────────────

def list_notifications(user, filters: dict) -> dict:
    page     = max(1, int(filters.get("page", 1)))
    per_page = min(50, max(1, int(filters.get("per_page", 20))))

    query = db.session.query(Notification).filter(Notification.user_id == user.id)

    if filters.get("category"):
        try:
            cat = NotificationCategory(filters["category"])
        except ValueError:
            raise InvalidCategory(f"Unknown category: {filters['category']!r}")
        query = query.filter(Notification.category == cat)

    if filters.get("is_read") is not None:
        query = query.filter(Notification.is_read == filters["is_read"])

    query = query.order_by(Notification.created_at.desc())

    total = query.count()
    rows  = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "data": [n.to_dict() for n in rows],
        "pagination": {
            "page":     page,
            "per_page": per_page,
            "total":    total,
            "pages":    max(1, -(-total // per_page)),
        },
        "unread_counts": _unread_counts(user.id),
    }


# ── 2. Mark single notification read ─────────────────────────────────────────

def mark_read(notification_id: int, user) -> dict:
    notif = db.session.get(Notification, notification_id)
    if not notif:
        raise NotificationNotFound()
    if notif.user_id != user.id:
        raise Forbidden()
    # Idempotent: set True even if already True.
    notif.is_read = True
    db.session.commit()
    return notif.to_dict()


# ── 3. Mark all read (bulk UPDATE) ────────────────────────────────────────────

def mark_all_read(user, category: str | None = None) -> dict:
    """
    Single bulk UPDATE — not a Python loop.
    Optional category restricts the update to one category.
    """
    where_expr = and_(
        Notification.user_id == user.id,
        Notification.is_read == False,  # noqa: E712
    )
    if category:
        try:
            cat = NotificationCategory(category)
        except ValueError:
            raise InvalidCategory(f"Unknown category: {category!r}")
        where_expr = and_(where_expr, Notification.category == cat)

    stmt = (
        sql_update(Notification)
        .where(where_expr)
        .values(is_read=True)
        .execution_options(synchronize_session=False)
    )
    result = db.session.execute(stmt)
    db.session.commit()
    return {"updated_count": result.rowcount}


# ── 4. Delete notification ────────────────────────────────────────────────────

def delete_notification(notification_id: int, user) -> None:
    notif = db.session.get(Notification, notification_id)
    if not notif:
        raise NotificationNotFound()
    if notif.user_id != user.id:
        raise Forbidden()
    db.session.delete(notif)
    db.session.commit()
