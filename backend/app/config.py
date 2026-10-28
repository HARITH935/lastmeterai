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

    # RAG (retrieval-augmented Q&A — app/rag/). Embeddings + reranking run
    # locally via sentence-transformers — no API key required for retrieval.
    # Generation reuses GEMINI_API_KEY above. Render's web service has no
    # persistent disk, so RAG_CHROMA_DIR is rebuilt lazily on first query
    # each time the instance restarts rather than assumed to survive deploys.
    RAG_SOP_DIR = os.environ.get("RAG_SOP_DIR", "../ml/rag/docs")
    RAG_CHROMA_DIR = os.environ.get("RAG_CHROMA_DIR", "../ml/rag/chroma")
    # "gemini" keeps the process small enough for a 512MB instance: the local
    # backend pulls in ~365MB of torch runtime, which alone exceeds what's left
    # after the app and its ML models. "local" runs on-device instead — no API
    # key and no per-query network call, for hosts with memory to spare.
    # Switching provider changes vector dimensions, so it needs a full reindex.
    RAG_EMBEDDING_PROVIDER = os.environ.get("RAG_EMBEDDING_PROVIDER", "gemini")
    RAG_GEMINI_EMBEDDING_MODEL = os.environ.get("RAG_GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
    RAG_EMBEDDING_MODEL = os.environ.get("RAG_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    RAG_RERANK_MODEL = os.environ.get("RAG_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
    RAG_TOP_K = int(os.environ.get("RAG_TOP_K", "6"))
    # Caps the decision backfill, newest first. 0 means no cap. See the note
    # in decision_indexer.reindex_all — this bounds cold-start rebuild time.
    RAG_MAX_INDEXED_DECISIONS = int(os.environ.get("RAG_MAX_INDEXED_DECISIONS", "300"))
    # Off by default: the cross-encoder is the only remaining reason to load
    # torch (~365MB), which is exactly what moving embeddings to Gemini was
    # meant to avoid. It also showed length bias on this corpus — ranking a
    # short policy doc last behind verbose decision records — and scored no
    # better than splitting the context budget between the two sources.
    RAG_RERANK_ENABLED = os.environ.get("RAG_RERANK_ENABLED", "false").lower() == "true"
    # Loading the embedding + cross-encoder models takes ~11s, which otherwise
    # lands on whichever user asks the first question (measured: 15.5s cold vs
    # 2-4s warm). Warming happens in a background thread so boot isn't blocked.
    # Turn off on a memory-constrained host where RAG is used rarely — the
    # models then load on first use instead.
    RAG_WARM_ON_BOOT = os.environ.get("RAG_WARM_ON_BOOT", "true").lower() == "true"


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

    if SQLALCHEMY_DATABASE_URI.startswith("postgresql://"):
        # pool_pre_ping: a hosted pooler (e.g. Supabase's pgbouncer) can
        # silently drop idle connections; this pings before reuse and
        # transparently reconnects instead of raising on a dead connection.
        # connect_timeout: give a cold/free-tier pooler more than the
        # psycopg2 default (a few seconds) to establish the first connection.
        SQLALCHEMY_ENGINE_OPTIONS = {
            "pool_pre_ping": True,
            "connect_args": {"connect_timeout": 30},
        }


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
