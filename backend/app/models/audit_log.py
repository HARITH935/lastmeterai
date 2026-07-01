import enum
from datetime import datetime, timezone
from app.extensions import db


class EntityType(enum.Enum):
    ORDER = "order"
    AGENT = "agent"
    DECISION = "decision"
    SYSTEM = "system"


# Exhaustive list of action codes used across the application.
# Keeping them as constants avoids magic strings scattered across services.
class AuditAction:
    # Order lifecycle
    ORDER_CREATED = "order_created"
    ORDER_UPDATED = "order_updated"
    ORDER_DELETED = "order_deleted"
    ORDER_REASSIGNED = "order_reassigned"
    ORDER_STATUS_CHANGED = "order_status_changed"

    # AI / ML
    AI_FLAGGED_NO_GO = "ai_flagged_no_go"
    AI_FLAGGED_GO = "ai_flagged_go"
    AI_RECOMMENDATION_ACCEPTED = "ai_recommendation_accepted"

    # Agent
    AGENT_CREATED = "agent_created"
    AGENT_UPDATED = "agent_updated"
    AGENT_DEACTIVATED = "agent_deactivated"
    AGENT_ZONE_ENTERED = "agent_zone_entered"   # geofencing (Phase 2)

    # Auth / system
    MANAGER_LOGIN = "manager_login"
    AGENT_LOGIN = "agent_login"
    PASSWORD_CHANGED = "password_changed"


class AuditLog(db.Model):
    """
    Immutable activity log.  Every significant state change writes a row here.
    The Activity Feed on Manager and Agent dashboards (spec §2.10 #5) is a
    human-readable, real-time-styled rendering of this table (newest first,
    scoped by role).

    Rows are never updated or deleted — this is an append-only audit trail.
    """

    __tablename__ = "audit_logs"

    # ── Primary key ──────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # ── What was affected ─────────────────────────────────────────────────────
    entity_type = db.Column(db.Enum(EntityType), nullable=False)
    entity_id = db.Column(db.Integer, nullable=True)  # NULL for system-level events

    # ── What happened ─────────────────────────────────────────────────────────
    action = db.Column(db.String(80), nullable=False)

    # Pre-formatted Activity Feed text for direct display.
    # Example: "Order #124 marked Delivered by Agent Ravi"
    description = db.Column(db.Text, nullable=False)

    # ── Who did it ────────────────────────────────────────────────────────────
    # NULL means the ML pipeline or a scheduled job was the actor.
    actor_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Before / after snapshots (for edits) ─────────────────────────────────
    old_value = db.Column(db.JSON, nullable=True)
    new_value = db.Column(db.JSON, nullable=True)

    # ── Timestamp ─────────────────────────────────────────────────────────────
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    actor = db.relationship(
        "User",
        foreign_keys=[actor_id],
        back_populates="audit_actions",
    )

    # ── Indexes ───────────────────────────────────────────────────────────────
    __table_args__ = (
        db.Index("ix_audit_entity_type", "entity_type"),
        db.Index("ix_audit_entity_id", "entity_id"),
        db.Index("ix_audit_action", "action"),
        db.Index("ix_audit_actor_id", "actor_id"),
        db.Index("ix_audit_created_at", "created_at"),
        # Composite: look up all log rows for a specific entity
        db.Index("ix_audit_entity_type_id", "entity_type", "entity_id"),
        # Composite: Activity Feed query (recent rows, newest first)
        db.Index("ix_audit_actor_created", "actor_id", "created_at"),
        # Composite: filter by action type within a time range
        db.Index("ix_audit_action_created", "action", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog {self.action!r}"
            f" {self.entity_type.value}:{self.entity_id}"
            f" actor={self.actor_id}>"
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "entity_type": self.entity_type.value,
            "entity_id": self.entity_id,
            "action": self.action,
            "description": self.description,
            "actor_id": self.actor_id,
            "actor_name": self.actor.name if self.actor else "System",
            "old_value": self.old_value,
            "new_value": self.new_value,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def log(
        cls,
        entity_type: EntityType,
        action: str,
        description: str,
        entity_id: int | None = None,
        actor_id: int | None = None,
        old_value: dict | None = None,
        new_value: dict | None = None,
    ) -> "AuditLog":
        """Convenience factory — call from services, not routes."""
        from app.extensions import db as _db
        entry = cls(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            description=description,
            actor_id=actor_id,
            old_value=old_value,
            new_value=new_value,
        )
        _db.session.add(entry)

        try:
            from app.sockets.events import emit_activity_feed  # noqa: PLC0415
            actor_name = None
            if actor_id:
                from app.models.user import User as _User  # noqa: PLC0415
                _u = _db.session.get(_User, actor_id)
                actor_name = _u.name if _u else None
            emit_activity_feed(entry, actor_name)
        except Exception:
            pass

        return entry
