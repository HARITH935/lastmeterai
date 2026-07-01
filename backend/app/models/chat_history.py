import enum
from datetime import datetime, timezone
from app.extensions import db


class MessageRole(enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


# NLP intent labels — must match the classifier's training labels in ml/src/training/train_nlp.py
class ChatIntent:
    ORDER_STATUS = "order_status"           # "Where is order #124?"
    EARNINGS_QUERY = "earnings_query"       # "How much will I earn today?"
    AREA_RISK = "area_risk"                 # "Which area has most failures?"
    REASSIGN_SUGGESTION = "reassign_suggestion" # "Suggest reassignments"
    WEATHER_QUERY = "weather_query"         # "Is it raining in Adyar?"
    AGENT_PERFORMANCE = "agent_performance" # "How is Ravi doing?"
    POSTPONE_QUERY = "postpone_query"       # "Which orders should be postponed?"
    GENERAL = "general"                     # catch-all


class ChatHistory(db.Model):
    """
    Persistent conversation log for the AI Chat feature (spec §2.11).

    Architecture per spec:
      1. User message arrives → NLP intent classifier runs (intent + confidence stored here).
      2. Backend fetches only the data relevant to that intent (stored in context_data).
      3. Gemini builds the final natural-language reply using that context.
      4. Both the user message and assistant reply are stored as separate rows
         with the same session_id.

    context_data lets us replay the data snapshot that produced a given reply
    (useful for debugging and for the Manager's analytics assistant).
    """

    __tablename__ = "chat_history"

    # ── Primary key ──────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # ── Owner ─────────────────────────────────────────────────────────────────
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ── Message ───────────────────────────────────────────────────────────────
    role = db.Column(db.Enum(MessageRole), nullable=False)
    message = db.Column(db.Text, nullable=False)

    # ── NLP classification (populated on user messages only) ──────────────────
    # One of the ChatIntent constants above; NULL on assistant rows.
    intent = db.Column(db.String(60), nullable=True)

    # Classifier confidence 0.0–1.0; used for fallback to GENERAL if low.
    intent_confidence = db.Column(db.Float, nullable=True)

    # ── Data context (populated on assistant messages only) ───────────────────
    # Records what DB data was fetched to construct the Gemini prompt.
    # Varies by intent:
    #   order_status:  {"order": {...}, "decision": {...}}
    #   area_risk:     {"area": "Adyar", "failure_rate": 0.22, "weather": {...}}
    #   earnings_query:{"agent_id": 3, "delivered_today": 4, "total": 480.0}
    context_data = db.Column(db.JSON, nullable=True)

    # ── Gemini usage ──────────────────────────────────────────────────────────
    # Tracked for cost visibility and to stay within free-tier limits.
    gemini_tokens_used = db.Column(db.Integer, nullable=True)

    # ── Session grouping ──────────────────────────────────────────────────────
    # UUID v4 — resets when the user clicks "New Conversation".
    # Allows the frontend to display grouped conversation threads.
    session_id = db.Column(db.String(36), nullable=True)

    # ── Timestamp ─────────────────────────────────────────────────────────────
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    user = db.relationship("User", back_populates="chat_messages")

    # ── Constraints & indexes ─────────────────────────────────────────────────
    __table_args__ = (
        db.CheckConstraint(
            "intent_confidence BETWEEN 0.0 AND 1.0 OR intent_confidence IS NULL",
            name="ck_chat_confidence_range",
        ),
        db.Index("ix_chat_user_id", "user_id"),
        db.Index("ix_chat_session_id", "session_id"),
        db.Index("ix_chat_intent", "intent"),
        db.Index("ix_chat_created_at", "created_at"),
        # Composite: fetch conversation thread in order
        db.Index("ix_chat_user_session", "user_id", "session_id"),
        # Composite: recent messages per user (chat history page)
        db.Index("ix_chat_user_created", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<ChatHistory id={self.id} role={self.role.value}"
            f" user={self.user_id} intent={self.intent!r}>"
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "role": self.role.value,
            "message": self.message,
            "intent": self.intent,
            "intent_confidence": self.intent_confidence,
            "session_id": self.session_id,
            "created_at": self.created_at.isoformat(),
        }
