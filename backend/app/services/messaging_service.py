"""
Customer messaging  ·  SMS / WhatsApp via Twilio

Sends delivery alerts to customers. Uses the Twilio REST API directly through
`requests` (no extra SDK dependency). When Twilio credentials are not
configured, it runs in SIMULATED mode: it logs the message and returns a
success result flagged `simulated=True`, so the whole flow is demoable without
a paid account. The moment the TWILIO_* env vars are set, real messages send.

Build alert bodies with build_status_message(); deliver with send_message().
"""

from __future__ import annotations

import logging
import re

import requests
from flask import current_app

log = logging.getLogger(__name__)

_TIMEOUT = 8  # seconds


# ── Phone normalisation ────────────────────────────────────────────────────────

def normalise_phone(raw: str | None, default_cc: str = "91") -> str | None:
    """Return an E.164-ish number (+CC…) from a raw stored phone, or None."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if raw.strip().startswith("+"):
        return "+" + digits
    # 10-digit local number → prefix default country code.
    if len(digits) == 10:
        return f"+{default_cc}{digits}"
    return "+" + digits


# ── Message bodies ─────────────────────────────────────────────────────────────

def build_status_message(order, tracking_url: str) -> str:
    """Customer-facing alert text for the order's current status."""
    name  = (order.customer_name or "there").split(" ")[0]
    num   = order.order_number
    status = order.status.value

    if status == "in_transit":
        return (f"Hi {name}, your LastMeter order {num} is OUT FOR DELIVERY and on its way! "
                f"Track live: {tracking_url}")
    if status == "delivered":
        return (f"Hi {name}, your LastMeter order {num} has been DELIVERED. "
                f"Thank you for choosing us!")
    if status == "postponed":
        return (f"Hi {name}, delivery of your LastMeter order {num} has been RESCHEDULED. "
                f"Details: {tracking_url}")
    if status == "failed":
        return (f"Hi {name}, we attempted delivery of order {num} but couldn't complete it. "
                f"Our team will reach out. Track: {tracking_url}")
    # pending / default
    return (f"Hi {name}, your LastMeter order {num} is confirmed. "
            f"Track its status anytime: {tracking_url}")


# ── Delivery ───────────────────────────────────────────────────────────────────

def _is_configured() -> bool:
    c = current_app.config
    return bool(c.get("TWILIO_ACCOUNT_SID") and c.get("TWILIO_AUTH_TOKEN"))


def send_message(to_phone: str, body: str, channel: str = "sms") -> dict:
    """
    Send an SMS or WhatsApp message.

    Returns { sent, simulated, channel, to, sid?, error? }.
    Never raises for provider/network errors — returns error in the dict.
    """
    to = normalise_phone(to_phone)
    if not to:
        return {"sent": False, "simulated": False, "channel": channel,
                "to": to_phone, "error": "No valid phone number on file."}

    c = current_app.config

    # ── Simulated mode ─────────────────────────────────────────────────────────
    if not _is_configured():
        log.info("[SIMULATED %s] → %s : %s", channel.upper(), to, body)
        return {"sent": True, "simulated": True, "channel": channel, "to": to,
                "sid": None}

    # ── Real Twilio send ───────────────────────────────────────────────────────
    sid   = c["TWILIO_ACCOUNT_SID"]
    token = c["TWILIO_AUTH_TOKEN"]

    if channel == "whatsapp":
        from_ = c.get("TWILIO_FROM_WHATSAPP")
        to_addr = f"whatsapp:{to}"
    else:
        from_ = c.get("TWILIO_FROM_SMS")
        to_addr = to

    if not from_:
        return {"sent": False, "simulated": False, "channel": channel, "to": to,
                "error": f"Twilio sender for {channel} not configured."}

    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    try:
        resp = requests.post(
            url,
            data={"From": from_, "To": to_addr, "Body": body},
            auth=(sid, token),
            timeout=_TIMEOUT,
        )
        if resp.status_code >= 400:
            msg = resp.json().get("message", resp.text) if resp.content else resp.reason
            log.warning("Twilio send failed (%s): %s", resp.status_code, msg)
            return {"sent": False, "simulated": False, "channel": channel, "to": to,
                    "error": msg}
        data = resp.json()
        return {"sent": True, "simulated": False, "channel": channel, "to": to,
                "sid": data.get("sid")}
    except requests.RequestException as exc:
        log.warning("Twilio request error: %s", exc)
        return {"sent": False, "simulated": False, "channel": channel, "to": to,
                "error": "Messaging provider unreachable."}
