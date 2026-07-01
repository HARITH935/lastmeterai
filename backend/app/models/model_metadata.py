from datetime import datetime, timezone
from app.extensions import db


# Canonical model name constants — used in decisions.model_name FK semantics.
class ModelName:
    GONOGO_LR = "gonogo_lr"       # Logistic Regression — primary production model
    GONOGO_RF = "gonogo_rf"       # Random Forest — validation / ensemble check
    AREA_RF = "area_rf"           # RF Regressor — area/time failure rate prediction
    NLP_INTENT = "nlp_intent"     # TF-IDF + LR — chat intent classifier
    NLP_REASON = "nlp_reason"     # TF-IDF + LR — failure-reason classifier (Phase 2)


class ModelMetadata(db.Model):
    """
    One row per training run.  Mirrors (and extends) the MLflow run record
    so the Manager dashboard and Model Comparison Page (spec §2.10d) can query
    the local DB rather than hitting MLflow's API.

    At training time:
      1. MLflow logs params + metrics + artifact.
      2. This table gets a row written by the training script.
      3. is_production is flipped to True on the winning model version;
         all other rows for the same model_name are set to False.
    """

    __tablename__ = "model_metadata"

    # ── Primary key ──────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # ── Identity ──────────────────────────────────────────────────────────────
    # One of the ModelName constants above.
    model_name = db.Column(db.String(80), nullable=False)

    # Semantic version string, e.g. "v1.0", "v1.2".
    model_version = db.Column(db.String(20), nullable=False)

    # ── MLflow linkage ────────────────────────────────────────────────────────
    mlflow_run_id = db.Column(db.String(40), nullable=True)
    mlflow_experiment_id = db.Column(db.String(40), nullable=True)

    # ── Classification metrics (GO/NO-GO models) ──────────────────────────────
    accuracy = db.Column(db.Float, nullable=False)
    precision_score = db.Column(db.Float, nullable=False)
    recall_score = db.Column(db.Float, nullable=False)
    f1_score = db.Column(db.Float, nullable=False)

    # Confusion matrix counts for the Model Comparison view (spec §2.10 #1).
    # {"tn": 412, "fp": 38, "fn": 22, "tp": 528}
    confusion_matrix = db.Column(db.JSON, nullable=True)

    # ── Regressor metrics (area_rf) ───────────────────────────────────────────
    # Stored in the same row; NULL for classifiers.
    mae = db.Column(db.Float, nullable=True)    # mean absolute error
    rmse = db.Column(db.Float, nullable=True)   # root mean squared error
    r2 = db.Column(db.Float, nullable=True)     # R² coefficient

    # ── Global feature importance (spec §2.10 #2) ─────────────────────────────
    # Ranked list for the Model Health view.
    # [{"feature": "weather_risk", "importance": 0.2831},
    #  {"feature": "customer_history_score", "importance": 0.2147}, ...]
    feature_importance = db.Column(db.JSON, nullable=True)

    # ── Training info ─────────────────────────────────────────────────────────
    dataset_size = db.Column(db.Integer, nullable=False)

    # Hyperparameters used — schema varies by model type.
    # LR:  {"C": 1.0, "max_iter": 1000, "solver": "lbfgs"}
    # RF:  {"n_estimators": 200, "max_depth": 12, "random_state": 42}
    # NLP: {"ngram_range": [1, 2], "max_features": 5000, "C": 0.5}
    training_parameters = db.Column(db.JSON, nullable=True)

    # Relative path from repo root to the serialised .pkl file.
    # e.g. "ml/models/lr_gonogo_v1.2.pkl"
    artifact_path = db.Column(db.String(255), nullable=False)

    # ── Status ────────────────────────────────────────────────────────────────
    # Only one row per model_name should have is_production=True at any time.
    # The ML training script enforces this by flipping the flag in a transaction.
    is_production = db.Column(db.Boolean, nullable=False, default=False)

    # ── Timestamps ────────────────────────────────────────────────────────────
    trained_at = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Constraints & indexes ─────────────────────────────────────────────────
    __table_args__ = (
        db.UniqueConstraint(
            "model_name", "model_version", name="uq_model_name_version"
        ),
        db.CheckConstraint("accuracy BETWEEN 0.0 AND 1.0", name="ck_mm_accuracy"),
        db.CheckConstraint("precision_score BETWEEN 0.0 AND 1.0", name="ck_mm_precision"),
        db.CheckConstraint("recall_score BETWEEN 0.0 AND 1.0", name="ck_mm_recall"),
        db.CheckConstraint("f1_score BETWEEN 0.0 AND 1.0", name="ck_mm_f1"),
        db.CheckConstraint("dataset_size > 0", name="ck_mm_dataset_positive"),
        db.Index("ix_mm_model_name", "model_name"),
        db.Index("ix_mm_is_production", "is_production"),
        # Composite: find the production model for a given name (common query)
        db.Index("ix_mm_name_production", "model_name", "is_production"),
        db.Index("ix_mm_name_trained", "model_name", "trained_at"),
    )

    def __repr__(self) -> str:
        prod = " [PROD]" if self.is_production else ""
        return f"<ModelMetadata {self.model_name} {self.model_version}{prod}>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "mlflow_run_id": self.mlflow_run_id,
            "accuracy": self.accuracy,
            "precision_score": self.precision_score,
            "recall_score": self.recall_score,
            "f1_score": self.f1_score,
            "mae": self.mae,
            "rmse": self.rmse,
            "r2": self.r2,
            "confusion_matrix": self.confusion_matrix,
            "feature_importance": self.feature_importance,
            "dataset_size": self.dataset_size,
            "training_parameters": self.training_parameters,
            "artifact_path": self.artifact_path,
            "is_production": self.is_production,
            "trained_at": self.trained_at.isoformat(),
        }
