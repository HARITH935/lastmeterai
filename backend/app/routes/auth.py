"""
Auth blueprint  ·  /api/auth/*

Thin HTTP adapters only — all business logic lives in auth_service.
Follows the API contract exactly (docs/api/contract.md §1 — Auth).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import limiter
from app.services import auth_service

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _err(code: str, msg: str, status: int, details: dict | None = None):
    """Consistent error envelope per API contract."""
    return jsonify({"error": code, "message": msg, "details": details or {}}), status


# ── POST /api/auth/login ──────────────────────────────────────────────────────

@bp.post("/login")
@limiter.limit("5 per minute")
def login():
    """
    🔓 Public

    Request:  { "username": str, "password": str }
    Response: { "access_token": str, "refresh_token": str, "user": {...} }
    """
    body = request.get_json(silent=True) or {}
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")

    # Field-level validation before hitting the DB.
    errors = {}
    if not username:
        errors["username"] = "Required."
    elif len(username) > 80:
        errors["username"] = "Must be under 80 characters."
    elif " " in username:
        errors["username"] = "Must not contain spaces."
    if not password:
        errors["password"] = "Required."
    elif len(password) < 6:
        errors["password"] = "Must be at least 6 characters."
    elif len(password) > 128:
        errors["password"] = "Must be under 128 characters."

    if errors:
        return _err("VALIDATION_ERROR", "Invalid input.", 400, errors)

    try:
        user, access_token, refresh_token = auth_service.login(username, password)
    except ValueError as exc:
        msg = str(exc)
        if "disabled" in msg:
            return _err("ACCOUNT_DISABLED", msg, 403)
        return _err("INVALID_CREDENTIALS", msg, 401)

    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }), 200


# ── POST /api/auth/logout ─────────────────────────────────────────────────────

@bp.post("/logout")
@jwt_required()
def logout():
    """
    🔑 Any authenticated user

    Adds current access token JTI to the in-memory blocklist.
    """
    auth_service.logout()
    return jsonify({"message": "Logged out successfully."}), 200


# ── POST /api/auth/refresh ────────────────────────────────────────────────────

@bp.post("/refresh")
@limiter.limit("10 per minute")
def refresh():
    """
    🔑 Requires refresh token (not access token)

    Request:  { "refresh_token": str }
    Response: { "access_token": str, "refresh_token": str }

    Issues a new access + rotated refresh token pair (sliding-window rotation).
    """
    body = request.get_json(silent=True) or {}
    token_str = str(body.get("refresh_token") or "").strip()

    if not token_str:
        return _err("VALIDATION_ERROR", "refresh_token is required.", 400)

    try:
        access_token, new_refresh = auth_service.refresh_tokens(token_str)
    except ValueError as exc:
        msg = str(exc)
        code = "TOKEN_INVALID" if "invalid" in msg.lower() else "TOKEN_EXPIRED"
        return _err(code, msg, 401)

    return jsonify({
        "access_token": access_token,
        "refresh_token": new_refresh,
    }), 200


# ── GET /api/auth/me ──────────────────────────────────────────────────────────

@bp.get("/me")
@jwt_required()
def me():
    """
    🔑 Any authenticated user

    Returns the full profile of the currently authenticated user.
    Used on app load to restore session and determine role-based routing.
    """
    try:
        user = auth_service.get_current_user(get_jwt_identity())
    except ValueError as exc:
        return _err("NOT_FOUND", str(exc), 404)

    return jsonify(user), 200


# ── PATCH /api/auth/me/password ───────────────────────────────────────────────

@bp.patch("/me/password")
@jwt_required()
def change_password():
    """
    🔑 Any authenticated user

    Request:  { "current_password": str, "new_password": str, "confirm_password": str }
    Revokes the current session on success — user must log in again.
    """
    body = request.get_json(silent=True) or {}
    current_password  = str(body.get("current_password")  or "")
    new_password      = str(body.get("new_password")      or "")
    confirm_password  = str(body.get("confirm_password")  or "")

    errors = {}
    if not current_password:
        errors["current_password"] = "Required."
    if not new_password:
        errors["new_password"] = "Required."
    if not confirm_password:
        errors["confirm_password"] = "Required."

    if errors:
        return _err("VALIDATION_ERROR", "Invalid input.", 400, errors)

    try:
        auth_service.change_password(
            get_jwt_identity(),
            current_password,
            new_password,
            confirm_password,
        )
    except ValueError as exc:
        msg = str(exc)
        if "incorrect" in msg:
            return _err("WRONG_PASSWORD", msg, 401)
        return _err("VALIDATION_ERROR", msg, 400)

    return jsonify({"message": "Password updated successfully."}), 200


# ── PATCH /api/auth/me/profile ────────────────────────────────────────────────

@bp.patch("/me/profile")
@jwt_required()
def update_profile():
    """
    🔑 Any authenticated user

    Updatable fields: name, phone, notification_prefs
    Agents cannot change their area via this endpoint.
    """
    body = request.get_json(silent=True) or {}

    # Allowlist — silently drop anything else (mass-assignment prevention §10.11).
    allowed = {"name", "phone", "notification_prefs"}
    data = {k: v for k, v in body.items() if k in allowed}

    if not data:
        return _err("VALIDATION_ERROR", "No updatable fields provided.", 400)

    try:
        user = auth_service.update_profile(get_jwt_identity(), data)
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)

    return jsonify(user), 200
