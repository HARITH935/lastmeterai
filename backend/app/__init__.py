import os
from flask import Flask, jsonify
from .extensions import db, jwt, socketio, bcrypt, migrate, limiter
from .config import config


def create_app(config_name: str | None = None) -> Flask:
    """Application factory."""
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "default")

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)

    # ── CORS ──────────────────────────────────────────────────────────────────
    # REST CORS stays origin-restricted. Socket.IO CORS is separate so the
    # native Flutter client can handshake (JWT is still required on connect).
    from flask_cors import CORS
    cors_origin_str = app.config.get("CORS_ORIGINS", "http://localhost:5173")
    cors_origins = [o.strip() for o in cors_origin_str.split(",")]
    # Socket.IO CORS is separate from REST. Native clients often send no Origin
    # (or the API host); keep JWT auth on connect and default to allow-all.
    socket_origins = app.config.get("SOCKETIO_CORS_ALLOWED_ORIGINS", "*")

    socketio.init_app(
        app,
        cors_allowed_origins=socket_origins,
        async_mode="eventlet",
    )

    # supports_credentials is intentionally omitted: auth is Bearer-token-only
    # (JWT in the Authorization header, stored in localStorage — no cookies,
    # frontend never sends `credentials: 'include'`). Combining a wildcard
    # origin with supports_credentials=True is invalid per the CORS spec and
    # makes flask-cors reflect the request's Origin instead of sending "*",
    # effectively allowing any site to receive credentialed responses. Without
    # it, CORS_ORIGINS="*" behaves as a plain, safe wildcard.
    CORS(
        app,
        origins=cors_origins,
        allow_headers=["Authorization", "Content-Type"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        max_age=3600,
    )

    # ── Rate limit error handler ──────────────────────────────────────────────
    from flask_limiter.errors import RateLimitExceeded

    @app.errorhandler(RateLimitExceeded)
    def handle_rate_limit(e):
        return jsonify({
            "error": "RATE_LIMIT_EXCEEDED",
            "message": "Too many messages. Please wait a moment before sending again.",
        }), 429

    # ── JWT callbacks ─────────────────────────────────────────────────────────
    from app.services.auth_service import is_token_revoked

    @jwt.token_in_blocklist_loader
    def check_if_revoked(jwt_header, jwt_payload):
        return is_token_revoked(jwt_header, jwt_payload)

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "TOKEN_EXPIRED", "message": "Token has expired.", "details": {}}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({"error": "TOKEN_INVALID", "message": "Token is invalid.", "details": {}}), 401

    @jwt.unauthorized_loader
    def unauthorized_callback(error):
        return jsonify({"error": "UNAUTHORIZED", "message": "Authorization token required.", "details": {}}), 401

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "TOKEN_REVOKED", "message": "Token has been revoked.", "details": {}}), 401

    # ── Import models so SQLAlchemy registers them before create_all ──────────
    with app.app_context():
        from .models import (  # noqa: F401
            User, Order, Decision, Notification,
            AuditLog, ModelMetadata, AgentLocation, ChatHistory,
        )
        # Register Socket.IO event handlers after models so ORM classes are
        # fully defined when the handlers' module-level code runs.
        from .sockets import events as _socket_events  # noqa: F401

    # ── Blueprints ────────────────────────────────────────────────────────────
    from .routes import register_blueprints
    register_blueprints(app)

    return app
