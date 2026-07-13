import enum
from datetime import datetime, timezone
from app.extensions import db


class UserRole(enum.Enum):
    MANAGER = "manager"
    AGENT = "agent"


class User(db.Model):
    """
    Unified account table for Managers and Agents.
    Agents are always pre-created by a Manager — no self-signup.
    Managers have area=NULL; Agents have exactly one of the 5 Chennai areas.
    """

    __tablename__ = "users"

    # 20 Chennai areas. Original 5 (index 0-4) plus 15 added 2026-07-13 with
    # individually researched flood-risk/traffic profiles — see
    # ml/data/generate_dataset.py AREA_PARAMS for the reasoning behind each.
    VALID_AREAS = [
        "Anna Nagar", "T Nagar", "Velachery", "Adyar", "Porur",
        "Mylapore", "Nungambakkam", "Guindy", "Tambaram", "Sholinganallur",
        "Thiruvanmiyur", "Besant Nagar", "Kilpauk", "Egmore", "Vadapalani",
        "Koyambedu", "Ambattur", "Perambur", "Chromepet", "Saidapet",
    ]

    # ── Primary key ──────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # ── Identity ─────────────────────────────────────────────────────────────
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum(UserRole), nullable=False)

    # ── Profile ───────────────────────────────────────────────────────────────
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20), nullable=True)

    # Agents only — one of the 5 Chennai delivery areas; NULL for managers.
    area = db.Column(db.String(80), nullable=True)

    # Multi-city hook (spec §2.10 note) — no feature work, just the column.
    city = db.Column(db.String(80), nullable=False, default="Chennai")

    # ── State ─────────────────────────────────────────────────────────────────
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    # Notification category toggles — serialised as JSON.
    # {"ai_alert": true, "delivery_alert": true, "weather_alert": true, "system_alert": true}
    notification_prefs = db.Column(
        db.JSON,
        nullable=False,
        default=lambda: {
            "ai_alert": True,
            "delivery_alert": True,
            "weather_alert": True,
            "system_alert": True,
        },
    )

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    assigned_orders = db.relationship(
        "Order",
        foreign_keys="Order.agent_id",
        back_populates="agent",
        lazy="dynamic",
    )
    created_orders = db.relationship(
        "Order",
        foreign_keys="Order.created_by",
        back_populates="creator",
        lazy="dynamic",
    )
    notifications = db.relationship(
        "Notification",
        back_populates="user",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )
    audit_actions = db.relationship(
        "AuditLog",
        foreign_keys="AuditLog.actor_id",
        back_populates="actor",
        lazy="dynamic",
    )
    chat_messages = db.relationship(
        "ChatHistory",
        back_populates="user",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )
    # One live-location row per agent; NULL for managers.
    location = db.relationship(
        "AgentLocation",
        back_populates="agent",
        uselist=False,
        cascade="all, delete-orphan",
    )

    # ── Constraints & composite indexes ───────────────────────────────────────
    __table_args__ = (
        db.CheckConstraint(
            "area IN (" + ",".join(f"'{a}'" for a in VALID_AREAS) + ")"
            " OR area IS NULL",
            name="ck_users_valid_area",
        ),
        db.Index("ix_users_username", "username", unique=True),
        db.Index("ix_users_role", "role"),
        db.Index("ix_users_area", "area"),
        db.Index("ix_users_role_active", "role", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<User {self.username!r} role={self.role.value}>"

    # ── Helpers ───────────────────────────────────────────────────────────────

    @property
    def is_manager(self) -> bool:
        return self.role == UserRole.MANAGER

    @property
    def is_agent(self) -> bool:
        return self.role == UserRole.AGENT

    def to_public_dict(self) -> dict:
        """Serialise without password_hash."""
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role.value,
            "name": self.name,
            "phone": self.phone,
            "area": self.area,
            "city": self.city,
            "is_active": self.is_active,
            "notification_prefs": self.notification_prefs,
            "created_at": self.created_at.isoformat(),
        }
