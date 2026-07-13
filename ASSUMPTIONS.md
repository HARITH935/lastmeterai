# Business Logic Assumptions — LastMeter AI

Every cost, time, and threshold constant used in savings/ROI/ETA calculations,
collected in one place with its source and confidence level. Written for
evaluators and the next developer — grep the "Used in" path to see it live.

**Confidence key:**
🟢 Cited external source · 🟡 Internal estimate/derivation · 🔴 Arbitrary judgment call (easiest to challenge, first to revisit)

---

## 1. Cost savings & ROI
`backend/app/services/analytics_service.py`

| Constant | Value | Meaning | Confidence | Source |
|---|---|---|---|---|
| `AVG_FAILED_DELIVERY_COST_INR` | ₹300.00 | Cost of one failed delivery attempt | 🟡 | Internal estimate: agent time (~1.5h) + return-trip fuel + re-scheduling overhead + customer-dissatisfaction allowance. Not independently benchmarked — no public source gives a per-failed-attempt cost breakdown at this granularity. |
| `BASELINE_SUCCESS_RATE` | 73% | First-attempt success rate *without* AI triage | 🟡 | Cited to RedSeer India E-commerce Logistics Report 2023. **Verification note (2026-07-13): the specific 73% figure could not be independently located via public search** — RedSeer is a real, credible research firm, but this exact statistic may be from a paid/full report not publicly indexed. Downgraded from 🟢 to 🟡 pending independent confirmation; not removed, since the original citation may still be accurate. |
| `FUEL_COST_PER_LITRE_INR` | ₹109.45 | Petrol price used for fuel-cost math | 🟢 | **Verified 2026-07-13** against a live Chennai fuel-price tracker (Goodreturns) — updated from a stale ₹104.00 "June 2026" estimate. Will drift again — petrol prices move monthly; re-verify periodically. |
| `FUEL_CONSUMPTION_PER_KM_LITRES` | 0.035 L/km | 2-wheeler fuel efficiency | 🟢 | **Verified 2026-07-13**: matches real-world city fuel economy for standard 100–125cc commuter bikes under delivery stop-and-go conditions. Published claimed mileage is 60–80 km/l for popular delivery bikes (TVS Sport, Bajaj Platina, Hero Splendor Plus), but real-world city/delivery riding reduces this 10–20% — netting to ≈24–27 km/l (0.037–0.042 L/km), consistent with this constant. |
| `AVG_DISTANCE_PER_ORDER_KM` | 4.5 km | Average last-mile distance per order | 🔴 | "Internal GPS trace estimate" per code comment — no trace data actually backs this in the current (synthetic) dataset. |

**Formula chain** (`get_cost_savings()`):
```
estimated_savings_inr      = no_go_count × AVG_FAILED_DELIVERY_COST_INR
fuel_saved_litres           = deliveries_avoided × AVG_DISTANCE_PER_ORDER_KM × FUEL_CONSUMPTION_PER_KM_LITRES
fuel_saved_inr              = fuel_saved_litres × FUEL_COST_PER_LITRE_INR
failed_cost_avoided_inr     = deliveries_avoided × AVG_FAILED_DELIVERY_COST_INR
improvement_pct             = (success_rate_with_ai − BASELINE_SUCCESS_RATE) / BASELINE_SUCCESS_RATE × 100
```

**Sensitivity** — every cost term above is a straight linear multiplier, so a
question like *"what if failed-delivery cost were ₹500, not ₹300?"* has an exact
answer, not a guess:

> `estimated_savings` scales 1:1 with `AVG_FAILED_DELIVERY_COST_INR`.
> ₹300 → ₹500 is a **+66.7%** change to that constant → **savings figures shown
> in the app increase by exactly 66.7%**, all else equal.

Same logic applies to every other constant in the table — each appears exactly
once, multiplicatively, in the formula chain above. To re-run the whole
dashboard under different assumptions, change the constant and re-deploy; no
other code changes needed.

---

## 2. GO / NO-GO decision threshold
`backend/app/config.py`, `backend/app/services/decision_service.py`

