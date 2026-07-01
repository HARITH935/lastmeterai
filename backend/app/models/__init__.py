"""
SQLAlchemy models for LastMeter AI.

Import order matters — SQLAlchemy resolves string-based relationship
references at mapper configuration time, so all models must be imported
before the first db.create_all() or alembic migration run.
"""

from .user import User, UserRole
from .order import Order, OrderStatus, PackageSize, TimeWindow, ResidenceType
from .decision import Decision, DecisionType, RiskLevel
from .notification import Notification, NotificationCategory
from .audit_log import AuditLog, AuditAction, EntityType
from .model_metadata import ModelMetadata, ModelName
from .agent_location import AgentLocation
from .chat_history import ChatHistory, MessageRole, ChatIntent

__all__ = [
    # Users
    "User",
    "UserRole",
    # Orders
    "Order",
    "OrderStatus",
    "PackageSize",
    "TimeWindow",
    "ResidenceType",
    # Decisions
    "Decision",
    "DecisionType",
    "RiskLevel",
    # Notifications
    "Notification",
    "NotificationCategory",
    # Audit
    "AuditLog",
    "AuditAction",
    "EntityType",
    # Model metadata
    "ModelMetadata",
    "ModelName",
    # Agent locations
    "AgentLocation",
    # Chat
    "ChatHistory",
    "MessageRole",
    "ChatIntent",
]
