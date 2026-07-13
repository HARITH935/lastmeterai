# Synthetic Data — Methodology & Validation Status

All ML models in LastMeter AI are trained on **generated, not real, delivery
data**. This document is an honest account of what that data actually is, how
it was constructed, what's well-calibrated versus not, and what real-world
validation would require. Written for evaluators and the next developer.

**Correction note (2026-07-13):** an earlier version of this document
incorrectly stated that no generator script exists in this repo, based on
checking only the (empty) `ml/src/generator/` directory. The real generator
lives at `ml/data/generate_dataset.py` and has existed since the first
commit — this version was rewritten after actually reading it. Recorded here
for transparency rather than silently corrected.

## Where the data comes from

`ml/data/generate_dataset.py` (467 lines) produces `synthetic_orders.csv`
(5,000 rows, seed 42) and `synthetic_orders_val.csv` (1,000 rows, seed 123).
`ml/data/verify_dataset.py` runs a **statistical self-check** on the output
(KS tests, Mann-Whitney, t-tests) — both scripts are runnable:
```
cd ml && python data/generate_dataset.py   # regenerate
cd ml && python data/verify_dataset.py     # verify statistical properties
```
`chat_intents.csv` and `failure_reasons.csv` have **no generator script** —
confirmed by grep; neither file is referenced anywhere in
`generate_dataset.py` or `verify_dataset.py`. Those two were built some other
way (hand-written or another process) that isn't reproducible from this repo.

## Dataset inventory

| File | Rows | Used to train | Generator exists? |
|---|---|---|---|
| `synthetic_orders.csv` | 5,000 | `gonogo_lr`, `gonogo_rf` | ✅ `generate_dataset.py` |
| `synthetic_orders_val.csv` | 1,000 | validation only | ✅ same script, seed 123 |
| `chat_intents.csv` | 707 | `nlp_intent` | ❌ none found |
| `failure_reasons.csv` | 540 | `nlp_reason` | ❌ none found |

## How `synthetic_orders.csv` is actually built (read from code, not inferred)

This is a genuinely well-reasoned simulation, not naive random sampling:

- **Area risk is geography-grounded, not uniform.** Each of the 5 areas gets
  its own weather (`Beta(α,β)`) and traffic distribution parameters, with
  documented real-world reasoning: Velachery and Adyar sit in flood-prone low
  Chennai basins (Buckingham Canal / Adyar River watershed, both hit in the
  2015 and 2023 floods) → highest weather risk. Anna Nagar sits on higher
  ground (~14m elevation) → lowest. T Nagar is a dense commercial hub → highest
  baseline traffic. This produces a **real, statistically verified** spread:
  Velachery's NO-GO rate is 46.7% vs. Anna Nagar's 11.6% — confirmed
  significant by Mann-Whitney U test (p = 1.78×10⁻²³) in `verify_dataset.py`.
- **Categorical proportions are deliberately weighted, not uniform**: package
  size 40/40/20 (small/medium/large), time window 40/35/25
  (morning/afternoon/evening), residence 58/42 (apartment/independent) — code
  comments describe these as an assumed "realistic Chennai e-commerce mix,"
  which is itself unverified against real order data, but the *shape* is
  intentional, not accidental uniformity.
- **A documented non-linear risk model**: weather × traffic has an explicit
  multiplicative interaction term (`W_COMPOUND = 3.0`) reasoned as "heavy rain
  AND high traffic is multiplicatively worse than either alone." Reliable
  customers and skilled agents reduce risk; unreliable customers at long
  distance compound it via a cross-term.
- **Real Chennai festival dates** (Thai Pongal, Tamil New Year, Diwali 2024)
  with modeled traffic spikes (+45%) and residual risk bonus.
- **Label noise near the decision boundary**: up to 10% flip probability for
  borderline cases, decaying to ~0 at the extremes — models real-world
  ambiguity (human override, incomplete data) rather than a hard threshold.
- **Train/val consistency is formally checked, not assumed**: `verify_dataset.py`
  runs a Kolmogorov-Smirnov test per feature confirming the val set's
  distribution matches train (all 7 features pass, p > 0.001), and confirms
  GO-rate is within 5pp between the two splits (73.1% vs 74.4%).

## What's genuinely a limitation (even in a well-built generator)

- **Order *volume* per area is uniform** — `area = rng.choice(AREAS)` samples
  each of the 5 areas with equal probability (~1,000 rows each). The *risk
  characteristics* per area are realistically differentiated (see above), but
  the *count* of orders isn't — real order volume almost certainly skews by
  area (a commercial hub plausibly generates more delivery volume than a
  residential-only zone). This is the one clear, specific gap worth flagging.
- **Train/val split is not temporal.** Both splits draw from the same full
  year (2024-01-01 to 2024-12-31) with different random seeds — it's an i.i.d.
  split, not a holdout that tests generalization to a *future* period the way
  a time-based split would.
- **Every numeric assumption is domain-reasoned, not measured.** The Beta
  distribution parameters, the interaction weight `W_COMPOUND = 3.0`, the
  `RISK_BOUNDARY = 0.55`, the festival/weekend adjustments — all are the
  author's calibrated judgment calls (well-documented, internally consistent,
  geographically informed) but **none are fit to or checked against actual
  Chennai delivery outcomes**, because no such dataset has ever existed in
  this project.
- **`chat_intents.csv` / `failure_reasons.csv` have no generator at all** —
  can't be regenerated, extended, or rebalanced without reconstructing
  whatever process made them. `failure_reasons.csv` is perfectly balanced (135
  rows × 4 categories), which is a common training convenience, not a claim
  about real incidence rates — e.g. weather-related failures are very unlikely
  to occur exactly as often as "other" categories in a real Chennai monsoon
  season.

## Validation status: internally consistent, not externally validated

`verify_dataset.py` proves the generator does what it claims to do (the area
differences are real, the weekend/festival effects are real, train/val are
statistically consistent). That is **internal validation of the generation
process** — it says nothing about whether the process reflects actual Chennai
delivery operations, because there is nothing real to compare it to yet.

**This requires actual delivery outcome data — no amount of further synthetic
tuning substitutes for it.** When/if that becomes available, the validation to
run is:

1. Compare real order volume *and* NO-GO rate by area to
   `generate_dataset.py`'s uniform-volume, geography-weighted-risk assumption
   — likely the single biggest correction needed.
2. Re-check whether `BASELINE_SUCCESS_RATE = 0.73`
   (`analytics_service.py`, cited to RedSeer 2023) still holds for this
   specific operation.
3. Feed real (weather, traffic, order) feature vectors through the trained
   `gonogo_lr`/`gonogo_rf` models and compare predicted vs. actual outcomes —
   report accuracy/precision/recall delta from the synthetic-validation
   numbers already stored in `model_metadata` (queryable via `GET /api/models`).
4. Rebuild `chat_intents.csv` and `failure_reasons.csv` from real (anonymized)
   chat/failure logs once enough volume exists — there's no generator to
   re-tune for these, they'd need to be rebuilt from scratch.

See also `ASSUMPTIONS.md` for the business-logic constants (cost, fuel, ETA)
that share this same underlying limitation — nothing in this system has been
checked against real Chennai delivery operations yet, however carefully
reasoned the synthetic construction is.