| Constant | Value | Meaning | Confidence | Source |
|---|---|---|---|---|
| `GONOGO_THRESHOLD` | 0.5 | Model output probability above which a delivery is marked GO | 🔴 | Standard default midpoint for a binary classifier — not tuned against a cost-of-error tradeoff (a false GO costs more than a false NO-GO per the ₹300 figure above, which argues for a threshold *above* 0.5 in a real deployment). Env-overridable (`GONOGO_THRESHOLD`) without a code change. |
| `_MAX_DELIVERY_KM` | 15.0 km | Distance normalization cap for the `distance_score` feature | 🔴 | Round-number cap, not derived from actual service-area boundaries. |

---

## 3. ETA prediction
`backend/app/services/eta_service.py`

| Constant | Value | Meaning | Confidence | Source |
|---|---|---|---|---|
| `_WINDOW_SPEED` (afternoon) | 20 km/h | Average city road speed, afternoon window | 🟢 | **Verified 2026-07-13**: near-exact match to the published TomTom Traffic Index — Chennai city-wide average is ~20 km/h (10 km in ~29 min). |
| `_WINDOW_SPEED` (morning/evening) | 24 / 15 km/h | Faster-than-average / slower-than-average adjustment | 🔴 | Relative ordering (morning faster, evening slower than the verified afternoon baseline) is plausible but the specific offsets are not independently measured. |
| Weather overhead | `× (1 + risk × 0.4)` | Travel-time penalty under weather risk | 🔴 | Round coefficient, not calibrated. |
| `_HANDLING_MIN` | 3 / 5 / 8 min (small/medium/large) | On-site package handling time | 🔴 | Judgment call. |
| `_RESIDENCE_MIN` | 4 / 2 min (apartment/independent) | Extra time to locate doorstep | 🔴 | Judgment call. |
| `_QUEUE_MIN_PER_ORDER` | 11.0 min | Time cost of each order queued ahead | 🔴 | Judgment call. |

---

## 4. Route optimization weighting
`backend/app/services/route_service.py`

| Constant | Value | Meaning | Confidence | Source |
|---|---|---|---|---|
| Weather overhead weight | `1.0 + weather_risk × 0.3` | How much weather risk inflates the TSP cost matrix (time-based routing) | 🔴 | Round coefficient, not calibrated against real delay data. |
| Traffic congestion factor | live, from TomTom Traffic Flow API | Real-time congestion multiplier | 🟢 | Live external data when `TOMTOM_API_KEY` is set — not an assumption. Falls back to `1.0` (no adjustment) if the key is absent or the call fails. |

---

## 5. GO/NO-GO placeholder model (fallback only)
`backend/app/ml/predictor.py`

Used **only** when the trained `lr_gonogo_v1.0.pkl` artifact is absent (dev/CI
without the model file) — in the deployed app, the real trained
LogisticRegression is loaded and these numbers are never used. Documented
anyway since they define the fallback's behavior:

| Feature | Weight | Direction |
|---|---|---|
| `weather_risk` | −3.20 | bad weather → NO-GO |
| `customer_history_score` | +1.80 | reliable customer → GO |
| `traffic_impact` | −1.10 | congestion → NO-GO |
| `agent_profit_score` | +1.40 | higher margin → GO |
| `distance_score` | −0.70 | farther → more risk |
| `time_of_day_score` | −0.55 | evening → harder |
| `package_size_score` | −0.85 | large items → harder |

🔴 Hand-authored weights (a plausible logistic regression, not fit to any
dataset) — explicitly a placeholder, exists so the API has a sane response
shape in dev/CI. Not a claim about real feature importance; see the *real*
trained model's coefficients via `GET /api/models/production` for actual
learned weights.

---

## Priority for tightening

Ranked by how much they'd move the headline "AI savings" number if wrong:

1. `AVG_FAILED_DELIVERY_COST_INR` (🟡) — directly, linearly drives the
   flagship savings figure. Worth a real cost audit before any external claim.
2. `AVG_DISTANCE_PER_ORDER_KM` (🔴) — the weakest-sourced constant with real
   $ impact (fuel savings). Should come from actual GPS trace data once available.
3. `GONOGO_THRESHOLD` (🔴) — arguably should be asymmetric (see note above)
   rather than a flat 0.5, once real failed-delivery cost data exists to
   optimize against.
4. Everything in ETA/route weighting (🔴) — affects UX quality (accurate ETAs)
   more than headline financial claims; lower priority to formalize.

See also `HANDOFF.md` → "Synthetic data throughout" — these constants and the
training data they interact with share the same underlying limitation: nothing
here has been validated against real Chennai delivery operations yet.
