"""
Customer tracking tokens  ·  stateless, no DB column

A tracking token lets a customer view a limited, read-only status page for
their order without logging in. The token is derived from the order id signed
with the app SECRET_KEY (HMAC-SHA256), so it is unguessable and needs no
database storage or migration.

Format:  "<order_id>.<sig>"  where sig = first 20 url-safe base64 chars of
HMAC(SECRET_KEY, "track:<order_id>").
"""

from __future__ import annotations

import base64
import hashlib
import hmac

from flask import current_app

_SIG_LEN = 20


def _sign(order_id: int) -> str:
    secret = current_app.config["SECRET_KEY"].encode()
    mac = hmac.new(secret, f"track:{order_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")[:_SIG_LEN]


def make_token(order_id: int) -> str:
    """Return a signed, shareable tracking token for an order."""
    return f"{order_id}.{_sign(order_id)}"


def verify_token(token: str) -> int | None:
    """Return the order id if the token is valid and untampered, else None."""
    if not token or "." not in token:
        return None
    id_part, _, sig = token.partition(".")
    if not id_part.isdigit():
        return None
    order_id = int(id_part)
    if not hmac.compare_digest(sig, _sign(order_id)):
        return None
    return order_id
