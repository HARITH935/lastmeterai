from datetime import datetime, timezone
from app.extensions import db


class AgentLocation(db.Model):
    """
    Live (simulated) GPS position for each Agent.
    One row per agent — updated in-place on every simulated position tick.

    Used for:
    - Command Center Map live agent dots (spec §2.10h)
    - Geofencing auto-status: distance-to-delivery-point check triggers
      status → "arrived" when within radius (Phase 2, spec §2.4)
    - Socket.IO broadcasts on update so the map animates smoothly.

    The unique constraint on agent_id enforces the one-row-per-agent invariant;
    the service layer uses INSERT OR REPLACE / upsert semantics.
    """

    __tablename__ = "agent_locations"

    # ── Primary key ──────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # One-to-one with users where role=agent.
    agent_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # ── Position ──────────────────────────────────────────────────────────────
    # Simulated GPS coordinates; constrained to Chennai bounding box.
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)

    # Derived area name for quick filtering without coordinate math.
    area = db.Column(db.String(80), nullable=True)

    # ── Motion state (for map animation) ─────────────────────────────────────
    heading = db.Column(db.Float, nullable=True)    # compass degrees 0–360
    speed_kmh = db.Column(db.Float, nullable=True)  # current simulated speed

    # ── Online state ──────────────────────────────────────────────────────────
    # False when the agent has ended their shift or logged out.
    is_online = db.Column(db.Boolean, nullable=False, default=True)

    # The order the agent is currently en-route to (NULL if idle / delivered).
    current_order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Timestamp ─────────────────────────────────────────────────────────────
    last_updated = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    agent = db.relationship("User", back_populates="location")
    current_order = db.relationship(
        "Order", foreign_keys=[current_order_id]
    )

    # ── Constraints & indexes ─────────────────────────────────────────────────
    __table_args__ = (
        db.CheckConstraint(
            "latitude BETWEEN 12.85 AND 13.20",
            name="ck_al_lat_chennai",
        ),
        db.CheckConstraint(
            "longitude BETWEEN 80.05 AND 80.35",
            name="ck_al_lon_chennai",
        ),
        db.CheckConstraint(
            "heading BETWEEN 0.0 AND 360.0 OR heading IS NULL",
            name="ck_al_heading_range",
        ),
        db.CheckConstraint(
            "speed_kmh >= 0.0 OR speed_kmh IS NULL",
            name="ck_al_speed_non_negative",
        ),
        db.Index("ix_al_agent_id", "agent_id", unique=True),
        db.Index("ix_al_is_online", "is_online"),
        db.Index("ix_al_area", "area"),
        db.Index("ix_al_last_updated", "last_updated"),
    )

    def __repr__(self) -> str:
        return (
            f"<AgentLocation agent={self.agent_id}"
            f" ({self.latitude:.5f}, {self.longitude:.5f})"
            f" online={self.is_online}>"
        )

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "agent_name": self.agent.name if self.agent else None,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "area": self.area,
            "heading": self.heading,
            "speed_kmh": self.speed_kmh,
            "is_online": self.is_online,
            "current_order_id": self.current_order_id,
            "last_updated": self.last_updated.isoformat(),
        }
