"""
Socket.IO event handlers — Module 12.

Connection lifecycle, client-initiated events, and server-emit helpers.
All emit helpers are non-fatal (try/except) so a socket failure never
breaks the synchronous REST path.
"""

import logging
from datetime import datetime, timezone

from flask import request
from flask_jwt_extended import decode_token
from flask_socketio import emit, join_room, leave_room

from app.extensions import db, socketio
from app.models import User, AgentLocation

log = logging.getLogger(__name__)

# Chennai bounding box — mirrors CHECK constraints in AgentLocation
_LAT_MIN, _LAT_MAX = 12.80, 13.25
_LON_MIN, _LON_MAX = 80.10, 80.35

# sid → {"user_id": int, "role": str}  — populated on connect, cleared on disconnect
_sessions: dict[str, dict] = {}


# ── JWT helper ────────────────────────────────────────────────────────────────

def _resolve_user(auth) -> tuple[int, str]:
    """
    Decode JWT from auth dict (preferred) or query string.
    Returns (user_id, role) or raises on failure.
    """
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")
    if not token:
        token = request.args.get("token")
    if not token:
        raise ValueError("No token")

    decoded  = decode_token(token)
    user_id  = int(decoded["sub"])
    user     = db.session.get(User, user_id)
    if not user or not user.is_active:
        raise ValueError(f"User {user_id} inactive or not found")
    return user_id, user.role.value


# ── Connection lifecycle ──────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect(auth=None):
    try:
        user_id, role = _resolve_user(auth)
    except Exception as exc:
        log.info("Socket connection rejected: %s", exc)
        return False  # returning False rejects the connection

    _sessions[request.sid] = {"user_id": user_id, "role": role}

    user_room = f"user_{user_id}"
    join_room(user_room)
    if role == "manager":
        join_room("managers")

    emit("connected", {"user_id": user_id, "role": role, "room": user_room})
    log.debug("Socket connected sid=%s user=%s role=%s", request.sid, user_id, role)


@socketio.on("disconnect")
def on_disconnect():
    info = _sessions.pop(request.sid, None)
    if not info or info["role"] != "agent":
        return
    user_id = info["user_id"]
    try:
        loc = db.session.query(AgentLocation).filter_by(agent_id=user_id).first()
        if loc:
            loc.is_online    = False
            loc.last_updated = datetime.now(timezone.utc)
            db.session.commit()
            log.debug("Agent %s marked offline on disconnect", user_id)
    except Exception as exc:
        log.debug("Disconnect cleanup failed for agent %s: %s", user_id, exc)


# ── Client → Server: agent location update ───────────────────────────────────

@socketio.on("agent_location_update")
def on_location_update(data):
    """
    Agent pushes simulated GPS position.
    Validates Chennai bbox; logs and drops invalid coords rather than crashing.
    Upserts agent_locations and broadcasts to managers room.
    """
    info = _sessions.get(request.sid)
    if not info or info["role"] != "agent":
        return
    user_id = info["user_id"]

    try:
        lat     = float(data.get("lat", data.get("latitude", 0)))
        lon     = float(data.get("lon", data.get("longitude", 0)))
        heading = data.get("heading")
        speed   = data.get("speed_kmh")

        if not (_LAT_MIN <= lat <= _LAT_MAX and _LON_MIN <= lon <= _LON_MAX):
            log.debug(
                "agent_location_update: invalid coords (%.5f, %.5f) from user %s — dropped",
                lat, lon, user_id,
            )
            return

        user = db.session.get(User, user_id)
        loc  = db.session.query(AgentLocation).filter_by(agent_id=user_id).first()
        if loc:
            loc.latitude     = lat
            loc.longitude    = lon
            loc.is_online    = True
            loc.last_updated = datetime.now(timezone.utc)
            if heading is not None:
                loc.heading   = float(heading)
            if speed is not None:
                loc.speed_kmh = float(speed)
        else:
            loc = AgentLocation(
                agent_id     = user_id,
                latitude     = lat,
                longitude    = lon,
                area         = user.area if user else None,
                heading      = float(heading) if heading is not None else None,
                speed_kmh    = float(speed)   if speed   is not None else None,
                is_online    = True,
                last_updated = datetime.now(timezone.utc),
            )
            db.session.add(loc)
        db.session.commit()

        emit_agent_location({
            "agent_id":   user_id,
            "agent_name": user.name if user else None,
            "lat":        lat,
            "lon":        lon,
            "heading":    heading,
            "is_online":  True,
        })

    except Exception as exc:
        log.warning("agent_location_update error for user %s: %s", user_id, exc)


