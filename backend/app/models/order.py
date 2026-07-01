import enum
from datetime import datetime, date, timezone
from app.extensions import db


class PackageSize(enum.Enum):
    SMALL = "small"      # ≤ 2 kg, fits in a bag
    MEDIUM = "medium"    # 2–10 kg, standard box
    LARGE = "large"      # > 10 kg, bulky item


class TimeWindow(enum.Enum):
    MORNING = "morning"       # 08:00 – 12:00
    AFTERNOON = "afternoon"   # 12:00 – 16:00
    EVENING = "evening"       # 16:00 – 20:00


class ResidenceType(enum.Enum):
    APARTMENT = "apartment"       # gate/security access risk
    INDEPENDENT = "independent"   # direct access, variable availability


class OrderStatus(enum.Enum):
    PENDING = "pending"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    FAILED = "failed"
    POSTPONED = "postponed"


class Order(db.Model):
    """
    Core delivery order.  Every order belongs to one Chennai area and is
    optionally assigned to one Agent.  The latest Decision row drives the
    GO/NO-GO card shown on the frontend.
    """

    __tablename__ = "orders"

    VALID_AREAS = ["Anna Nagar", "T Nagar", "Velachery", "Adyar", "Porur"]

    # ── Primary key ──────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Human-readable identifier shown in the UI, e.g. "LM-0001"
    order_number = db.Column(db.String(20), unique=True, nullable=False)

    # ── Customer ─────────────────────────────────────────────────────────────
    customer_name = db.Column(db.String(120), nullable=False)
    customer_phone = db.Column(db.String(20), nullable=True)
    customer_address = db.Column(db.Text, nullable=False)

    # Area drives agent assignment and ML risk profiling.
    area = db.Column(db.String(80), nullable=False)

    # Multi-city hook.
    city = db.Column(db.String(80), nullable=False, default="Chennai")

    # Coordinates for Leaflet pins and geofencing radius checks.
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)

    # Apartment → gate/security risk factor; independent → variable availability.
    residence_type = db.Column(db.Enum(ResidenceType), nullable=False)

    # ── Assignment ────────────────────────────────────────────────────────────
    # SET NULL on agent delete so orders are not lost when an agent is removed.
    agent_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Delivery details ──────────────────────────────────────────────────────
    package_size = db.Column(db.Enum(PackageSize), nullable=False)
    time_window = db.Column(db.Enum(TimeWindow), nullable=False)

    # When the delivery must be completed by.
    # If deadline.date() == today → is_urgent is auto-set at creation.
    deadline = db.Column(db.DateTime(timezone=True), nullable=False)

    # ── Status & outcome ──────────────────────────────────────────────────────
    status = db.Column(
        db.Enum(OrderStatus), nullable=False, default=OrderStatus.PENDING
    )

    # Free-text reason when status = failed or postponed.
    # Phase 2: NLP classifier will categorise this into a failure-reason enum.
    failure_reason = db.Column(db.Text, nullable=True)

    # ── Financials ────────────────────────────────────────────────────────────
    # Simulated — no real payment gateway (spec §4).
    payment_amount = db.Column(db.Float, nullable=False)

    # ── Flags ─────────────────────────────────────────────────────────────────
    # True when deadline == today, or manually escalated by manager.
    # The GO/NO-GO card shows "URGENT" instead of just "GO" in this state.
    is_urgent = db.Column(db.Boolean, nullable=False, default=False)

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
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
    agent = db.relationship(
        "User", foreign_keys=[agent_id], back_populates="assigned_orders"
    )
    creator = db.relationship(
        "User", foreign_keys=[created_by], back_populates="created_orders"
    )
    # Ordered newest-first so .decisions.first() always gives the latest run.
    decisions = db.relationship(
        "Decision",
        back_populates="order",
        lazy="dynamic",
        cascade="all, delete-orphan",
        order_by="Decision.created_at.desc()",
    )
    notifications = db.relationship(
        "Notification",
        back_populates="order",
        lazy="dynamic",
    )

    # ── Constraints & composite indexes ───────────────────────────────────────
    __table_args__ = (
        db.CheckConstraint(
            "area IN ('Anna Nagar','T Nagar','Velachery','Adyar','Porur')",
            name="ck_orders_valid_area",
        ),
        db.CheckConstraint(
            "payment_amount >= 0",
            name="ck_orders_payment_non_negative",
        ),
        # Bounding box for Chennai — rejects obviously wrong coordinates.
        db.CheckConstraint(
            "latitude BETWEEN 12.80 AND 13.25",
            name="ck_orders_lat_chennai",
        ),
        db.CheckConstraint(
            "longitude BETWEEN 80.10 AND 80.35",
            name="ck_orders_lon_chennai",
        ),
        # Single-column indexes
        db.Index("ix_orders_order_number", "order_number", unique=True),
        db.Index("ix_orders_agent_id", "agent_id"),
        db.Index("ix_orders_area", "area"),
        db.Index("ix_orders_status", "status"),
        db.Index("ix_orders_deadline", "deadline"),
        db.Index("ix_orders_created_at", "created_at"),
        db.Index("ix_orders_is_urgent", "is_urgent"),
        # Composite indexes for common query patterns
        db.Index("ix_orders_area_status", "area", "status"),
        db.Index("ix_orders_agent_status", "agent_id", "status"),
        db.Index("ix_orders_deadline_urgent", "deadline", "is_urgent"),
        db.Index("ix_orders_area_created", "area", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Order {self.order_number!r} status={self.status.value}>"

    # ── Helpers ───────────────────────────────────────────────────────────────

    @property
    def latest_decision(self):
        """Most recent Decision row for this order, or None."""
        return self.decisions.first()

    @property
    def is_deadline_today(self) -> bool:
        return self.deadline.date() == date.today()

    def to_dict(self) -> dict:
        d = self.latest_decision
        return {
            "id": self.id,
            "order_number": self.order_number,
            "customer_name": self.customer_name,
            "customer_phone": self.customer_phone,
            "customer_address": self.customer_address,
            "area": self.area,
            "city": self.city,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "residence_type": self.residence_type.value,
            "agent_id": self.agent_id,
            "agent_name": self.agent.name if self.agent else None,
            "package_size": self.package_size.value,
            "time_window": self.time_window.value,
            "deadline": self.deadline.isoformat(),
            "status": self.status.value,
            "failure_reason": self.failure_reason,
            "payment_amount": self.payment_amount,
            "is_urgent": self.is_urgent,
            "decision": d.decision.value if d else None,
            "risk_score": d.risk_score if d else None,
            "risk_level": d.risk_level.value if d else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
