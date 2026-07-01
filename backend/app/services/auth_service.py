"""
Authentication service.
Pure business logic — no Flask request/response objects.
Called from app/routes/auth.py.
"""

from datetime import datetime, timezone

from flask_jwt_extended import create_access_token, create_refresh_token, decode_token, get_jwt

from app.extensions import db, bcrypt
from app.models import User, AuditLog, AuditAction, EntityType

# ── JWT blocklist ──────────────────────────────────────────────────────────────
# In-memory set per security design §10.1.
# Grows only on logout / password-change events (infrequent).
# Swap to Redis for production multi-process deployments.
_BLOCKLIST: set[str] = set()


def is_token_revoked(_jwt_header: dict, jwt_payload: dict) -> bool:
    """Registered as Flask-JWT-Extended token_in_blocklist_loader."""
    return jwt_payload.get("jti") in _BLOCKLIST


def _revoke(jti: str | None) -> None:
    if jti:
        _BLOCKLIST.add(jti)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_tokens(user: User) -> tuple[str, str]:
    """Issue a new access + refresh token pair for a user."""
    access = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role.value, "area": user.area},
    )
    refresh = create_refresh_token(identity=str(user.id))
    return access, refresh


# ── Login ─────────────────────────────────────────────────────────────────────

def login(username: str, password: str) -> tuple[dict, str, str]:
    """
    Validate credentials and return (user_dict, access_token, refresh_token).
    Raises ValueError with a safe, user-facing message on failure.

    Uses a constant-time path to prevent username-enumeration timing attacks:
    bcrypt.check_password_hash runs even when the user doesn't exist.
    """
    username = (username or "").strip()
    password = password or ""

    user = User.query.filter_by(username=username).first()

    # Always run bcrypt to avoid timing differences between "wrong username"
    # and "wrong password" (spec §10 — timing attack prevention).
    dummy_hash = "$2b$12$invalidhashfortimingxxxxxxxxxxxxxx"
    hash_to_check = user.password_hash if user else dummy_hash
    password_ok = bcrypt.check_password_hash(hash_to_check, password)

    if not user or not password_ok:
        raise ValueError("Invalid credentials.")

    if not user.is_active:
        raise ValueError("Account is disabled. Contact your manager.")

    access_token, refresh_token = _build_tokens(user)

    action = AuditAction.MANAGER_LOGIN if user.is_manager else AuditAction.AGENT_LOGIN
    AuditLog.log(
        entity_type=EntityType.AGENT,
        entity_id=user.id,
        action=action,
        description=f"{'Manager' if user.is_manager else 'Agent'} {user.name} logged in",
        actor_id=user.id,
    )
    db.session.commit()

    return user.to_public_dict(), access_token, refresh_token


# ── Logout ────────────────────────────────────────────────────────────────────

def logout() -> None:
    """Add the current request's access token JTI to the blocklist."""
    _revoke(get_jwt().get("jti"))


# ── Token refresh ─────────────────────────────────────────────────────────────

def refresh_tokens(refresh_token_str: str) -> tuple[str, str]:
    """
    Decode a refresh token from the request body, validate it, and issue a
    new access + refresh token pair (sliding-window rotation).

    Raises ValueError if the token is invalid, expired, or belongs to an
    inactive user.
    """
    try:
        payload = decode_token(refresh_token_str)
    except Exception:
        raise ValueError("Refresh token is invalid or expired.")

    if payload.get("type") != "refresh":
        raise ValueError("Not a refresh token.")

    user_id = payload.get("sub")
    user = db.session.get(User, int(user_id))
    if not user or not user.is_active:
        raise ValueError("User not found or account is disabled.")

    return _build_tokens(user)


# ── Get current user ──────────────────────────────────────────────────────────

def get_current_user(user_id: str) -> dict:
    user = db.session.get(User, int(user_id))
    if not user:
        raise ValueError("User not found.")
    return user.to_public_dict()


# ── Change password ───────────────────────────────────────────────────────────

def change_password(
    user_id: str,
    current_password: str,
    new_password: str,
    confirm_password: str,
) -> None:
    """
    Validate current password, apply new bcrypt hash, and revoke the active
    access token so the user must log in again with the new credentials.

    Raises ValueError on any validation failure.
    """
    if not current_password:
        raise ValueError("current_password is required.")
    if not new_password:
        raise ValueError("new_password is required.")
    if not confirm_password:
        raise ValueError("confirm_password is required.")

    if new_password != confirm_password:
        raise ValueError("new_password and confirm_password do not match.")

    if len(new_password) < 8:
        raise ValueError("New password must be at least 8 characters.")

    if len(new_password) > 128:
        raise ValueError("New password must be under 128 characters.")

    if new_password == current_password:
        raise ValueError("New password must differ from the current password.")

    user = db.session.get(User, int(user_id))
    if not user:
        raise ValueError("User not found.")

    if not bcrypt.check_password_hash(user.password_hash, current_password):
        raise ValueError("Current password is incorrect.")

    user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    user.updated_at = datetime.now(timezone.utc)

    # Revoke this session — user must re-login with new credentials.
    _revoke(get_jwt().get("jti"))

    AuditLog.log(
        entity_type=EntityType.AGENT,
        entity_id=user.id,
        action=AuditAction.PASSWORD_CHANGED,
        description=f"{user.name} changed their password",
        actor_id=user.id,
    )
    db.session.commit()


# ── Update profile ────────────────────────────────────────────────────────────

_VALID_PREF_KEYS = {"ai_alert", "delivery_alert", "weather_alert", "system_alert"}


def update_profile(user_id: str, data: dict) -> dict:
    """
    Update name, phone, and/or notification_prefs.
    Unknown keys in `data` are silently ignored (allowlist enforced in route).
    Returns updated public user dict.
    """
    user = db.session.get(User, int(user_id))
    if not user:
        raise ValueError("User not found.")

    if "name" in data:
        name = str(data["name"]).strip()
        if not (1 <= len(name) <= 120):
            raise ValueError("name must be 1–120 characters.")
        user.name = name

    if "phone" in data:
        phone = data["phone"]
        if phone is not None:
            phone = str(phone).strip()
            if not phone.isdigit():
                raise ValueError("phone must contain digits only.")
            if not (10 <= len(phone) <= 15):
                raise ValueError("phone must be 10–15 digits.")
        user.phone = phone or None

    if "notification_prefs" in data:
        prefs = data["notification_prefs"]
        if not isinstance(prefs, dict):
            raise ValueError("notification_prefs must be an object.")
        current = dict(user.notification_prefs or {})
        for key in _VALID_PREF_KEYS:
            if key in prefs:
                if not isinstance(prefs[key], bool):
                    raise ValueError(f"notification_prefs.{key} must be true or false.")
                current[key] = prefs[key]
        user.notification_prefs = current

    user.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return user.to_public_dict()