# ── Client → Server: room management ─────────────────────────────────────────

@socketio.on("join_order_room")
def on_join_order_room(data):
    order_id = (data or {}).get("order_id")
    if order_id:
        join_room(f"order_{order_id}")


@socketio.on("leave_order_room")
def on_leave_order_room(data):
    order_id = (data or {}).get("order_id")
    if order_id:
        leave_room(f"order_{order_id}")


@socketio.on("join_room")
def on_join_room(data):
    room = (data or {}).get("room")
    if room:
        join_room(room)


@socketio.on("leave_room")
def on_leave_room(data):
    room = (data or {}).get("room")
    if room:
        leave_room(room)


# ── Client → Server: presence ─────────────────────────────────────────────────

@socketio.on("mark_online")
def on_mark_online(data=None):
    info = _sessions.get(request.sid)
    if not info or info["role"] != "agent":
        return
    try:
        loc = db.session.query(AgentLocation).filter_by(agent_id=info["user_id"]).first()
        if loc:
            loc.is_online    = True
            loc.last_updated = datetime.now(timezone.utc)
            db.session.commit()
    except Exception:
        pass


@socketio.on("mark_offline")
def on_mark_offline(data=None):
    info = _sessions.get(request.sid)
    if not info or info["role"] != "agent":
        return
    try:
        loc = db.session.query(AgentLocation).filter_by(agent_id=info["user_id"]).first()
        if loc:
            loc.is_online    = False
            loc.last_updated = datetime.now(timezone.utc)
            db.session.commit()
    except Exception:
        pass


# ── Server → Client emit helpers ──────────────────────────────────────────────
# Called from existing services.  Always non-fatal.

def _safe_emit(event: str, data: dict, room: str | None = None):
    try:
        if room:
            socketio.emit(event, data, room=room)
        else:
            # No room → broadcast to all connected clients.
            # socketio.emit() (object method) does not accept broadcast=True;
            # omitting the room parameter achieves the same effect.
            socketio.emit(event, data)
    except Exception as exc:
        log.debug("Socket emit failed (%s → %r): %s", event, room, exc)


def emit_order_updated(order, decision=None):
    """Emit order_updated to the assigned agent's room."""
    if not order.agent_id:
        return
    _safe_emit(
        "order_updated",
        {
            "order_id":     order.id,
            "order_number": order.order_number,
            "status":       order.status.value,
            "decision":     decision.decision.value if decision else None,
            "risk_score":   decision.risk_score     if decision else None,
        },
        room=f"user_{order.agent_id}",
    )


def emit_new_order_assigned(order):
    """Emit new_order_assigned to the assigned agent's room."""
    if not order.agent_id:
        return
    _safe_emit(
        "new_order_assigned",
        {
            "order_id":     order.id,
            "order_number": order.order_number,
            "area":         order.area,
            "deadline":     order.deadline.isoformat() if order.deadline else None,
        },
        room=f"user_{order.agent_id}",
    )


def emit_new_notification(notification):
    """Emit new_notification to the target user's room."""
    _safe_emit(
        "new_notification",
        {
            "notification_id": notification.id,
            "category":        notification.category.value,
            "title":           notification.title,
            "message":         notification.message,
        },
        room=f"user_{notification.user_id}",
    )


def emit_ai_decision(order, decision):
    """Emit ai_decision to the managers room after any GO/NO-GO prediction."""
    _safe_emit(
        "ai_decision",
        {
            "order_id":     order.id,
            "order_number": order.order_number,
            "decision":     decision.decision.value,
            "risk_level":   decision.risk_level.value,
            "risk_score":   decision.risk_score,
        },
        room="managers",
    )


def emit_agent_location(location_data: dict):
    """Broadcast agent location to the managers room."""
    _safe_emit("agent_location", location_data, room="managers")


def emit_activity_feed(audit_entry, actor_name: str | None = None):
    """Broadcast new audit log entry to all connected clients."""
    _safe_emit(
        "activity_feed",
        {
            "id":          audit_entry.id,    # may be None before flush
            "description": audit_entry.description,
            "action":      str(audit_entry.action),
            "actor_name":  actor_name or "System",
            "created_at":  (
                audit_entry.created_at.isoformat()
                if audit_entry.created_at else None
            ),
        },
    )
