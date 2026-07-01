"""
Flask-Migrate CLI entry point.

Usage:
    cd backend
    flask --app manage:app db init          # first-time only — creates migrations/
    flask --app manage:app db migrate -m "initial schema"
    flask --app manage:app db upgrade
    flask --app manage:app db downgrade
    flask --app manage:app db history
    flask --app manage:app db current
"""

import os
from app import create_app
from app.extensions import db
from flask_migrate import Migrate  # noqa: F401 — imported so CLI picks it up

app = create_app(os.environ.get("FLASK_ENV", "development"))
