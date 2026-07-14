import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


def _normalize_db_url(url: str) -> str:
    """
    Render (like Heroku) hands out DATABASE_URL as postgres://, but
    SQLAlchemy 1.4+/2.0 requires the postgresql:// scheme — connecting with
    the old scheme raises NoSuchModuleError at startup.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-jwt-secret-in-production")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    SOCKETIO_CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,https://lastmeterai-lq6p.vercel.app")
    OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
    TOMTOM_API_KEY = os.environ.get("TOMTOM_API_KEY")
    # Twilio SMS / WhatsApp (optional — falls back to simulated send when unset)
    TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
    TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
    TWILIO_FROM_SMS = os.environ.get("TWILIO_FROM_SMS")            # e.g. +14155238886
    TWILIO_FROM_WHATSAPP = os.environ.get("TWILIO_FROM_WHATSAPP")  # e.g. whatsapp:+14155238886
    PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "https://lastmeterai-lq6p.vercel.app")
    ML_MODELS_DIR = os.environ.get("ML_MODELS_DIR", "../ml/models")
    GONOGO_THRESHOLD = float(os.environ.get("GONOGO_THRESHOLD", "0.5"))


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///lastmeter_dev.db"
    )
    SQLALCHEMY_ECHO = False


class ProductionConfig(Config):
    DEBUG = False
    # Set DATABASE_URL to a Postgres connection string for persistence across
    # deploys — falls back to ephemeral SQLite (wiped on every deploy) if unset.
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(
        os.environ.get("DATABASE_URL", "sqlite:///lastmeter.db")
    )
    SQLALCHEMY_ECHO = False


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
