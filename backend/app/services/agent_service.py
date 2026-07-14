"""
Agent provisioning service.

Agents are always pre-created by a Manager — no self-signup (see
app/models/user.py docstring). This service implements that: a manager sets
the new agent's username/password/area directly; the agent can change their
own password later via the existing auth_service.change_password() flow.
"""

from __future__ import annotations

from app.extensions import db, bcrypt
from app.models import User, Order, AuditLog, AuditAction, EntityType
from app.models.order import OrderStatus
from app.models.user import UserRole


def list_agents() -> list[dict]:
    """All agent accounts, newest first — includes agents with zero orders yet."""
    agents = (
        db.session.query(User)
        .filter(User.role == UserRole.AGENT)
        .order_by(User.created_at.desc())
        .all()
    )
    return [a.to_public_dict() for a in agents]


def create_agent(
    manager_id: str,
    username: str,
    password: str,
    name: str,
    area: str,
    phone: str | None = None,
) -> dict:
    """
    Create a new agent account. Raises ValueError with a safe, user-facing
    message on any validation failure.
    """
    username = (username or "").strip()
    name = (name or "").strip()
    area = (area or "").strip()
    password = password or ""

    if not username:
        raise ValueError("username is required.")
    if len(username) > 80:
        raise ValueError("username must be under 80 characters.")
    if " " in username:
        raise ValueError("username must not contain spaces.")
    if User.query.filter_by(username=username).first():
        raise ValueError("That username is already taken.")

    if not (1 <= len(name) <= 120):
        raise ValueError("name must be 1-120 characters.")

    if area not in User.VALID_AREAS:
        raise ValueError(f"area must be one of {', '.join(User.VALID_AREAS)}.")

    if len(password) < 8:
        raise ValueError("password must be at least 8 characters.")
    if len(password) > 128:
        raise ValueError("password must be under 128 characters.")

    clean_phone = None
    if phone:
        clean_phone = str(phone).strip()
        if not clean_phone.isdigit():
            raise ValueError("phone must contain digits only.")
        if not (10 <= len(clean_phone) <= 15):
            raise ValueError("phone must be 10-15 digits.")

    agent = User(
        username=username,
        password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
        role=UserRole.AGENT,
        name=name,
        phone=clean_phone,
        area=area,
    )
    db.session.add(agent)
    db.session.flush()  # assign agent.id without committing yet

    AuditLog.log(
        entity_type=EntityType.AGENT,
        entity_id=agent.id,
        action=AuditAction.AGENT_CREATED,
        description=f"Agent {agent.name} ({agent.username}) created for {area}",
        actor_id=int(manager_id),
    )
    db.session.commit()

    return agent.to_public_dict()


def set_agent_active(manager_id: str, agent_id: int, is_active: bool) -> dict:
    """
    Deactivate or reactivate an agent account.

    Deactivating is a soft-delete, not a row deletion: it preserves the
    agent's order/decision/rating history (Order.agent_id → SET NULL only
    fires on an actual row delete, which we deliberately never do) and just
    blocks them from logging in (auth_service.login checks is_active).

    Blocks deactivation while the agent has PENDING or IN_TRANSIT orders —
    deactivating them would leave live deliveries with an unreachable agent.
    Reassign those orders first (existing Smart Reassignment flow), then
    deactivate. No such restriction on reactivating.

    Raises ValueError with a safe, user-facing message on failure.
    """
    agent = db.session.get(User, agent_id)
    if not agent or agent.role != UserRole.AGENT:
        raise ValueError("Agent not found.")

    if agent.is_active == is_active:
        return agent.to_public_dict()  # already in the requested state — no-op

    if not is_active:
        active_count = (
            db.session.query(Order)
            .filter(
                Order.agent_id == agent_id,
                Order.status.in_([OrderStatus.PENDING, OrderStatus.IN_TRANSIT]),
            )
            .count()
        )
        if active_count:
            raise ValueError(
                f"{agent.name} has {active_count} active order(s) (pending/in transit). "
                "Reassign them to another agent before deactivating."
            )

    agent.is_active = is_active
    db.session.flush()

    AuditLog.log(
        entity_type=EntityType.AGENT,
        entity_id=agent.id,
        action=AuditAction.AGENT_DEACTIVATED if not is_active else AuditAction.AGENT_UPDATED,
        description=f"Agent {agent.name} ({agent.username}) "
                     f"{'deactivated' if not is_active else 'reactivated'}",
        actor_id=int(manager_id),
    )
    db.session.commit()

    return agent.to_public_dict()
