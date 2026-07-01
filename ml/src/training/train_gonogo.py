"""
Step A3 — Model Training: LastMeter AI GO/NO-GO classifier.

Trains two models on ml/data/raw/synthetic_orders.csv and evaluates on the
separate ml/data/raw/synthetic_orders_val.csv (different random seed).

Models:
  LR — LogisticRegression   (primary / production)
  RF — RandomForestClassifier (validation / ensemble reference)

Feature order: ALPHABETICAL — must match predictor.py's _predict_real()
  which sorts the feature dict keys before building the input vector.
  Any future model trained for this predictor MUST use the same order.

Model file naming decision:
  The existing predictor.py swap-point looks for ML_MODELS_DIR/gonogo_model.pkl.
  We save:
    lr_gonogo_v1.0.pkl  — named LR artifact (also registered in MLflow)
    rf_gonogo_v1.0.pkl  — named RF artifact (also registered in MLflow)
    gonogo_model.pkl    — copy of the LR model; what the predictor loads today.
  Step A4 will update the predictor to load by explicit name; for now the copy
  keeps the swap-point working without any predictor change.

Run:
  cd ml && python src/training/train_gonogo.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import joblib
import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_ROOT    = Path(__file__).parent.parent.parent        # ml/
RAW_DIR    = ML_ROOT / "data" / "raw"
MODELS_DIR = ML_ROOT / "models"
MLRUNS_DIR = ML_ROOT / "mlruns"

MODELS_DIR.mkdir(parents=True, exist_ok=True)

TRAIN_CSV = RAW_DIR / "synthetic_orders.csv"
VAL_CSV   = RAW_DIR / "synthetic_orders_val.csv"

MODEL_VERSION = "v1.0"

# ── Feature contract ───────────────────────────────────────────────────────────
# ALPHABETICAL ORDER — must match predictor.py _predict_real() which does:
#   fvec = [[fdict[k] for k in sorted(fdict)]]
# Changing this order breaks the production predictor without an A4 update.

FEATURES = sorted([
    "weather_risk",
    "customer_history_score",
    "traffic_impact",
    "agent_profit_score",
    "distance_score",
    "time_of_day_score",
    "package_size_score",
])
# Resolved order:
#   agent_profit_score, customer_history_score, distance_score,
#   package_size_score, time_of_day_score, traffic_impact, weather_risk

TARGET = "label"    # 1 = GO, 0 = NO-GO

# ── Hyperparameters ───────────────────────────────────────────────────────────

LR_PARAMS = {
    # C = inverse of regularization strength.
    # C=1.0 (sklearn default) gives moderate L2 regularization.
    # Rationale: 5,000 rows × 7 features is well-conditioned; the default
    # avoids both under-regularization (C≫1) and excessive shrinkage (C≪1).
    # Cross-validating on C ∈ {0.01, 0.1, 1, 10} yields negligible gain here
    # because the signal is strong relative to the noise budget.
    "C": 1.0,
    "penalty": "l2",
    "solver": "lbfgs",
    # Increase max_iter from default 100 → 1000 to guarantee convergence;
    # lbfgs converges in ~50-200 iters for this problem size.
    "max_iter": 1000,
    "random_state": 42,
    "class_weight": None,   # balanced → explored but hurts accuracy on this balanced-ish set
}

RF_PARAMS = {
    # n_estimators=200: more stable than the sklearn default of 100.
    # Returns diminishing gains past ~150 trees; 200 is a safe stopping point.
    "n_estimators": 200,
    # max_depth=8: with 7 features and 5,000 rows, unlimited depth reaches
    # ~99% train accuracy (overfit). Depth 8 caps complexity, keeping
    # train/val gap ≤ 5pp which is a reasonable bias-variance trade-off.
    "max_depth": 8,
    # min_samples_leaf=5: further prevents leaves from memorising ≤4 rows.
    "min_samples_leaf": 5,
    "n_jobs": -1,
    "random_state": 42,
    "class_weight": None,
}

# ── Expected accuracy range (from calibration) ────────────────────────────────
# The dataset was deliberately built with 10% max label noise near the boundary
# so that a competent model lands in 83-93% accuracy. Flags below are sanity
# checks: values outside these ranges indicate a data leak or labeling bug.
ACC_FLOOR = 0.75
ACC_CEIL  = 0.97


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    if not TRAIN_CSV.exists():
        sys.exit(f"ERROR: training file not found: {TRAIN_CSV}\n"
                 "Run: python data/generate_dataset.py")
    if not VAL_CSV.exists():
        sys.exit(f"ERROR: validation file not found: {VAL_CSV}\n"
                 "Run: python data/generate_dataset.py")
    return pd.read_csv(TRAIN_CSV), pd.read_csv(VAL_CSV)


def _eval_metrics(y_true, y_pred, y_prob) -> dict:
    cm   = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()
    return {
        "accuracy":          round(accuracy_score(y_true, y_pred),            4),
        "precision_go":      round(precision_score(y_true, y_pred, pos_label=1), 4),
        "recall_go":         round(recall_score(y_true, y_pred, pos_label=1),    4),
        "f1_go":             round(f1_score(y_true, y_pred, pos_label=1),        4),
        "precision_nogo":    round(precision_score(y_true, y_pred, pos_label=0), 4),
        "recall_nogo":       round(recall_score(y_true, y_pred, pos_label=0),    4),
        "f1_nogo":           round(f1_score(y_true, y_pred, pos_label=0),        4),
        "f1_weighted":       round(f1_score(y_true, y_pred, average="weighted"), 4),
        "cm_tn": int(tn), "cm_fp": int(fp), "cm_fn": int(fn), "cm_tp": int(tp),
    }


def _print_metrics(name: str, m: dict) -> None:
    acc = m["accuracy"]
    flag = ""
    if acc > ACC_CEIL:
        flag = "  ⚠ SUSPICIOUSLY HIGH — check for data leak"
    elif acc < ACC_FLOOR:
        flag = "  ⚠ SUSPICIOUSLY LOW  — check labeling or feature order"

    print(f"\n  {name}")
    print(f"    Accuracy          : {acc:.4f} ({acc*100:.2f}%){flag}")
    print(f"    Precision  GO     : {m['precision_go']:.4f}     Recall GO  : {m['recall_go']:.4f}     F1 GO  : {m['f1_go']:.4f}")
    print(f"    Precision  NO-GO  : {m['precision_nogo']:.4f}     Recall NOGO: {m['recall_nogo']:.4f}     F1 NOGO: {m['f1_nogo']:.4f}")
    print(f"    F1 (weighted)     : {m['f1_weighted']:.4f}")
    print(f"\n    Confusion Matrix (rows=actual, cols=predicted):")
    print(f"                       Pred NO-GO  Pred GO")
    print(f"      Actual NO-GO  :  {m['cm_tn']:>8}   {m['cm_fp']:>8}   (TN / FP)")
    print(f"      Actual GO     :  {m['cm_fn']:>8}   {m['cm_tp']:>8}   (FN / TP)")


def _print_comparison(lr_m: dict, rf_m: dict) -> None:
    print("\n" + "═" * 65)
    print("  COMPARISON TABLE  (validation set)")
    print("─" * 65)
    print(f"  {'Metric':<28} {'Logistic Reg':>13} {'Random Forest':>14}")
    print("─" * 65)
    rows = [
        ("Accuracy",           "accuracy"),
        ("F1 (weighted)",      "f1_weighted"),
        ("Precision GO",       "precision_go"),
        ("Recall GO",          "recall_go"),
        ("F1 GO",              "f1_go"),
        ("Precision NO-GO",    "precision_nogo"),
        ("Recall NO-GO",       "recall_nogo"),
        ("F1 NO-GO",           "f1_nogo"),
    ]
    for label, key in rows:
        lr_v  = lr_m[key]
        rf_v  = rf_m[key]
        delta = rf_v - lr_v
        arrow = "▲" if delta >= 0.0005 else ("▼" if delta <= -0.0005 else "~")
        print(f"  {label:<28} {lr_v:>13.4f} {rf_v:>14.4f}  {arrow}{abs(delta):.4f}")
    print("─" * 65)

    # Compare to seeded placeholder values
    SEEDED_LR_ACC = 0.914
    SEEDED_RF_ACC = 0.927
    lr_diff = lr_m["accuracy"] - SEEDED_LR_ACC
    rf_diff = rf_m["accuracy"] - SEEDED_RF_ACC
    print(f"\n  vs seeded placeholder accuracy: LR={SEEDED_LR_ACC} ({lr_diff:+.4f})  "
          f"RF={SEEDED_RF_ACC} ({rf_diff:+.4f})")
    if abs(lr_diff) <= 0.05 and abs(rf_diff) <= 0.05:
        print("  ✓ Within ±5pp of seeded values — dataset calibration is sound")
    else:
        print("  ⚠ Gap > 5pp from seeded values — review dataset calibration")
    print("═" * 65)


# ── Training runs ──────────────────────────────────────────────────────────────

def train_lr(X_train, y_train, X_val, y_val) -> tuple[LogisticRegression, dict]:
    mlflow.set_tracking_uri(MLRUNS_DIR.as_uri())
    mlflow.set_experiment("gonogo_logistic_regression")

    with mlflow.start_run(run_name=f"lr_{MODEL_VERSION}") as run:
        lr = LogisticRegression(**LR_PARAMS)
        lr.fit(X_train, y_train)
        lr.version = MODEL_VERSION    # read by predictor.py via getattr(obj, "version", "v1.0")

        y_pred = lr.predict(X_val)
        y_prob = lr.predict_proba(X_val)[:, 1]
        m = _eval_metrics(y_val, y_pred, y_prob)

        mlflow.log_params(LR_PARAMS)
        mlflow.log_params({"model_type": "LogisticRegression", "n_features": len(FEATURES),
                           "feature_order": "alphabetical"})
        mlflow.log_metrics({
            "accuracy":       m["accuracy"],
            "f1_weighted":    m["f1_weighted"],
            "f1_go":          m["f1_go"],
            "f1_nogo":        m["f1_nogo"],
            "precision_go":   m["precision_go"],
            "recall_go":      m["recall_go"],
            "precision_nogo": m["precision_nogo"],
            "recall_nogo":    m["recall_nogo"],
        })
        mlflow.log_dict(
            {"tn": m["cm_tn"], "fp": m["cm_fp"], "fn": m["cm_fn"], "tp": m["cm_tp"]},
            "confusion_matrix.json",
        )
        mlflow.sklearn.log_model(lr, "model")

        print(f"\n  [MLflow] LR run_id  : {run.info.run_id}")
        print(f"  [MLflow] experiment : gonogo_logistic_regression")

    return lr, m


def train_rf(X_train, y_train, X_val, y_val) -> tuple[RandomForestClassifier, dict]:
    mlflow.set_tracking_uri(MLRUNS_DIR.as_uri())
    mlflow.set_experiment("gonogo_random_forest")

    with mlflow.start_run(run_name=f"rf_{MODEL_VERSION}") as run:
        rf = RandomForestClassifier(**RF_PARAMS)
        rf.fit(X_train, y_train)
        rf.version = MODEL_VERSION

        y_pred = rf.predict(X_val)
        y_prob = rf.predict_proba(X_val)[:, 1]
        m = _eval_metrics(y_val, y_pred, y_prob)

        mlflow.log_params(RF_PARAMS)
        mlflow.log_params({"model_type": "RandomForestClassifier", "n_features": len(FEATURES),
                           "feature_order": "alphabetical"})
        mlflow.log_metrics({
            "accuracy":       m["accuracy"],
            "f1_weighted":    m["f1_weighted"],
            "f1_go":          m["f1_go"],
            "f1_nogo":        m["f1_nogo"],
            "precision_go":   m["precision_go"],
            "recall_go":      m["recall_go"],
            "precision_nogo": m["precision_nogo"],
            "recall_nogo":    m["recall_nogo"],
        })
        mlflow.log_dict(
            {"tn": m["cm_tn"], "fp": m["cm_fp"], "fn": m["cm_fn"], "tp": m["cm_tp"]},
            "confusion_matrix.json",
        )
        mlflow.sklearn.log_model(rf, "model")

        print(f"\n  [MLflow] RF run_id  : {run.info.run_id}")
        print(f"  [MLflow] experiment : gonogo_random_forest")

    return rf, m


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    print("Loading data …")
    train_df, val_df = _load_data()

    X_train = train_df[FEATURES].values
    y_train = train_df[TARGET].values
    X_val   = val_df[FEATURES].values
    y_val   = val_df[TARGET].values

    print(f"  Train : {len(X_train):,} rows  "
          f"(GO={y_train.sum():,}  NO-GO={(y_train==0).sum():,})")
    print(f"  Val   : {len(X_val):,} rows  "
          f"(GO={y_val.sum():,}  NO-GO={(y_val==0).sum():,})")
    print(f"  Features ({len(FEATURES)}): {FEATURES}")

    # ── Train ──────────────────────────────────────────────────────────────
    print("\n" + "─" * 65)
    print("  Training LogisticRegression …")
    lr, lr_m = train_lr(X_train, y_train, X_val, y_val)

    print("\n  Training RandomForestClassifier …")
    rf, rf_m = train_rf(X_train, y_train, X_val, y_val)

    # ── Metrics ────────────────────────────────────────────────────────────
    print("\n" + "═" * 65)
    print("  EVALUATION RESULTS  (validation set — synthetic_orders_val.csv)")
    print("═" * 65)
    _print_metrics("Logistic Regression", lr_m)
    _print_metrics("Random Forest", rf_m)
    _print_comparison(lr_m, rf_m)

    # ── Save models ────────────────────────────────────────────────────────
    lr_path   = MODELS_DIR / f"lr_gonogo_{MODEL_VERSION}.pkl"
    rf_path   = MODELS_DIR / f"rf_gonogo_{MODEL_VERSION}.pkl"
    prod_path = MODELS_DIR / "gonogo_model.pkl"  # what predictor.py loads

    joblib.dump(lr, lr_path)
    joblib.dump(rf, rf_path)
    # Copy LR as the default production model (predictor.py swap-point).
    # Step A4 will update predictor.py to load by explicit name; until then
    # the predictor auto-loads this file on startup.
    shutil.copy2(lr_path, prod_path)

    print(f"\n  Models saved:")
    print(f"    {lr_path}")
    print(f"    {rf_path}")
    print(f"    {prod_path}  ← LR copy — predictor.py production default")

    # ── Feature order reminder ─────────────────────────────────────────────
    print(f"\n  Feature order used in training (ALPHABETICAL — matches predictor.py):")
    for i, f in enumerate(FEATURES):
        coef = lr.coef_[0][i]
        print(f"    [{i}] {f:<28}  LR coef={coef:+.4f}")

    print("\n  Done.\n")


if __name__ == "__main__":
    main()
