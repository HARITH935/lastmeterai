"""
Dataset verification script for LastMeter AI synthetic training data.

Checks:
  1. No nulls; all model features in [0, 1]
  2. GO/NO-GO balance is realistic (60-80% GO)
  3. Area-level risk differences are statistically present
     (Velachery NO-GO rate measurably higher than Anna Nagar)
  4. Weekend traffic is measurably lower than weekday traffic
  5. Festival traffic is measurably higher than non-festival
  6. Validation set distribution matches training set (no major shift)

Run:
  cd ml && python data/verify_dataset.py [--train-only]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).parent))
from generate_dataset import AREA_PARAMS  # single source of truth for the area list

RAW_DIR    = Path(__file__).parent.parent / "data" / "raw"
TRAIN_PATH = RAW_DIR / "synthetic_orders.csv"
VAL_PATH   = RAW_DIR / "synthetic_orders_val.csv"

FEATURES = [
    "weather_risk", "traffic_impact", "customer_history_score",
    "agent_profit_score", "distance_score", "time_of_day_score",
    "package_size_score",
]

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
INFO = "\033[94m·\033[0m"
_failures: list[str] = []


def chk(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  {PASS}  {label}")
    else:
        print(f"  {FAIL}  {label}" + (f"  [{detail}]" if detail else ""))
        _failures.append(label)


def info(msg: str) -> None:
    print(f"  {INFO}  {msg}")


# ── Per-dataset verification ──────────────────────────────────────────────────

def verify(df: pd.DataFrame, name: str) -> None:
    n = len(df)
    print(f"\n{'─' * 58}")
    print(f"  {name}  ({n:,} rows)")
    print(f"{'─' * 58}")

    # ── 1. Schema and range checks ────────────────────────────────────────
    print("\n  [1] Schema / range")

    chk("No null values", df.isnull().sum().sum() == 0,
        f"{df.isnull().sum().sum()} nulls found")

    for feat in FEATURES:
        chk(f"{feat} ∈ [0, 1]",
            df[feat].between(0.0, 1.0).all(),
            f"min={df[feat].min():.4f} max={df[feat].max():.4f}")

    chk("label is binary {0, 1}",
        set(df["label"].unique()).issubset({0, 1}),
        str(df["label"].unique().tolist()))

    chk("true_risk_score ∈ [0, 100]",
        df["true_risk_score"].between(0.0, 100.0).all(),
        f"min={df['true_risk_score'].min():.1f} max={df['true_risk_score'].max():.1f}")

    chk(f"All {len(AREA_PARAMS)} Chennai areas present",
        set(df["area"].unique()) == set(AREA_PARAMS.keys()))

    chk("All 3 time windows present",
        set(df["time_window"].unique()) == {"morning", "afternoon", "evening"})

    chk("All 3 package sizes present",
        set(df["package_size_raw"].unique()) == {"small", "medium", "large"})

    # ── 2. GO/NO-GO balance ───────────────────────────────────────────────
    print("\n  [2] GO/NO-GO balance")

    go_rate  = df["label"].mean()
    go_pct   = go_rate * 100
    nogo_pct = 100 - go_pct
    info(f"GO={go_pct:.1f}%  NO-GO={nogo_pct:.1f}%")

    chk("GO rate 60–80% (realistic working logistics operation)",
        0.60 <= go_rate <= 0.80,
        f"got {go_pct:.1f}%")

    chk("Not trivially balanced (not 49–51%)",
        not (0.49 <= go_rate <= 0.51),
        "too close to 50/50")

    chk("Not severely imbalanced (not >95% or <5% GO)",
        0.05 < go_rate < 0.95,
        f"got {go_pct:.1f}%")

    # ── 3. Area-level risk differences ────────────────────────────────────
    print("\n  [3] Area risk differentiation")

    area_nogo = df.groupby("area")["label"].apply(lambda x: (x == 0).mean())
    for area, rate in area_nogo.items():
        info(f"  NO-GO rate  {area:<14}: {rate*100:.1f}%")

    vel_nogo   = area_nogo.get("Velachery", 0.0)
    anna_nogo  = area_nogo.get("Anna Nagar", 0.0)
    adyar_nogo = area_nogo.get("Adyar", 0.0)

    chk("Velachery NO-GO rate > Anna Nagar NO-GO rate",
        vel_nogo > anna_nogo,
        f"Velachery={vel_nogo*100:.1f}%  Anna Nagar={anna_nogo*100:.1f}%")

    diff = vel_nogo - anna_nogo
    chk("Velachery−Anna Nagar gap ≥ 5pp (statistically meaningful)",
        diff >= 0.05,
        f"gap={diff*100:.1f}pp")

    chk("Adyar NO-GO rate > Anna Nagar NO-GO rate",
        adyar_nogo > anna_nogo,
        f"Adyar={adyar_nogo*100:.1f}%  Anna Nagar={anna_nogo*100:.1f}%")

    # Pairwise Mann-Whitney U on true_risk_score (non-parametric, no normality assumed)
    vel_risk  = df[df["area"] == "Velachery"]["true_risk_score"]
    anna_risk = df[df["area"] == "Anna Nagar"]["true_risk_score"]
    u_stat, p_val = stats.mannwhitneyu(vel_risk, anna_risk, alternative="greater")
    chk(f"Velachery risk score stochastically greater than Anna Nagar (p < 0.01)",
        p_val < 0.01,
        f"p={p_val:.4f}")
    info(f"  Mann-Whitney U={u_stat:.0f}  p={p_val:.2e}")

    # Area weather_risk mean ordering
    area_weather = df.groupby("area")["weather_risk"].mean()
    info("  Mean weather_risk by area:")
    for area, val in area_weather.sort_values(ascending=False).items():
        info(f"    {area:<14}: {val:.3f}")

    chk("Velachery mean weather_risk > Anna Nagar mean weather_risk",
        area_weather["Velachery"] > area_weather["Anna Nagar"],
        f"V={area_weather['Velachery']:.3f}  AN={area_weather['Anna Nagar']:.3f}")

    # ── 4. Weekend effect ─────────────────────────────────────────────────
    print("\n  [4] Weekend effect")

    wd_traffic   = df[df["is_weekend"] == 0]["traffic_impact"].mean()
    we_traffic   = df[df["is_weekend"] == 1]["traffic_impact"].mean()
    info(f"  Mean traffic_impact — Weekday: {wd_traffic:.3f}   Weekend: {we_traffic:.3f}")

    chk("Weekend mean traffic_impact < Weekday (commuter relief)",
        we_traffic < wd_traffic,
        f"Weekend={we_traffic:.3f}  Weekday={wd_traffic:.3f}")

    we_diff = wd_traffic - we_traffic
    chk("Weekend traffic reduction ≥ 0.03 (meaningful, not noise)",
        we_diff >= 0.03,
        f"diff={we_diff:.3f}")

    # T-test on traffic (one-sided: weekday > weekend)
    t, p = stats.ttest_ind(
        df[df["is_weekend"] == 0]["traffic_impact"],
        df[df["is_weekend"] == 1]["traffic_impact"],
        alternative="greater",
    )
    chk("Weekday vs Weekend traffic: t-test p < 0.001",
        p < 0.001, f"p={p:.2e}")

    wd_go = df[df["is_weekend"] == 0]["label"].mean()
    we_go = df[df["is_weekend"] == 1]["label"].mean()
    info(f"  GO rate — Weekday: {wd_go*100:.1f}%   Weekend: {we_go*100:.1f}%")
    chk("Weekend GO rate ≥ Weekday GO rate (lower traffic = easier delivery)",
        we_go >= wd_go,
        f"Weekend={we_go*100:.1f}%  Weekday={wd_go*100:.1f}%")

    # ── 5. Festival effect ────────────────────────────────────────────────
    print("\n  [5] Festival day effect")

    nf_traffic  = df[df["is_festival_day"] == 0]["traffic_impact"].mean()
    fst_traffic = df[df["is_festival_day"] == 1]["traffic_impact"].mean()
    info(f"  Mean traffic_impact — Normal: {nf_traffic:.3f}   Festival: {fst_traffic:.3f}")

    # Festival rows are sparse (5 days of 366); sample size may be small
    fst_n = (df["is_festival_day"] == 1).sum()
    info(f"  Festival rows in dataset: {fst_n}")

    chk("Festival mean traffic_impact > Non-festival",
        fst_traffic > nf_traffic,
        f"Festival={fst_traffic:.3f}  Normal={nf_traffic:.3f}")

    nf_go  = df[df["is_festival_day"] == 0]["label"].mean()
    fst_go = df[df["is_festival_day"] == 1]["label"].mean()
    info(f"  GO rate — Normal: {nf_go*100:.1f}%   Festival: {fst_go*100:.1f}%")

    if fst_n >= 10:
        chk("Festival GO rate < Non-festival GO rate (festivals are riskier)",
            fst_go < nf_go,
            f"Festival={fst_go*100:.1f}%  Normal={nf_go*100:.1f}%")
    else:
        info(f"  Festival sample too small ({fst_n}) for reliable GO rate check — skipped")


# ── Cross-dataset distribution check ─────────────────────────────────────────

def verify_distribution_match(train: pd.DataFrame, val: pd.DataFrame) -> None:
    print(f"\n{'─' * 58}")
    print("  TRAIN vs VAL distribution check")
    print(f"{'─' * 58}")

    # GO rate similarity
    tr_go = train["label"].mean()
    va_go = val["label"].mean()
    info(f"  GO rate — Train: {tr_go*100:.1f}%   Val: {va_go*100:.1f}%")
    chk("GO rate within 5pp between train and val",
        abs(tr_go - va_go) <= 0.05,
        f"train={tr_go*100:.1f}%  val={va_go*100:.1f}%")

    # Feature mean similarity (KS test — both datasets drawn from same generator)
    print()
    for feat in FEATURES:
        ks_stat, p_val = stats.ks_2samp(train[feat], val[feat])
        similar = p_val > 0.001   # very strict threshold: different seeds from same process
        chk(f"{feat:<28}: KS distributions consistent (p > 0.001)",
            similar,
            f"KS={ks_stat:.3f}  p={p_val:.3f}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    train_only = "--train-only" in sys.argv

    if not TRAIN_PATH.exists():
        print(f"ERROR: training file not found: {TRAIN_PATH}")
        print("Run:  python data/generate_dataset.py")
        sys.exit(1)

    train = pd.read_csv(TRAIN_PATH)
    verify(train, f"TRAINING  {TRAIN_PATH.name}")

    if not train_only:
        if not VAL_PATH.exists():
            print(f"\nWARNING: validation file not found: {VAL_PATH}")
        else:
            val = pd.read_csv(VAL_PATH)
            verify(val, f"VALIDATION  {VAL_PATH.name}")
            verify_distribution_match(train, val)

    print(f"\n{'═' * 58}")
    if _failures:
        print(f"  {FAIL}  {len(_failures)} check(s) FAILED:")
        for f in _failures:
            print(f"       • {f}")
    else:
        print(f"  {PASS}  All verification checks passed.")
    print(f"{'═' * 58}\n")

    sys.exit(0 if not _failures else 1)


if __name__ == "__main__":
    main()
