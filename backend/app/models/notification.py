import enum
from datetime import datetime, timezone
from app.extensions import db


class NotificationCategory(enum.Enum):
    AI_ALERT = "ai_alert"           # from AI Operations Center (spec §2.10g)
    DELIVERY_ALERT = "delivery_alert" # status changes, urgent deadlines
    WEATHER_ALERT = "weather_alert"   # OpenWeather-driven rain/storm warnings
    SYSTEM_ALERT = "system_alert"     # account/app-level messages


class Notification(db.Model):
    """
    In-app notification center (spec §E).  No email/SMS — in-app only.
    Each row targets exactly one user; the category drives the badge counts
    on the Notification Center UI and the per-category toggle preferences
    stored in users.notification_prefs.

    New rows are broadcast via Socket.IO so they appear live without refresh.
    """

    __tablename__ = "notifications"

    # ── Primary key ──────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # ── Target user ───────────────────────────────────────────────────────────
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ── Content ───────────────────────────────────────────────────────────────
    category = db.Column(db.Enum(NotificationCategory), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)

    # ── State ─────────────────────────────────────────────────────────────────
    is_read = db.Column(db.Boolean, nullable=False, default=False)

    # ── Related entity links (optional) ──────────────────────────────────────
    # Linked order, if the notification is order-specific.
    order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Flexible payload for extra context the frontend may use.
    # Examples:
    #   AI_ALERT:      {"recommendation_id": 7, "action": "reassign", "order_ids": [12, 15]}
    #   WEATHER_ALERT: {"area": "Adyar", "condition": "Heavy Rain", "wind_kmh": 45}
    #   SYSTEM_ALERT:  {"session_count": 3}
    extra = db.Column(db.JSON, nullable=True)

    # ── Timestamp ─────────────────────────────────────────────────────────────
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    user = db.relationship("User", back_populates="notifications")
    order = db.relationship("Order", back_populates="notifications")

    # ── Indexes ───────────────────────────────────────────────────────────────
    __table_args__ = (
        db.Index("ix_notif_user_id", "user_id"),
        db.Index("ix_notif_category", "category"),
        db.Index("ix_notif_is_read", "is_read"),
        # Composite: unread count per user (Notification Center badge)
        db.Index("ix_notif_user_read", "user_id", "is_read"),
        # Composite: filter by category within a user
        db.Index("ix_notif_user_category", "user_id", "category"),
        # Composite: paginated list newest-first
        db.Index("ix_notif_user_created", "user_id", "created_at"),
        # Composite: unread count per category per user
        db.Index("ix_notif_user_cat_read", "user_id", "category", "is_read"),
    )

    def __repr__(self) -> str:
        return (
            f"<Notification id={self.id} cat={self.category.value}"
            f" user={self.user_id} read={self.is_read}>"
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "category": self.category.value,
            "title": self.title,
            "message": self.message,
            "is_read": self.is_read,
            "order_id": self.order_id,
            "extra": self.extra,
            "created_at": self.created_at.isoformat(),
        }
