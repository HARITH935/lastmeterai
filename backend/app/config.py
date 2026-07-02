import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


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
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///lastmeter.db")
    SQLALCHEMY_ECHO = False


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
