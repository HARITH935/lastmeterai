"""
Public tracking blueprint  ·  /api/track/*

No authentication — reachable by anyone holding a valid signed token.
Exposes only customer-safe fields (never phone, exact address, payment, or
internal risk scores).
"""

from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify

from app.extensions import db
from app.models import Order, User, AgentLocation
from app.services import tracking_service, eta_service

bp = Blueprint("tracking", __name__, url_prefix="/api/track")

# Customer-facing status copy.
_STATUS_COPY = {
    "pending":    ("Order confirmed",   "Your order is confirmed and awaiting dispatch."),
    "in_transit": ("Out for delivery",  "Your delivery agent is on the way."),
    "delivered":  ("Delivered",         "Your order has been delivered. Thank you!"),
    "failed":     ("Delivery attempted", "We couldn't complete delivery. Our team will reach out."),
    "postponed":  ("Rescheduled",       "Your delivery has been rescheduled."),
}

_TIMELINE = ["pending", "in_transit", "delivered"]


def _first_name(name: str) -> str:
    return name.strip().split(" ")[0] if name else "Customer"


@bp.get("/<token>")
def track(token: str):
    """Public read-only order status by signed token."""
    order_id = tracking_service.verify_token(token)
    if order_id is None:
        return jsonify({"error": "INVALID_TOKEN", "message": "This tracking link is invalid or expired."}), 404

    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "NOT_FOUND", "message": "Order not found."}), 404

    status = order.status.value
    title, message = _STATUS_COPY.get(status, ("Processing", "Your order is being processed."))

    agent_name = None
    if order.agent_id is not None:
        agent = db.session.get(User, order.agent_id)
        agent_name = agent.name if agent else None

    # Customer destination coordinates (they know their own address).
    destination = {"lat": order.latitude, "lon": order.longitude}

    # Live agent vehicle position — only while en route and recently seen.
    agent_location = None
    if order.agent_id is not None and status in ("pending", "in_transit"):
        loc = db.session.query(AgentLocation).filter_by(agent_id=order.agent_id).first()
        if loc and loc.is_online and loc.last_updated:
            last = loc.last_updated
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last < timedelta(minutes=10):
                agent_location = {"lat": loc.latitude, "lon": loc.longitude}

    payload = {
        "order_number":   order.order_number,
        "customer_name":  _first_name(order.customer_name),
        "area":           order.area,
        "city":           order.city,
        "status":         status,
        "status_title":   title,
        "status_message": message,
        "time_window":    order.time_window.value,
        "package_size":   order.package_size.value,
        "is_urgent":      order.is_urgent,
        "agent_name":     agent_name,
        "timeline":       _TIMELINE,
        "destination":    destination,
        "agent_location": agent_location,
        "eta":            None,
    }

    # Live ETA only while the order is still on its way.
    if status in ("pending", "in_transit"):
        try:
            eta = eta_service.predict_eta(order)
            payload["eta"] = {
                "predicted_min": eta["predicted_min"],
                "eta_low_min":   eta["eta_low_min"],
                "eta_high_min":  eta["eta_high_min"],
                "eta_time":      eta["eta_time"],
                "distance_km":   eta["distance_km"],
            }
        except Exception:
            payload["eta"] = None

    return jsonify(payload), 200
