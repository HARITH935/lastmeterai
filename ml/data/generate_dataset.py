"""
Synthetic training dataset generator for LastMeter AI GO/NO-GO model.

Produces two files:
  ml/data/raw/synthetic_orders.csv      — 5 000 training rows  (seed 42)
  ml/data/raw/synthetic_orders_val.csv  — 1 000 validation rows (seed 123)

Each file contains the 7 model input features, context columns, and labels.

FEATURES (fed to the model):
  weather_risk, customer_history_score, traffic_impact, agent_profit_score,
  distance_score, time_of_day_score, package_size_score

CONTEXT columns (used for generation realism; useful for area/time sub-models):
  area, time_window, residence_type, package_size_raw,
  is_weekend, is_festival_day, day_of_week, date

LABELS:
  label        — 1 = GO, 0 = NO-GO  (binary, with realistic noise)
  true_risk_score — 0-100, higher = riskier (before noise, for calibration)

Run:
  cd ml && python data/generate_dataset.py
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

# ── Output paths ──────────────────────────────────────────────────────────────

REPO_ROOT  = Path(__file__).parent.parent          # ml/
RAW_DIR    = REPO_ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

TRAIN_PATH = RAW_DIR / "synthetic_orders.csv"
VAL_PATH   = RAW_DIR / "synthetic_orders_val.csv"

N_TRAIN = 5_000
N_VAL   = 1_000

SEED_TRAIN = 42
SEED_VAL   = 123

# ── Date range ────────────────────────────────────────────────────────────────
# Full calendar year 2024 — captures all seasons, monsoon, festivals.
DATE_START = date(2024, 1, 1)
DATE_END   = date(2024, 12, 31)

# ── Chennai festival dates (2024) ──────────────────────────────────────────────
# These days carry elevated traffic and delivery friction beyond what the
# traffic_impact and time_of_day_score features can fully capture (road closures,
# crowd density, vehicle access restrictions near procession routes).
FESTIVAL_DATES: set[date] = {
    date(2024, 1, 14),   # Thai Pongal — most significant Tamil festival
    date(2024, 1, 15),   # Mattu Pongal — cattle festival, many roads blocked
    date(2024, 4, 14),   # Tamil New Year / Puthandu — heavy processions
    date(2024, 11, 1),   # Diwali 2024
    date(2024, 11, 2),   # Day after Diwali — markets crowded, residue traffic
}

# ── Area parameters ───────────────────────────────────────────────────────────
# Weather uses a Beta(alpha, beta) distribution.
# REASONING: Velachery and Adyar sit in flood-prone low-lying basins of Chennai
# (Buckingham Canal / Adyar River watershed). Both saw severe inundation in the
# 2015 and 2023 floods. Anna Nagar sits on higher ground (~14m elevation) and
# drains faster. T Nagar is commercial/intermediate elevation. Porur is western.
#
# Higher alpha / lower beta ratio → heavier-tailed, higher mean weather risk.
# Mean of Beta(α,β) = α / (α+β).
#
# traffic_base also varies: T Nagar (dense commercial hub) has higher baseline
# traffic than Porur (western periphery).
#
# area_risk_bias is added directly to raw_risk (before normalization) to model
# structural risk differences between areas (narrow lanes, access constraints,
# building density) that go beyond just weather and traffic.

AREA_PARAMS: dict[str, dict] = {
    "Velachery": {
        # weather ~ Beta(1.35, 2.20) → mean ≈ 0.38  most rain-prone
        "weather_alpha": 1.35, "weather_beta": 2.20,
        # traffic_base ~ Beta(2.8, 3.0) → mean ≈ 0.48  busy residential + IT corridor
        "traffic_alpha": 2.80, "traffic_beta": 3.00,
        "area_risk_bias": 0.10,
    },
    "Adyar": {
        # weather ~ Beta(1.20, 2.70) → mean ≈ 0.31  Adyar river, second-most flood-prone
        "weather_alpha": 1.20, "weather_beta": 2.70,
        # traffic_base ~ Beta(2.4, 3.2) → mean ≈ 0.43
        "traffic_alpha": 2.40, "traffic_beta": 3.20,
        "area_risk_bias": 0.07,
    },
    "T Nagar": {
        # weather ~ Beta(1.00, 3.50) → mean ≈ 0.22  moderate rain
        "weather_alpha": 1.00, "weather_beta": 3.50,
        # traffic_base ~ Beta(3.2, 2.5) → mean ≈ 0.56  commercial hub, chronically congested
        "traffic_alpha": 3.20, "traffic_beta": 2.50,
        "area_risk_bias": 0.04,
    },
    "Anna Nagar": {
        # weather ~ Beta(0.85, 4.50) → mean ≈ 0.16  driest area, elevated terrain
        "weather_alpha": 0.85, "weather_beta": 4.50,
        # traffic_base ~ Beta(2.0, 3.5) → mean ≈ 0.36  residential, moderate traffic
        "traffic_alpha": 2.00, "traffic_beta": 3.50,
        "area_risk_bias": 0.00,   # baseline reference area
    },
    "Porur": {
        # weather ~ Beta(0.95, 4.00) → mean ≈ 0.19  western suburb, drier
        "weather_alpha": 0.95, "weather_beta": 4.00,
        # traffic_base ~ Beta(2.2, 3.8) → mean ≈ 0.37  moderate; OMR junction can spike
        "traffic_alpha": 2.20, "traffic_beta": 3.80,
        "area_risk_bias": 0.02,
    },

    # ── 15 areas added 2026-07-13 — individually researched, not generic fill-in.
    # Sources: MDPI 2024 comparative study of the 2015/2023 Chennai floods;
    # Tamil Nadu flood-risk zone mapping (livechennai.com, verified.realestate);
    # Chennai traffic congestion coverage (Maduravoyal/Koyambedu junction,
    # Ambattur industrial growth, Perambur-Kolathur corridor).

    "Guindy": {
        # weather ~ Beta(1.20, 2.65) → mean ≈ 0.31  explicitly named "highly
        # vulnerable" alongside Velachery/Adyar/Saidapet (Adyar & Cooum river banks)
        "weather_alpha": 1.20, "weather_beta": 2.65,
        # traffic_base ~ Beta(3.0, 2.8) → mean ≈ 0.52  major industrial/IT hub
        "traffic_alpha": 3.00, "traffic_beta": 2.80,
        "area_risk_bias": 0.075,
    },
    "Saidapet": {
        # weather ~ Beta(1.15, 2.55) → mean ≈ 0.31  named flood-prone: floods
        # when the Adyar river swells beyond carrying capacity
        "weather_alpha": 1.15, "weather_beta": 2.55,
        # traffic_base ~ Beta(2.8, 2.9) → mean ≈ 0.49  central corridor, near Guindy/T Nagar
        "traffic_alpha": 2.80, "traffic_beta": 2.90,
        "area_risk_bias": 0.072,
    },
    "Sholinganallur": {
        # weather ~ Beta(1.30, 2.15) → mean ≈ 0.38  Pallikaranai marsh basin;
        # low elevation (5-12m), frequent/prolonged waterlogging — comparable to Velachery
        "weather_alpha": 1.30, "weather_beta": 2.15,
        # traffic_base ~ Beta(2.6, 3.0) → mean ≈ 0.46  OMR IT corridor
        "traffic_alpha": 2.60, "traffic_beta": 3.00,
        "area_risk_bias": 0.105,
    },
    "Thiruvanmiyur": {
        # weather ~ Beta(1.20, 2.70) → mean ≈ 0.31  coastal (Ennore→Thiruvanmiyur→ECR
        # strip), low elevation, cyclone/storm-surge exposure
        "weather_alpha": 1.20, "weather_beta": 2.70,
        # traffic_base ~ Beta(2.3, 3.2) → mean ≈ 0.42  coastal residential + some commercial
        "traffic_alpha": 2.30, "traffic_beta": 3.20,
        "area_risk_bias": 0.08,
    },
    "Egmore": {
        # weather ~ Beta(1.10, 2.85) → mean ≈ 0.28  Cooum belt — canal backflow,
        # historically flood-prone (railway station area, low-lying)
        "weather_alpha": 1.10, "weather_beta": 2.85,
        # traffic_base ~ Beta(2.7, 2.9) → mean ≈ 0.48  central, railway station traffic
        "traffic_alpha": 2.70, "traffic_beta": 2.90,
        "area_risk_bias": 0.06,
    },
    "Nungambakkam": {
        # weather ~ Beta(1.00, 3.20) → mean ≈ 0.24  Teynampet zone, Cooum-adjacent
        "weather_alpha": 1.00, "weather_beta": 3.20,
        # traffic_base ~ Beta(2.9, 2.7) → mean ≈ 0.52  central, upscale commercial
        "traffic_alpha": 2.90, "traffic_beta": 2.70,
        "area_risk_bias": 0.045,
    },
    "Mylapore": {
        # weather ~ Beta(0.95, 3.30) → mean ≈ 0.22  Teynampet zone, near Adyar
        # river mouth but an older, traditionally better-drained area
        "weather_alpha": 0.95, "weather_beta": 3.30,
        # traffic_base ~ Beta(2.6, 2.9) → mean ≈ 0.47  cultural/commercial hub, temple traffic
        "traffic_alpha": 2.60, "traffic_beta": 2.90,
        "area_risk_bias": 0.04,
    },
    "Tambaram": {
        # weather ~ Beta(1.00, 3.30) → mean ≈ 0.23  incomplete drainage network
        # (moderate flood threat, not top-tier)
        "weather_alpha": 1.00, "weather_beta": 3.30,
        # traffic_base ~ Beta(2.1, 3.3) → mean ≈ 0.39  far south, suburban, railway junction
        "traffic_alpha": 2.10, "traffic_beta": 3.30,
        "area_risk_bias": 0.045,
    },
    "Chromepet": {
        # weather ~ Beta(1.00, 3.25) → mean ≈ 0.24  adjacent to Tambaram /
        # Pallikaranai basin, similar moderate drainage profile
        "weather_alpha": 1.00, "weather_beta": 3.25,
        # traffic_base ~ Beta(2.2, 3.2) → mean ≈ 0.41  suburban with industrial pockets
        "traffic_alpha": 2.20, "traffic_beta": 3.20,
        "area_risk_bias": 0.045,
    },
    "Perambur": {
        # weather ~ Beta(0.95, 3.50) → mean ≈ 0.21  near (not in) the Cooum belt
        # stagnation zone; railway/industrial north Chennai
        "weather_alpha": 0.95, "weather_beta": 3.50,
        # traffic_base ~ Beta(2.6, 3.0) → mean ≈ 0.46  Perambur-Kolathur / Inner Ring Road corridor
        "traffic_alpha": 2.60, "traffic_beta": 3.00,
        "area_risk_bias": 0.04,
    },
    "Besant Nagar": {
        # weather ~ Beta(0.90, 3.60) → mean ≈ 0.20  coastal but elevated
        # stretches — "relatively safer", avoided major waterlogging except extreme events
        "weather_alpha": 0.90, "weather_beta": 3.60,
        # traffic_base ~ Beta(2.0, 3.6) → mean ≈ 0.36  residential coastal
        "traffic_alpha": 2.00, "traffic_beta": 3.60,
        "area_risk_bias": 0.03,
    },
    "Vadapalani": {
        # weather ~ Beta(0.90, 3.70) → mean ≈ 0.20  west-central, moderate
        "weather_alpha": 0.90, "weather_beta": 3.70,
        # traffic_base ~ Beta(2.7, 2.9) → mean ≈ 0.48  commercial/film-industry hub, Koyambedu spillover
        "traffic_alpha": 2.70, "traffic_beta": 2.90,
        "area_risk_bias": 0.035,
    },
    "Koyambedu": {
        # weather ~ Beta(0.90, 3.80) → mean ≈ 0.19  not flood-flagged
        "weather_alpha": 0.90, "weather_beta": 3.80,
        # traffic_base ~ Beta(3.3, 2.4) → mean ≈ 0.58  HIGHEST traffic of all 20 areas:
        # CMBT bus terminus + wholesale market + Maduravoyal junction spillover
        "traffic_alpha": 3.30, "traffic_beta": 2.40,
        "area_risk_bias": 0.03,
    },
    "Ambattur": {
        # weather ~ Beta(0.85, 4.10) → mean ≈ 0.17  not flood-flagged, northwest
        "weather_alpha": 0.85, "weather_beta": 4.10,
        # traffic_base ~ Beta(2.8, 2.9) → mean ≈ 0.49  rapid industrial growth area
        "traffic_alpha": 2.80, "traffic_beta": 2.90,
        "area_risk_bias": 0.025,
    },
    "Kilpauk": {
        # weather ~ Beta(0.88, 4.00) → mean ≈ 0.18  central-north, established
        # residential, not flood-flagged — comparable to Anna Nagar
        "weather_alpha": 0.88, "weather_beta": 4.00,
        # traffic_base ~ Beta(2.1, 3.4) → mean ≈ 0.38  moderate residential
        "traffic_alpha": 2.10, "traffic_beta": 3.40,
        "area_risk_bias": 0.02,
    },
}

AREAS = list(AREA_PARAMS.keys())

# ── Time-window effects ───────────────────────────────────────────────────────
# REASONING:
# morning (6-12):   rush-hour start, commuter traffic building but not peak.
#                   time_of_day_score is low — early deliveries face fewer obstacles.
# afternoon (12-18): peak traffic (post-lunch + school run), highest congestion.
#                   time_of_day_score is highest — deliveries slow down most here.
# evening (18-21):  traffic tapering; customers more likely to be home (higher
#                   customer_history availability) but door-opening times vary.

TIME_TRAFFIC_MULT: dict[str, float] = {
    "morning":   1.10,   # above-neutral (rush hour starting)
    "afternoon": 1.35,   # peak multiplier
    "evening":   1.00,   # baseline (tapering)
}

TIME_TOD_BASE: dict[str, float] = {
    "morning":   0.22,   # low congestion-induced delivery delay
    "afternoon": 0.52,   # highest delay risk
    "evening":   0.38,   # moderate
}

# ── Package size → package_size_score ─────────────────────────────────────────
# REASONING: larger packages need cargo vehicles, take longer to unload, and face
# more access friction in apartment buildings. Score represents difficulty of the
# last-metre handoff, not package value.

PKG_SCORE: dict[str, tuple[float, float]] = {
    "small":  (0.20, 0.05),   # (mean, std)
    "medium": (0.50, 0.08),
    "large":  (0.78, 0.06),
}

# Package size and time window proportions (realistic Chennai e-commerce mix)
PKG_WEIGHTS   = [0.40, 0.40, 0.20]    # small, medium, large
PKG_LABELS    = ["small", "medium", "large"]
TIME_WEIGHTS  = [0.40, 0.35, 0.25]    # morning, afternoon, evening
TIME_LABELS   = ["morning", "afternoon", "evening"]
RES_WEIGHTS   = [0.58, 0.42]          # apartment, independent
RES_LABELS    = ["apartment", "independent"]

# Apartment friction added to distance_score
# REASONING: residence_type is not one of the 7 model features. Its effect
# (security gate wait, lift delays, no-parking issues) manifests as longer
# effective "last-metre" distance. We fold it into distance_score (+0.06)
# so the model can learn this signal from the composite distance feature
# without needing residence_type at inference time.
APARTMENT_FRICTION = 0.06

# ── Scoring weights ───────────────────────────────────────────────────────────
# Higher raw_risk → higher true_risk_score → more likely NO-GO.
# Calibrated so that the average order has raw_risk ≈ 0.10 and the
# decision boundary (raw_risk = 0.55) corresponds to score = 50,
# yielding ~70-75% GO rate for a functioning logistics operation.
#
# Key non-linearity: weather_risk × traffic_impact compound term.
# REASONING: heavy rain AND high traffic is multiplicatively worse than either
# alone — wet roads at crawl speed means driver ETA predictability collapses,
# customer complaints spike, and re-attempt costs are highest. This interaction
# effect is NOT captured by the linear terms individually.

W_COMPOUND      = 3.0    # weather × traffic interaction weight
W_WEATHER       = 0.50   # standalone weather risk
W_TRAFFIC       = 0.40   # standalone traffic risk
W_DISTANCE      = 0.30   # delivery distance risk
W_TIME          = 0.30   # time-of-day congestion risk
W_PACKAGE       = 0.18   # package handling difficulty
W_CROSS         = 0.30   # (1-customer) × distance cross-term: unreliable customer at long distance
W_CUSTOMER_BEN  = 0.80   # reliable customer benefit (negative contribution to risk)
W_AGENT_BEN     = 0.55   # skilled agent benefit (negative contribution to risk)

# Raw risk normalization: score = 50 + (raw - BOUNDARY) / SCALE * 100
# Maps raw risk onto [0, 100] with BOUNDARY as the GO/NO-GO decision point.
# BOUNDARY tuned empirically: with the feature distributions above, raw ≈ 0.55
# sits at approximately the 70th percentile of the raw risk distribution,
# giving ~30% NO-GO naturally. See verify_dataset.py for post-hoc validation.
RISK_BOUNDARY   = 0.55
RISK_SCALE      = 2.20   # 1 unit of raw risk ≈ 45 points on the 0-100 scale

# Noise injection parameters
# REASONING: 10% maximum flip rate at the decision boundary simulates real-world
# label uncertainty (human override, incomplete customer data, model ambiguity).
# The flip probability decays toward 0 at score extremes so clear-cut cases
# are rarely mislabelled.
MAX_FLIP_RATE   = 0.10
FESTIVAL_BONUS  = 0.08   # added to raw_risk on festival days (residual friction)
WEEKEND_RELIEF  = 0.04   # subtracted from raw_risk on weekends


# ── Core generation function ──────────────────────────────────────────────────

def _generate(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    all_dates = [DATE_START + timedelta(days=i)
                 for i in range((DATE_END - DATE_START).days + 1)]

    rows: list[dict] = []

    for _ in range(n):
        # ── Context sampling ───────────────────────────────────────────────
        d        = rng.choice(all_dates)          # type: ignore[arg-type]
        area     = rng.choice(AREAS)
        tw       = rng.choice(TIME_LABELS,   p=TIME_WEIGHTS)
        res      = rng.choice(RES_LABELS,    p=RES_WEIGHTS)
        pkg_raw  = rng.choice(PKG_LABELS,    p=PKG_WEIGHTS)

        is_weekend  = int(d.weekday() >= 5)
        is_festival = int(d in FESTIVAL_DATES)
        dow         = d.weekday()

        p = AREA_PARAMS[area]

        # ── Feature generation ─────────────────────────────────────────────

        # 1. weather_risk — Beta distribution parameterised per area.
        weather_risk = float(np.clip(
            rng.beta(p["weather_alpha"], p["weather_beta"]), 0.0, 1.0
        ))

        # 2. traffic_impact — area base × time-window multiplier × weekend/festival
        #    REASONING: weekend reduces commuter traffic by ~28%; festivals spike
        #    by ~45% (road closures, processions, extra vehicles).
        base_traffic = float(rng.beta(p["traffic_alpha"], p["traffic_beta"]))
        weekend_mult  = 0.72  if is_weekend  else 1.00
        festival_mult = 1.45  if is_festival else 1.00
        traffic_impact = float(np.clip(
            base_traffic * TIME_TRAFFIC_MULT[tw] * weekend_mult * festival_mult,
            0.0, 1.0,
        ))

        # 3. customer_history_score — mixture of reliability tiers.
        #    REASONING: 60% of repeat customers are reliable (prior GO record),
        #    25% are moderate (mixed history), 15% are new/unreliable.
        #    Weekend bump: +4pp because customers are more likely to be home,
        #    reducing "not available" failures which lower the score over time.
        tier = rng.random()
        if tier < 0.60:
            c_raw = rng.beta(5.0, 2.0)    # mean ≈ 0.71
        elif tier < 0.85:
            c_raw = rng.beta(3.0, 3.0)    # mean ≈ 0.50
        else:
            c_raw = rng.beta(2.0, 5.0)    # mean ≈ 0.29
        customer_history_score = float(np.clip(
            c_raw + (0.04 if is_weekend else 0.0), 0.0, 1.0
        ))

        # 4. agent_profit_score — agents are generally capable (pre-selected).
        #    REASONING: Beta(3.0, 1.5) → mean ≈ 0.67. Some underperformers exist
        #    (new hires, agents covering outside their area) but majority are
        #    experienced. Score combines tenure, delivery success rate, and
        #    customer rating from the backend's existing scoring logic.
        agent_profit_score = float(np.clip(rng.beta(3.0, 1.5), 0.0, 1.0))

        # 5. distance_score — base distance + apartment access friction.
        #    REASONING: Apartment buildings add ~0.06 to effective distance risk
        #    via gate security delays, parking constraints, and multi-floor lifts.
        #    We fold residence_type effect into this feature because the model's
        #    7-feature contract does not include residence_type at inference time.
        base_dist = float(rng.beta(2.0, 3.0))   # mean ≈ 0.40
        apartment_adj = APARTMENT_FRICTION if res == "apartment" else 0.0
        distance_score = float(np.clip(base_dist + apartment_adj, 0.0, 1.0))

        # 6. time_of_day_score — time-window base + festival spike + Gaussian noise.
        #    REASONING: festivals add ~15pp because estimated delivery windows blow
        #    out (traffic unpredictable, routes change). Noise (σ=0.06) models
        #    day-to-day variation within each time window.
        festival_tod = 0.15 if is_festival else 0.0
        time_of_day_score = float(np.clip(
            TIME_TOD_BASE[tw] + festival_tod + rng.normal(0, 0.06),
            0.0, 1.0,
        ))

        # 7. package_size_score — sampled around per-size means with tight noise.
        ps_mean, ps_std = PKG_SCORE[pkg_raw]
        package_size_score = float(np.clip(rng.normal(ps_mean, ps_std), 0.0, 1.0))

        # ── Risk scoring ───────────────────────────────────────────────────
        #
        # raw_risk formula (documented once, not per-row):
        #   core = w*t*W_COMPOUND              ← compound non-linear term
        #        + w*W_WEATHER + t*W_TRAFFIC   ← standalone weather & traffic
        #        + d*W_DISTANCE                ← distance risk
        #        + tod*W_TIME                  ← time-pressure risk
        #        + ps*W_PACKAGE                ← package handling difficulty
        #        + (1-c)*d*W_CROSS             ← unreliable customer × distance
        #        + area_risk_bias              ← structural area risk
        #        - c*W_CUSTOMER_BEN            ← reliable customer reduces risk
        #        - ap*W_AGENT_BEN              ← skilled agent reduces risk
        #
        # Residual festival / weekend context effects (beyond what flows through
        # traffic_impact and time_of_day_score) are added below.

        raw_risk = (
            weather_risk * traffic_impact * W_COMPOUND
            + weather_risk           * W_WEATHER
            + traffic_impact         * W_TRAFFIC
            + distance_score         * W_DISTANCE
            + time_of_day_score      * W_TIME
            + package_size_score     * W_PACKAGE
            + (1.0 - customer_history_score) * distance_score * W_CROSS
            + p["area_risk_bias"]
            - customer_history_score * W_CUSTOMER_BEN
            - agent_profit_score     * W_AGENT_BEN
        )

        # Residual festival / weekend adjustments (beyond what features carry)
        if is_festival:
            raw_risk += FESTIVAL_BONUS
        if is_weekend:
            raw_risk -= WEEKEND_RELIEF

        # Normalise to [0, 100]
        true_risk_score = float(np.clip(
            50.0 + (raw_risk - RISK_BOUNDARY) / RISK_SCALE * 100.0,
            0.0, 100.0,
        ))

        # ── Label with noise ──────────────────────────────────────────────
        # Natural label: risk ≥ 50 → NO-GO (0), risk < 50 → GO (1)
        natural = 1 if true_risk_score < 50.0 else 0

        # Flip probability is highest at the boundary (risk_score ≈ 50) and
        # approaches 0 at the extremes. This models real-world ambiguity where
        # borderline cases are sometimes overridden by domain judgement.
        boundary_proximity = max(0.0, 1.0 - 2.0 * abs(true_risk_score / 100.0 - 0.5))
        flip_prob = MAX_FLIP_RATE * boundary_proximity
        label = (1 - natural) if rng.random() < flip_prob else natural

        rows.append({
            # ── 7 model features ──────────────────────────────────────────
            "weather_risk":            round(weather_risk,            4),
            "traffic_impact":          round(traffic_impact,          4),
            "customer_history_score":  round(customer_history_score,  4),
            "agent_profit_score":      round(agent_profit_score,      4),
            "distance_score":          round(distance_score,          4),
            "time_of_day_score":       round(time_of_day_score,       4),
            "package_size_score":      round(package_size_score,      4),
            # ── Context columns ───────────────────────────────────────────
            "area":              area,
            "time_window":       tw,
            "residence_type":    res,
            "package_size_raw":  pkg_raw,
            "is_weekend":        is_weekend,
            "is_festival_day":   is_festival,
            "day_of_week":       dow,
            "date":              d.isoformat(),
            # ── Labels ───────────────────────────────────────────────────
            "true_risk_score": round(true_risk_score, 2),
            "label":           label,
        })

    return pd.DataFrame(rows)


# ── Summary printing ──────────────────────────────────────────────────────────

def _print_summary(df: pd.DataFrame, name: str) -> None:
    n       = len(df)
    go_n    = (df["label"] == 1).sum()
    nogo_n  = (df["label"] == 0).sum()
    go_pct  = go_n   / n * 100
    nogo_pct = nogo_n / n * 100

    print(f"\n{'═' * 60}")
    print(f"  {name}  ({n:,} rows)")
    print(f"{'═' * 60}")

    print(f"\n  LABEL BALANCE")
    print(f"    GO    : {go_n:>5,}  ({go_pct:.1f}%)")
    print(f"    NO-GO : {nogo_n:>5,}  ({nogo_pct:.1f}%)")

    print(f"\n  FEATURE DISTRIBUTIONS  (mean ± std)")
    feats = [
        "weather_risk", "traffic_impact", "customer_history_score",
        "agent_profit_score", "distance_score", "time_of_day_score",
        "package_size_score",
    ]
    for f in feats:
        print(f"    {f:<28}: {df[f].mean():.3f} ± {df[f].std():.3f}"
              f"  [min={df[f].min():.3f}, max={df[f].max():.3f}]")

    print(f"\n  GO RATE BY AREA")
    area_stats = (
        df.groupby("area")["label"]
        .agg(go_rate="mean", count="count", nogo_count=lambda x: (x == 0).sum())
        .rename(columns={"go_rate": "go_rate", "count": "n", "nogo_count": "no_go"})
    )
    area_stats["go_%"]   = (area_stats["go_rate"] * 100).round(1)
    area_stats["nogo_%"] = (100 - area_stats["go_%"]).round(1)
    for area, row in area_stats.iterrows():
        print(f"    {area:<14}: {row['go_%']:>5.1f}% GO   {row['nogo_%']:>5.1f}% NO-GO"
              f"  (n={row['n']})")

    print(f"\n  GO RATE BY TIME WINDOW")
    for tw, grp in df.groupby("time_window"):
        rate = grp["label"].mean() * 100
        print(f"    {tw:<12}: {rate:.1f}% GO")

    print(f"\n  GO RATE BY PACKAGE SIZE")
    for pkg, grp in df.groupby("package_size_raw"):
        rate = grp["label"].mean() * 100
        print(f"    {pkg:<8}: {rate:.1f}% GO")

    print(f"\n  WEEKEND vs WEEKDAY")
    for flag, grp in df.groupby("is_weekend"):
        label_str = "Weekend" if flag else "Weekday"
        rate = grp["label"].mean() * 100
        print(f"    {label_str}: {rate:.1f}% GO  (n={len(grp)})")

    print(f"\n  FESTIVAL DAYS")
    for flag, grp in df.groupby("is_festival_day"):
        label_str = "Festival" if flag else "Normal  "
        rate = grp["label"].mean() * 100
        print(f"    {label_str}: {rate:.1f}% GO  (n={len(grp)})")

    print(f"\n  TRUE RISK SCORE DISTRIBUTION")
    print(f"    mean={df['true_risk_score'].mean():.1f}  "
          f"std={df['true_risk_score'].std():.1f}  "
          f"p25={df['true_risk_score'].quantile(0.25):.1f}  "
          f"p50={df['true_risk_score'].quantile(0.50):.1f}  "
          f"p75={df['true_risk_score'].quantile(0.75):.1f}  "
          f"p90={df['true_risk_score'].quantile(0.90):.1f}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    print("Generating training set …")
    train = _generate(N_TRAIN, SEED_TRAIN)
    train.to_csv(TRAIN_PATH, index=False)
    _print_summary(train, f"TRAINING SET  →  {TRAIN_PATH.name}")

    print("\nGenerating validation set …")
    val = _generate(N_VAL, SEED_VAL)
    val.to_csv(VAL_PATH, index=False)
    _print_summary(val, f"VALIDATION SET  →  {VAL_PATH.name}")

    print(f"\n  Saved:\n    {TRAIN_PATH}\n    {VAL_PATH}\n")


if __name__ == "__main__":
    main()
