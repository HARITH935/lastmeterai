"""
Step A5 — Area/Time Failure Rate Model.

Trains a Random Forest Regressor that predicts the *failure rate* (0–1) for a
given area + time-window combination under specific contextual conditions.

This is a regression model, not a classifier.  It answers the question:
"For deliveries in Velachery during evening in rainy weather, what fraction
will fail?" rather than "Should this specific order go?"

Purpose (per spec):
  - Heatmap Visualization (Section 2.10f) — red/yellow/green zones per area
  - Area Intelligence page — best delivery time, rain impact, success rate

Dataset:
  Synthetic, rule-based generation of 1,500 rows.  Each row represents a
  historical delivery-day "bucket": a (area, time_window, weather, context)
  combination with its empirically expected failure rate as the target.
  Area baseline failure rates are derived from the A2 per-order dataset
  distributions confirmed in verify_dataset.py (2026-07-13, 20-area expansion):
    Velachery ~47%  |  Sholinganallur ~47%  |  Guindy ~43%  |  Saidapet ~39%
    Egmore ~37%  |  Adyar ~32%  |  Thiruvanmiyur ~32%  |  Nungambakkam ~30%
    Koyambedu ~29%  |  T Nagar ~29%  |  Mylapore ~25%  |  Perambur ~26%
    Chromepet ~23%  |  Vadapalani ~23%  |  Tambaram ~21%  |  Ambattur ~22%
    Kilpauk ~19%  |  Porur ~13%  |  Besant Nagar ~14%  |  Anna Nagar ~12%

Encoding (all numeric — no strings stored in model input):
  area_t_nagar, area_velachery, area_adyar, area_porur, area_mylapore,
  area_nungambakkam, area_guindy, area_tambaram, area_sholinganallur,
  area_thiruvanmiyur, area_besant_nagar, area_kilpauk, area_egmore,
  area_vadapalani, area_koyambedu, area_ambattur, area_perambur,
  area_chromepet, area_saidapet: one-hot (Anna Nagar = ref)
  time_morning, time_evening: one-hot (afternoon = ref)
  is_weekend:       0/1
  weather_severity: float [0, 1]  (0=clear, 1=severe storm)
  is_festival_day:  0/1
  is_monsoon_month: 0/1  (June–September: higher rain/flood risk)

Target:
  failure_rate: float in [0.05, 0.95]

Run:
  cd ml && python src/training/train_area_model.py
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import mlflow
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_ROOT    = Path(__file__).parent.parent.parent
MODELS_DIR = ML_ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)

MODEL_PATH    = MODELS_DIR / "rf_area_time_v1.0.pkl"
MODEL_VERSION = "v1.0"

# ── Dataset constants ─────────────────────────────────────────────────────────

AREAS = [
    "Anna Nagar", "T Nagar", "Velachery", "Adyar", "Porur",
    "Mylapore", "Nungambakkam", "Guindy", "Tambaram", "Sholinganallur",
    "Thiruvanmiyur", "Besant Nagar", "Kilpauk", "Egmore", "Vadapalani",
    "Koyambedu", "Ambattur", "Perambur", "Chromepet", "Saidapet",
]
TIME_WINDOWS = ["morning", "afternoon", "evening"]

# Baseline failure rates derived from the A2 dataset's actual NO-GO rate per
# area (verify_dataset.py confirmed, 2026-07-13 20-area regeneration).
AREA_BASE_FAILURE: dict[str, float] = {
    "Anna Nagar":     0.120,
    "T Nagar":        0.286,
    "Velachery":      0.472,
    "Adyar":          0.324,
    "Porur":          0.134,
    "Mylapore":       0.251,
    "Nungambakkam":   0.297,
    "Guindy":         0.427,
    "Tambaram":       0.212,
    "Sholinganallur": 0.468,
    "Thiruvanmiyur":  0.322,
    "Besant Nagar":   0.135,
    "Kilpauk":        0.187,
    "Egmore":         0.365,
    "Vadapalani":     0.229,
    "Koyambedu":      0.288,
    "Ambattur":       0.215,
    "Perambur":       0.260,
    "Chromepet":      0.230,
    "Saidapet":       0.392,
}

# Time-window additive modifiers (afternoon/morning lower risk; evening harder)
TIME_MODIFIER: dict[str, float] = {
    "morning":   -0.03,
    "afternoon":  0.00,
    "evening":   +0.06,
}

# Scaled 4x (1,500 → 6,000) to hold ~300 rows/area average with 20 areas
# instead of 5 — matches the original per-area training density.
N_ROWS   = 6_000
SEED     = 42

RF_PARAMS = {
    "n_estimators":   200,
    # max_depth was 6, tuned for 4 area one-hot columns. With 19 (20 areas),
    # a depth-6 tree can't reach/split on most of them — many areas got
    # importance=0.0 and identical (wrong) predictions when this was still 6.
    # 16 (with 4,800 training rows — plenty of headroom) reliably
    # disambiguates all 19 area dummies without every area collapsing onto
    # a shared prediction.
    "max_depth":      16,
    "min_samples_leaf": 5,
    "n_jobs":         -1,
    "random_state":   SEED,
}

MLFLOW_EXPERIMENT = "area_time_failure_rate"

# All areas except Anna Nagar (the one-hot reference/baseline category).
_NONREF_AREAS = [a for a in AREAS if a != "Anna Nagar"]

# Feature column names (matches backend encoding expectation in
# app/ml/area_predictor.py — keep both files' area ordering identical).
FEATURES = [f"area_{a.lower().replace(' ', '_')}" for a in _NONREF_AREAS] + [
    "time_morning",
    "time_evening",
    "is_weekend",
    "weather_severity",
    "is_festival_day",
    "is_monsoon_month",
]

TARGET = "failure_rate"


# ── Dataset generation ────────────────────────────────────────────────────────

def generate_dataset(n: int = N_ROWS, seed: int = SEED) -> pd.DataFrame:
    """
    Synthetic area/time dataset.  Each row is a delivery-day bucket
    (area + time_window + contextual conditions) with a computed failure rate.

    Rules mirror the A2 generator's intent: area baselines are the dominant
    signal; weather, time, weekend, festival, monsoon are additive modifiers.
    Gaussian noise (σ=0.025) adds realistic variance without overwhelming signal.
    """
    rng = np.random.default_rng(seed)

    areas        = rng.choice(AREAS, size=n)
    time_windows = rng.choice(TIME_WINDOWS, size=n)
    is_weekend   = rng.integers(0, 2, size=n)
    # weather_severity skewed toward clear conditions (log-normal-ish)
    weather_sev  = np.clip(rng.exponential(scale=0.25, size=n), 0.0, 1.0)
    is_festival  = (rng.random(n) < 0.06).astype(int)   # ~6% of days are festival days
    months       = rng.integers(1, 13, size=n)
    is_monsoon   = ((months >= 6) & (months <= 9)).astype(int)

    failure_rates = []
    for i in range(n):
        base = AREA_BASE_FAILURE[areas[i]]
        base += TIME_MODIFIER[time_windows[i]]
        base += weather_sev[i] * 0.20        # storm → up to +20% failure
        base += is_festival[i] * 0.08        # festival day → +8%
        base += is_monsoon[i] * 0.04         # monsoon season → +4%
        base += is_weekend[i] * (-0.02)      # weekends slightly easier
        base += rng.normal(0.0, 0.025)       # realistic noise
        failure_rates.append(float(np.clip(base, 0.05, 0.95)))

    df = pd.DataFrame({
        "area":             areas,
        "time_window":      time_windows,
        "is_weekend":       is_weekend,
        "weather_severity": weather_sev.round(4),
        "is_festival_day":  is_festival,
        "month":            months,
        "is_monsoon_month": is_monsoon,
        TARGET:             [round(r, 4) for r in failure_rates],
    })
    return df


def encode_features(df: pd.DataFrame) -> pd.DataFrame:
    """Encode categorical columns into numeric features matching FEATURES list."""
    df = df.copy()
    for area in _NONREF_AREAS:
        col = f"area_{area.lower().replace(' ', '_')}"
        df[col] = (df["area"] == area).astype(int)
    df["time_morning"] = (df["time_window"] == "morning").astype(int)
    df["time_evening"] = (df["time_window"] == "evening").astype(int)
    return df


# ── Main training routine ─────────────────────────────────────────────────────

def train() -> None:
    print("─" * 64)
    print("  A5 — Area/Time Failure Rate Model (RF Regressor)")
    print("─" * 64)

    # ── Generate dataset ───────────────────────────────────────────────────
    df = generate_dataset()
    df = encode_features(df)
    print(f"\nDataset: {len(df)} rows × {len(FEATURES)} features")
    print("  Area distribution:")
    print(df["area"].value_counts().to_string(header=False))
    print("  Target (failure_rate) stats:")
    print(f"    min={df[TARGET].min():.4f}  mean={df[TARGET].mean():.4f}"
          f"  max={df[TARGET].max():.4f}  std={df[TARGET].std():.4f}")

    X = df[FEATURES].values
    y = df[TARGET].values

    # 80/20 split, stratify not applicable for regression
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.20, random_state=SEED
    )
    print(f"\nSplit: {len(X_train)} train / {len(X_val)} val")

    # ── MLflow ────────────────────────────────────────────────────────────
    mlflow.set_tracking_uri(str(ML_ROOT / "mlruns"))
    mlflow.set_experiment(MLFLOW_EXPERIMENT)

    with mlflow.start_run(run_name=f"rf_area_time_{MODEL_VERSION}") as run:
        run_id = run.info.run_id

        # ── Train ─────────────────────────────────────────────────────────
        rf = RandomForestRegressor(**RF_PARAMS)
        rf.fit(X_train, y_train)
        rf.version = MODEL_VERSION

        # ── Evaluate ──────────────────────────────────────────────────────
        y_pred = rf.predict(X_val)
        mae  = mean_absolute_error(y_val, y_pred)
        rmse = float(np.sqrt(mean_squared_error(y_val, y_pred)))
        r2   = r2_score(y_val, y_pred)

        print(f"\nEvaluation (val set, {len(X_val)} rows):")
        print(f"  MAE  = {mae:.5f}  ({mae*100:.2f} pp)")
        print(f"  RMSE = {rmse:.5f}  ({rmse*100:.2f} pp)")
        print(f"  R²   = {r2:.5f}")

        # ── Feature importances ───────────────────────────────────────────
        importances = dict(zip(FEATURES, rf.feature_importances_.round(6)))
        ranked = sorted(importances.items(), key=lambda x: x[1], reverse=True)
        print("\nFeature importances (RF impurity-based):")
        for feat, imp in ranked:
            bar = "█" * int(imp * 30)
            print(f"  {feat:<22}  {imp:.5f}  {bar}")

        # ── MLflow log ────────────────────────────────────────────────────
        mlflow.log_params({
            "model_type":     "RandomForestRegressor",
            "n_estimators":   RF_PARAMS["n_estimators"],
            "max_depth":      RF_PARAMS["max_depth"],
            "min_samples_leaf": RF_PARAMS["min_samples_leaf"],
            "n_features":     len(FEATURES),
            "n_train":        len(X_train),
            "n_val":          len(X_val),
            "feature_order":  ",".join(FEATURES),
        })
        mlflow.log_metrics({
            "mae":  round(mae,  6),
            "rmse": round(rmse, 6),
            "r2":   round(r2,   6),
        })
        mlflow.log_dict({"features": FEATURES, "importances": importances},
                        "feature_importances.json")
        mlflow.sklearn.log_model(rf, "model")

        print(f"\nMLflow run ID : {run_id}")
        print(f"Experiment    : {MLFLOW_EXPERIMENT}")

    # ── Save model ────────────────────────────────────────────────────────
    joblib.dump(rf, MODEL_PATH)
    print(f"\nModel saved   : {MODEL_PATH.name}")
    print(f"File size     : {MODEL_PATH.stat().st_size:,} bytes")

    # ── Sample predictions ─────────────────────────────────────────────────
    print("\n" + "─" * 64)
    print("  Sample predictions (sanity check):")
    print("─" * 64)
    samples = [
        # (area,           time_window, is_weekend, weather_sev, is_festival, is_monsoon)
        ("Anna Nagar",     "morning",   0, 0.05, 0, 0),   # best-case scenario
        ("Anna Nagar",     "morning",   1, 0.05, 0, 0),   # weekend, still clear
        ("T Nagar",        "afternoon", 0, 0.15, 0, 0),   # moderate area
        ("Adyar",          "evening",   0, 0.30, 0, 0),   # higher risk area, evening
        ("Velachery",      "evening",   0, 0.10, 0, 0),   # high-risk area, clear sky
        ("Velachery",      "afternoon", 0, 0.70, 0, 1),   # high-risk + heavy rain + monsoon
        ("Velachery",      "evening",   0, 0.90, 1, 1),   # worst case
        ("Sholinganallur", "evening",   0, 0.10, 0, 0),   # new area — marsh-basin flood risk
        ("Guindy",         "afternoon", 0, 0.50, 0, 1),   # new area — industrial hub, monsoon
        ("Koyambedu",      "afternoon", 0, 0.10, 0, 0),   # new area — traffic hub, dry
    ]
    print(f"  {'Area':<16} {'Time':>10} {'Wknd':>5} {'Wthr':>5} {'Fest':>5}"
          f" {'Mns':>4}  {'Pred':>8}  {'Narrative'}")
    print("  " + "─" * 74)
    for area, tw, wknd, wthr, fest, mns in samples:
        row = {f"area_{a.lower().replace(' ', '_')}": int(area == a) for a in _NONREF_AREAS}
        row.update({
            "time_morning":   int(tw == "morning"),
            "time_evening":   int(tw == "evening"),
            "is_weekend":     wknd,
            "weather_severity": wthr,
            "is_festival_day":  fest,
            "is_monsoon_month": mns,
        })
        fvec = np.array([[row[f] for f in FEATURES]])
        pred = float(rf.predict(fvec)[0])
        band = "LOW" if pred < 0.20 else ("MED" if pred < 0.40 else "HIGH")
        print(f"  {area:<16} {tw:>10} {wknd:>5} {wthr:>5.2f} {fest:>5} {mns:>4}"
              f"  {pred:>7.1%}  [{band}]")

    print("─" * 64)
    print("\nA5 complete.")


if __name__ == "__main__":
    train()
