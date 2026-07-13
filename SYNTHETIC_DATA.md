# Synthetic Data — Methodology & Validation Status

All ML models in LastMeter AI are trained on **generated, not real, delivery
data**. This document is an honest account of what that data actually is,
how it was likely constructed (reconstructed empirically — see note below),
what's well-calibrated versus not, and what real-world validation would
require. Written for evaluators and the next developer.

## Important disclosure: the generator scripts do not exist in this repo

`ml/src/generator/` exists as a directory but **has never contained a tracked
file**, in the entire git history (verified via `git log --all` on the path).
Only the *output* CSVs in `ml/data/raw/` were committed. This means:

- Nobody can currently re-run the generation process or reproduce these exact
  files from scratch.
- Nobody can currently tweak generation parameters (e.g. rebalance a class,
  add a new feature) without first reconstructing the generator.
- Everything below was determined by **statistically analyzing the CSVs
  directly** (row counts, distributions, correlations) — not by reading
  generation code, because none exists to read.

**Recommendation:** if the CSVs ever need to be regenerated or extended,
budget time to rebuild a generator script from this document's findings
before assuming one just needs "updating."

## Dataset inventory

| File | Rows | Used to train | Purpose |
|---|---|---|---|
| `synthetic_orders.csv` | 5,000 | `gonogo_lr`, `gonogo_rf` | GO/NO-GO delivery-risk classifiers |
| `synthetic_orders_val.csv` | 1,000 | validation only | Held-out split for the above |
| `chat_intents.csv` | 707 | `nlp_intent` | Chat intent classifier (8 classes) |
| `failure_reasons.csv` | 540 | `nlp_reason` | Failure-reason classifier (4 classes) |

## What the data actually looks like

### `synthetic_orders.csv` / `_val.csv`
17 columns: 7 normalized `[0,1]` feature scores (`weather_risk`,
`traffic_impact`, `customer_history_score`, `agent_profit_score`,
`distance_score`, `time_of_day_score`, `package_size_score`), categorical
context (`area`, `time_window`, `residence_type`, `package_size_raw`,
weekend/festival flags, `date`), and the target (`true_risk_score`, `label`).

- **Label balance: 73.1% success (train), 74.4% (val)** — this is not a
  coincidence: it matches `BASELINE_SUCCESS_RATE = 0.73` in
  `analytics_service.py` (RedSeer India 2023) almost exactly. **The data was
  deliberately calibrated to a real, cited industry benchmark** — a genuine
  point in favor of representativeness on this one dimension.
- **`is_weekend` ratio: 28.5%** — matches the real 2/7 calendar ratio closely.
  Another sign of deliberate calibration, not pure randomness.
- **Areas are near-uniform**: 970–1,065 rows per area across all 5 Chennai
  zones. This does **not** reflect reality — real order volume is almost
  certainly skewed by area (a commercial zone like T Nagar plausibly sees
  more volume than a residential one). This is a real limitation.
- **`time_window` / `package_size` / `residence_type`**: also close to
  uniform — same limitation as above, likely a deliberate simplification
  rather than a modeled real-world skew.
- **Date range: 2024-01-01 to 2024-12-31 for both train and val** — the split
  is **random, not temporal**. A true holdout that tests for seasonal drift
  would separate by date range; this doesn't. Acceptable for i.i.d. synthetic
  data, but means the validation split doesn't prove anything about
  generalizing to a *future* period the way a time-based split would.

### `chat_intents.csv`
8 intent classes, **deliberately imbalanced**: `order_status` (120 examples,
the most common real-world intent) down to `postpone_query`/`reassign_suggestion`
(75 each). This shape looks intentionally weighted toward expected real usage
frequency — a reasonable design choice, though (like everything else here)
unverified against real chat logs, because none exist yet.

### `failure_reasons.csv`
4 categories (`weather`, `customer`, `traffic`, `other`), **perfectly
balanced at 135 rows each**. This is a common synthetic-text-classifier
pattern to avoid training bias toward the majority class, but it explicitly
does **not** represent true incidence rates — e.g., weather-related failures
are very unlikely to occur exactly as often as "other" in real operations
(Chennai's monsoon season alone would skew this heavily). Treat this
dataset's class balance as a training convenience, not a claim about
real-world frequency.

## Representativeness assessment

| Dimension | Assessment |
|---|---|
| Overall success rate | 🟢 Calibrated to a real cited benchmark (RedSeer 2023) |
| Weekend/weekday ratio | 🟢 Matches real calendar ratio |
| Area-to-area volume distribution | 🔴 Artificially uniform, not representative |
| Time-window / package-size / residence distribution | 🔴 Artificially uniform |
| Chat intent class balance | 🟡 Plausible but unverified against real chat logs |
| Failure-reason class balance | 🔴 Balanced for training convenience, not real incidence |
| Train/val split | 🟡 Random (i.i.d.), not temporal — doesn't test for seasonal drift |

## Validation status: **not validated against real data**

No real Chennai last-mile delivery dataset exists in this project. "Validation"
here means internal train/val consistency only (label balance and feature
distributions match closely between the two splits — see numbers above), which
confirms the *generation process* is internally consistent, but says nothing
about whether that process reflects real operations.

**This cannot be fixed by more documentation or more synthetic tuning.** It
requires actual delivery outcome data. When/if that becomes available, the
validation to run is:

1. Compare real success-rate-by-area to the assumed-uniform synthetic
   distribution — likely the biggest correction needed.
2. Re-check whether `BASELINE_SUCCESS_RATE = 0.73` still holds for this
   specific operation, or whether it needs replacing with a measured number.
3. Feed real (weather, traffic, order) feature vectors through the trained
   `gonogo_lr`/`gonogo_rf` models and compare predicted vs. actual outcomes —
   report accuracy/precision/recall delta from the synthetic-validation numbers
   already stored in `model_metadata` (queryable via `GET /api/models`).
4. Rebuild the chat-intent and failure-reason training sets from real
   (anonymized) chat/failure logs once enough volume exists.

See also `ASSUMPTIONS.md` for the business-logic constants (cost, fuel, ETA)
that share this same underlying limitation — nothing in this system has been
checked against real Chennai delivery operations yet.
