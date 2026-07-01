import enum
from datetime import datetime, timezone
from app.extensions import db


class DecisionType(enum.Enum):
    GO = "GO"
    NO_GO = "NO-GO"


class RiskLevel(enum.Enum):
    LOW = "low"       # risk_score 0–30   → safe to attempt
    MEDIUM = "medium" # risk_score 31–60  → proceed with caution
    HIGH = "high"     # risk_score 61–100 → likely NO-GO


def _risk_level_from_score(score: int) -> RiskLevel:
    """Derive RiskLevel enum from a 0-100 integer risk score."""
    if score <= 30:
        return RiskLevel.LOW
    elif score <= 60:
        return RiskLevel.MEDIUM
    return RiskLevel.HIGH


class Decision(db.Model):
    """
    One row per GO/NO-GO prediction run.  Multiple rows may exist per order
    (e.g. re-run after manager override or weather change); the latest row
    (ordered by created_at DESC) is the active decision.

    The 7 factor scores reflect raw input values fed to the model.
    shap_values stores signed percentage contributions toward NO-GO, used for
    the Improved Explainability Format (spec §2.10e).
    """

    __tablename__ = "decisions"

    # ── Primary key ──────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # CASCADE so decisions are removed when the parent order is deleted.
    order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ── Model provenance ──────────────────────────────────────────────────────
    # Which model produced this decision (aligned with model_metadata.model_name).
    model_name = db.Column(
        db.String(40), nullable=False, default="gonogo_lr"
    )
    model_version = db.Column(db.String(20), nullable=False)

    # ── Decision output ───────────────────────────────────────────────────────
    decision = db.Column(db.Enum(DecisionType), nullable=False)

    # Raw probability from the classifier (0.0 = certain failure, 1.0 = certain success).
    success_probability = db.Column(db.Float, nullable=False)

    # risk_score = round((1 - success_probability) * 100)  — spec §2.10c.
    risk_score = db.Column(db.Integer, nullable=False)

    # Derived band from risk_score; stored for fast filter/sort queries.
    risk_level = db.Column(db.Enum(RiskLevel), nullable=False)

    # ── The 7 GO/NO-GO factor raw values (spec §2.2) ─────────────────────────
    # Values are normalised 0.0–1.0 representing severity / risk contribution.

    weather_risk = db.Column(db.Float, nullable=False)
    # 0.0 = clear sky, 1.0 = severe storm; sourced from OpenWeatherMap at prediction time.

    customer_history_score = db.Column(db.Float, nullable=False)
    # Normalised count of past failed deliveries at this address (0.0–1.0).

    traffic_impact = db.Column(db.Float, nullable=False)
    # 0.0 = free flow, 1.0 = gridlock.

    agent_profit_score = db.Column(db.Float, nullable=False)
    # Profitability ratio: (payment_amount - estimated_cost) / payment_amount.
    # Low value → agent effort exceeds profit → higher NO-GO pressure.

    distance_score = db.Column(db.Float, nullable=False)
    # Distance to delivery point normalised against max expected range.

    time_of_day_score = db.Column(db.Float, nullable=False)
    # Risk weight by time window: morning < afternoon < evening (empirically).

    package_size_score = db.Column(db.Float, nullable=False)
    # small=0.1, medium=0.5, large=1.0 — large packages increase handling risk.

    # ── SHAP explainability (spec §2.10e) ─────────────────────────────────────
    # Keys match the 7 factor names above.
    # Values are signed % contribution toward NO-GO:
    #   positive → pushed toward NO-GO
    #   negative → pushed toward GO
    # Example: {"weather_risk": 35.2, "customer_history_score": 24.8,
    #            "distance_score": 15.1, "time_of_day_score": 10.3,
    #            "traffic_impact": 7.8, "package_size_score": 4.1,
    #            "agent_profit_score": 2.7}
    shap_values = db.Column(db.JSON, nullable=False)

    # ── Reschedule suggestion (spec §2.4, populated only on NO-GO) ───────────
    # {"suggested_date": "2026-06-26",
    #  "suggested_window": "afternoon",
    #  "predicted_success_probability": 0.83,
    #  "reason": "Rain clears by 26 Jun; afternoon traffic historically lower in Adyar"}
    reschedule_suggestion = db.Column(db.JSON, nullable=True)

    # ── Weather snapshot from OpenWeatherMap at prediction time ───────────────
    # Stored so historical decisions can be correlated with actual weather.
    # {"condition": "Light Rain", "temp_c": 29.4, "humidity": 82,
    #  "wind_kmh": 18.5, "description": "light rain"}
    weather_snapshot = db.Column(db.JSON, nullable=True)

    # ── Timestamp ─────────────────────────────────────────────────────────────
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    order = db.relationship("Order", back_populates="decisions")

    # ── Constraints & indexes ─────────────────────────────────────────────────
    __table_args__ = (
        db.CheckConstraint(
            "success_probability BETWEEN 0.0 AND 1.0",
            name="ck_decisions_probability_range",
        ),
        db.CheckConstraint(
            "risk_score BETWEEN 0 AND 100",
            name="ck_decisions_risk_score_range",
        ),
        db.CheckConstraint(
            "weather_risk BETWEEN 0.0 AND 1.0",
            name="ck_decisions_weather_risk_range",
        ),
        db.CheckConstraint(
            "customer_history_score BETWEEN 0.0 AND 1.0",
            name="ck_decisions_ch_score_range",
        ),
        # Single-column indexes
        db.Index("ix_decisions_order_id", "order_id"),
        db.Index("ix_decisions_decision", "decision"),
        db.Index("ix_decisions_risk_level", "risk_level"),
        db.Index("ix_decisions_created_at", "created_at"),
        db.Index("ix_decisions_model_version", "model_version"),
        # Composite: fetch latest decision for an order
        db.Index("ix_decisions_order_created", "order_id", "created_at"),
        # Composite: risk distribution queries (manager dashboard)
        db.Index("ix_decisions_risk_created", "risk_level", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<Decision order={self.order_id} {self.decision.value}"
            f" risk={self.risk_score} v={self.model_version}>"
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @property
    def top_shap_factors(self) -> list[tuple[str, float]]:
        """
        Return SHAP factors sorted by absolute contribution descending,
        filtered to those with |contribution| >= 5% (spec §2.10e).
        """
        return sorted(
            [(k, v) for k, v in self.shap_values.items() if abs(v) >= 5.0],
            key=lambda x: abs(x[1]),
            reverse=True,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "order_id": self.order_id,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "decision": self.decision.value,
            "success_probability": round(self.success_probability, 4),
            "risk_score": self.risk_score,
            "risk_level": self.risk_level.value,
            "factors": {
                "weather_risk": self.weather_risk,
                "customer_history_score": self.customer_history_score,
                "traffic_impact": self.traffic_impact,
                "agent_profit_score": self.agent_profit_score,
                "distance_score": self.distance_score,
                "time_of_day_score": self.time_of_day_score,
                "package_size_score": self.package_size_score,
            },
            "shap_values": self.shap_values,
            "top_factors": self.top_shap_factors,
            "reschedule_suggestion": self.reschedule_suggestion,
            "weather_snapshot": self.weather_snapshot,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_prediction(
        cls,
        order_id: int,
        model_name: str,
        model_version: str,
        success_probability: float,
        factor_scores: dict,
        shap_values: dict,
        weather_snapshot: dict | None = None,
        reschedule_suggestion: dict | None = None,
        threshold: float = 0.5,
    ) -> "Decision":
        """
        Factory that builds a Decision from raw ML output.
        Keeps risk_score and risk_level derivation in one place.
        """
        risk_score = round((1.0 - success_probability) * 100)
        return cls(
            order_id=order_id,
            model_name=model_name,
            model_version=model_version,
            decision=DecisionType.GO if success_probability >= threshold else DecisionType.NO_GO,
            success_probability=success_probability,
            risk_score=risk_score,
            risk_level=_risk_level_from_score(risk_score),
            weather_risk=factor_scores.get("weather_risk", 0.0),
            customer_history_score=factor_scores.get("customer_history_score", 0.0),
            traffic_impact=factor_scores.get("traffic_impact", 0.0),
            agent_profit_score=factor_scores.get("agent_profit_score", 0.0),
            distance_score=factor_scores.get("distance_score", 0.0),
            time_of_day_score=factor_scores.get("time_of_day_score", 0.0),
            package_size_score=factor_scores.get("package_size_score", 0.0),
            shap_values=shap_values,
            weather_snapshot=weather_snapshot,
            reschedule_suggestion=reschedule_suggestion,
        )
