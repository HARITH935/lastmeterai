"""
Step A3 companion — SHAP feature importance for the trained LR model.

Loads ml/models/lr_gonogo_v1.0.pkl and computes real SHAP values via
shap.LinearExplainer (exact analytical SHAP for linear models).

Output:
  Feature importance ranking (mean |SHAP value| per feature).
  Comparison against the seeded model_metadata ordering to confirm
  that the dataset's learned signal matches documented assumptions.

Run:
  cd ml && python src/training/explain_model.py
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_ROOT    = Path(__file__).parent.parent.parent
MODELS_DIR = ML_ROOT / "models"
RAW_DIR    = ML_ROOT / "data" / "raw"

LR_PKL   = MODELS_DIR / "lr_gonogo_v1.0.pkl"
TRAIN_CSV = RAW_DIR / "synthetic_orders.csv"
VAL_CSV   = RAW_DIR / "synthetic_orders_val.csv"

# Feature order MUST match training (alphabetical)
FEATURES = sorted([
    "weather_risk", "customer_history_score", "traffic_impact",
    "agent_profit_score", "distance_score", "time_of_day_score",
    "package_size_score",
])

# Seeded model_metadata importances (from backend/seed.py) — the reference
# ordering we expect the real trained model to reproduce.
SEEDED_IMPORTANCE = {
    "weather_risk":           0.3541,
    "customer_history_score": 0.2803,
    "traffic_impact":         0.1562,
    "time_of_day_score":      0.0681,
    "agent_profit_score":     0.0588,
    "package_size_score":     0.0416,
    "distance_score":         0.0409,
}
SEEDED_TOP3 = ["weather_risk", "customer_history_score", "traffic_impact"]


def main() -> None:
    # ── Load model ──────────────────────────────────────────────────────────
    if not LR_PKL.exists():
        raise FileNotFoundError(
            f"Model not found: {LR_PKL}\nRun: python src/training/train_gonogo.py"
        )
    lr = joblib.load(LR_PKL)
    print(f"Loaded: {LR_PKL.name}  (version={getattr(lr, 'version', 'unknown')})")
    print(f"  LR intercept={lr.intercept_[0]:+.4f}")
    print(f"  LR coefs    : {dict(zip(FEATURES, lr.coef_[0].round(4)))}\n")

    # ── Load data ───────────────────────────────────────────────────────────
    train_df = pd.read_csv(TRAIN_CSV)
    val_df   = pd.read_csv(VAL_CSV)

    X_train = train_df[FEATURES].values
    X_val   = val_df[FEATURES].values

    # Use 500 validation rows for SHAP (full val set is 1,000; 500 is plenty
    # for stable mean-SHAP estimates with LinearExplainer which is O(n) exact)
    rng     = np.random.default_rng(42)
    idx     = rng.choice(len(X_val), size=min(500, len(X_val)), replace=False)
    X_sample = X_val[idx]

    print(f"SHAP sample: {len(X_sample)} validation rows")
    print(f"Background : {len(X_train)} training rows (LinearExplainer uses mean)\n")

    # ── Compute SHAP values ─────────────────────────────────────────────────
    # LinearExplainer uses the analytical SHAP formula for linear models:
    #   shap_i = coef_i * (x_i - E[x_i])
    # Background = training set → E[x_i] is computed from there.
    explainer   = shap.LinearExplainer(lr, X_train)
    shap_values = explainer.shap_values(X_sample)
    # shap_values: (n_sample, n_features) — contribution to log-odds of class 1 (GO)
    # Positive SHAP → pushes toward GO; negative → pushes toward NO-GO

    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    total         = mean_abs_shap.sum()
    norm_shap     = mean_abs_shap / total   # normalised so sum = 1.0

    importance_df = (
        pd.DataFrame({"feature": FEATURES, "mean_abs_shap": mean_abs_shap,
                      "normalised": norm_shap})
        .sort_values("mean_abs_shap", ascending=False)
        .reset_index(drop=True)
    )

    # ── Print results ───────────────────────────────────────────────────────
    print("═" * 66)
    print("  SHAP Feature Importance  (LinearExplainer on 500 val rows)")
    print("─" * 66)
    print(f"  {'Rank':<5} {'Feature':<28} {'Mean|SHAP|':>11} {'Normalised':>11}")
    print("─" * 66)

    for rank, row in importance_df.iterrows():
        bar = "█" * int(row["normalised"] * 40)
        print(f"  {rank+1:<5} {row['feature']:<28} {row['mean_abs_shap']:>11.5f} "
              f"{row['normalised']:>10.4f}  {bar}")

    print("─" * 66)

    # ── Compare LR coefficients vs seeded weights ───────────────────────────
    print("\n  LR learned coefficients vs placeholder weights (predictor.py):")
    PLACEHOLDER_W = {
        "weather_risk":           -3.20,
        "customer_history_score": +1.80,  # updated A4 convention: 1=reliable → positive weight
        "traffic_impact":         -1.10,
        "agent_profit_score":     +1.40,
        "distance_score":         -0.70,
        "time_of_day_score":      -0.55,
        "package_size_score":     -0.85,
    }
    coef_dict = dict(zip(FEATURES, lr.coef_[0]))
    print(f"  {'Feature':<28} {'Learned':>10} {'Placeholder':>12}  {'Same sign?'}")
    print("  " + "─" * 58)
    for f, ph_w in PLACEHOLDER_W.items():
        learned = coef_dict[f]
        same_sign = "✓" if (learned * ph_w) > 0 else "✗ SIGN DIFFERS"
        print(f"  {f:<28} {learned:>+10.4f} {ph_w:>+12.4f}  {same_sign}")

    # ── Ordering comparison vs seeded model_metadata ────────────────────────
    real_top3    = importance_df["feature"].head(3).tolist()
    real_ranking = importance_df["feature"].tolist()
    seeded_ranking = sorted(SEEDED_IMPORTANCE, key=SEEDED_IMPORTANCE.__getitem__, reverse=True)

    print("\n  Feature ranking comparison:")
    print(f"  {'Rank':<5} {'Seeded (model_metadata)':<28} {'Real (trained LR)':<28}")
    print("  " + "─" * 62)
    for i, (s, r) in enumerate(zip(seeded_ranking, real_ranking)):
        match = "✓" if s == r else ("~" if s in real_ranking[:i+2] else "✗")
        print(f"  {i+1:<5} {s:<28} {r:<28} {match}")

    # ── Sanity verdict ──────────────────────────────────────────────────────
    top3_match = real_top3[:3] == SEEDED_TOP3
    print("\n" + "═" * 66)
    if top3_match:
        print("  ✓ TOP-3 ORDER MATCHES SEEDED VALUES:")
        print(f"    Expected: {SEEDED_TOP3}")
        print(f"    Actual  : {real_top3[:3]}")
        print("    → Dataset signal is consistent with documented assumptions.")
    else:
        # Check if same set even if order differs
        same_set = set(real_top3[:3]) == set(SEEDED_TOP3)
        if same_set:
            print("  ~ TOP-3 SAME FEATURES, DIFFERENT ORDER:")
            print(f"    Expected: {SEEDED_TOP3}")
            print(f"    Actual  : {real_top3[:3]}")
            print("    → Minor ordering difference; core signal still aligns.")
        else:
            print("  ⚠ TOP-3 MISMATCH — review dataset or label encoding:")
            print(f"    Expected: {SEEDED_TOP3}")
            print(f"    Actual  : {real_top3[:3]}")
            print("    → This means the trained model learned different dominant factors")
            print("      than the seeded assumptions. Investigate before Step A4.")
    print("═" * 66)


if __name__ == "__main__":
    main()
