"""
Smoke tests — Module 10: Analytics

Covers:
  1.  Dashboard: 6 cards + 3 trend arrays with correct lengths (7, 5, 7)
  2.  KPI (period=week): structure + agent_performance sorted by score DESC
  3.  Cost-savings: Agent (Adyar) sees only own-area scope; Manager sees all
  4.  Area analytics: valid area returns 200 with full structure
  5.  Customer: no matching address → 404 NO_HISTORY_FOUND
  6.  Heatmap: one zone per AREAS entry with required fields; all area names present
  7.  Role enforcement: Agent blocked (403) on 6 Manager-only endpoints
  8.  Agent can access /cost-savings (200, own-area scope)
  9.  Weather-impact: period=week returns daily_correlation + summary

Run from backend/:
    python3 tests/test_analytics.py
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("FLASK_ENV", "development")

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

from app import create_app
from app.extensions import limiter
from app.services.analytics_service import AREAS

app = create_app("development")
# Test suites log in multiple times per run, which can trip the
# production login rate limit (5/min). Disable it for tests only.
limiter.enabled = False

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
_failures: list[str] = []


def check(label: str, condition: bool, detail: str = ""):
    if condition:
        print(f"  {PASS}  {label}")
    else:
        print(f"  {FAIL}  {label}" + (f" — {detail}" if detail else ""))
        _failures.append(label)


def run():
    with app.test_client() as c:

        # ── Auth helpers ───────────────────────────────────────────────────────
        def login(username, password="agent123"):
            r = c.post("/api/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed for {username}: {r.data}"
            d = r.get_json()
            return d["access_token"]

        mgr_token   = login("manager", "manager123")
        adyar_token = login("ravi.kumar")   # Adyar agent

        mgr   = {"Authorization": f"Bearer {mgr_token}"}
        adyar = {"Authorization": f"Bearer {adyar_token}"}

        # ── 1. Dashboard ───────────────────────────────────────────────────────
        print("\n── 1. Dashboard ──")
        r = c.get("/api/analytics/dashboard", headers=mgr)
        check("GET /dashboard → 200", r.status_code == 200, r.data[:200])
        dash = r.get_json() or {}

        cards = dash.get("cards") or {}
        expected_cards = {
            "total_orders_today", "deliveries_completed", "high_risk_orders",
            "revenue_today", "estimated_savings", "active_agents",
        }
        check("cards has 6 keys", set(cards.keys()) == expected_cards,
              f"got {set(cards.keys())}")
        check(f"active_agents == {len(AREAS)}", cards.get("active_agents") == len(AREAS),
              f"got {cards.get('active_agents')}")

        trends = dash.get("trends") or {}
        srot = trends.get("success_rate_over_time") or []
        frba = trends.get("failure_rate_by_area") or []
        rbd  = trends.get("revenue_by_day") or []

        check("success_rate_over_time has 7 items", len(srot) == 7, f"got {len(srot)}")
        check(f"failure_rate_by_area has {len(AREAS)} items", len(frba) == len(AREAS), f"got {len(frba)}")
        check("revenue_by_day has 7 items",          len(rbd)  == 7, f"got {len(rbd)}")

        if srot:
            check("success_rate_over_time items have date+success_rate keys",
                  all("date" in item and "success_rate" in item for item in srot))
        if frba:
            check("failure_rate_by_area items have area+failure_rate keys",
                  all("area" in item and "failure_rate" in item for item in frba))
            areas_present = {item["area"] for item in frba}
            check("all areas in failure_rate_by_area",
                  areas_present == set(AREAS),
                  str(areas_present))
        if rbd:
            check("revenue_by_day items have date+revenue keys",
                  all("date" in item and "revenue" in item for item in rbd))

        # Sorted oldest → newest (7 consecutive dates)
        if len(srot) == 7:
            dates = [item["date"] for item in srot]
            check("success_rate_over_time dates ordered oldest → newest",
                  dates == sorted(dates), str(dates))

        # ── 2. KPI ─────────────────────────────────────────────────────────────
        print("\n── 2. KPI (period=week) ──")
        r = c.get("/api/analytics/kpi?period=week", headers=mgr)
        check("GET /kpi?period=week → 200", r.status_code == 200, r.data[:200])
        kpi = r.get_json() or {}

        check("period == 'week'", kpi.get("period") == "week")

        summary = kpi.get("summary") or {}
        check("summary has 4 keys",
              {"avg_delivery_time_minutes", "failed_delivery_pct", "total_orders", "total_delivered"}
              .issubset(set(summary.keys())))

        agent_perf = kpi.get("agent_performance") or []
        check("agent_performance is a list", isinstance(agent_perf, list))
        if len(agent_perf) >= 2:
            scores = [a["performance_score"] for a in agent_perf]
            check("agent_performance sorted by performance_score DESC",
                  all(scores[i] >= scores[i + 1] for i in range(len(scores) - 1)),
                  str(scores))

        area_perf = kpi.get("area_performance") or []
        check(f"area_performance has {len(AREAS)} entries", len(area_perf) == len(AREAS), f"got {len(area_perf)}")

        wi = kpi.get("weather_impact") or {}
        check("weather_impact has clear_days_success_rate",
              "clear_days_success_rate" in wi)
        check("weather_impact has rainy_days_success_rate",
              "rainy_days_success_rate" in wi)

        # Invalid period → 400
        r = c.get("/api/analytics/kpi?period=year", headers=mgr)
        check("Invalid KPI period → 400", r.status_code == 400)

        # ── 3. Cost savings — role scope ───────────────────────────────────────
        print("\n── 3. Cost savings — role scoping ──")
        r_mgr = c.get("/api/analytics/cost-savings?period=all", headers=mgr)
        check("Manager /cost-savings → 200", r_mgr.status_code == 200, r_mgr.data[:200])
        mgr_cs = r_mgr.get_json() or {}

        r_agent = c.get("/api/analytics/cost-savings?period=all", headers=adyar)
        check("Agent /cost-savings → 200 (scoped)", r_agent.status_code == 200, r_agent.data[:200])
        adyar_cs = r_agent.get_json() or {}

        check("Manager sees scope='all'", mgr_cs.get("scope") == "all",
              f"got {mgr_cs.get('scope')}")
        check("Agent sees scope=area", adyar_cs.get("scope") == "Adyar",
              f"got {adyar_cs.get('scope')}")

        mgr_total = (mgr_cs.get("metrics") or {}).get("total_orders", 0)
        adyar_total = (adyar_cs.get("metrics") or {}).get("total_orders", 0)
        check("Manager sees more decisions than Adyar agent",
              mgr_total > adyar_total,
              f"mgr={mgr_total}, adyar={adyar_total}")

        assumptions = mgr_cs.get("assumptions") or {}
        check("assumptions block has 4 keys",
              {"fuel_cost_per_litre_inr", "fuel_consumption_per_km_litres",
               "avg_distance_per_order_km", "avg_failed_delivery_cost_inr"}
              .issubset(set(assumptions.keys())))

        metrics = mgr_cs.get("metrics") or {}
        check("metrics has baseline_success_rate", "baseline_success_rate" in metrics)
        check("baseline_success_rate == 0.73",
              metrics.get("baseline_success_rate") == 0.73,
              f"got {metrics.get('baseline_success_rate')}")

        # ── 4. Area analytics ──────────────────────────────────────────────────
        print("\n── 4. Area analytics ──")
        r = c.get("/api/analytics/area/T%20Nagar", headers=mgr)
        check("GET /area/T Nagar → 200", r.status_code == 200, r.data[:200])
        area_data = r.get_json() or {}

        check("area == 'T Nagar'", area_data.get("area") == "T Nagar")

        summ = area_data.get("summary") or {}
        check("summary has total_orders", "total_orders" in summ)
        check("summary has success_rate",  "success_rate" in summ)
        check("summary has failure_rate",  "failure_rate" in summ)
        check("summary has risk_level",    "risk_level" in summ)
        check("risk_level is valid",
              summ.get("risk_level") in ("low", "medium", "high"),
              f"got {summ.get('risk_level')}")

        wi_area = area_data.get("weather_impact") or {}
        check("area weather_impact has rain_impact",
              wi_area.get("rain_impact") in ("low", "medium", "high"),
              f"got {wi_area.get('rain_impact')}")

        bw = area_data.get("best_delivery_window") or {}
        check("best_delivery_window has window key",
              bw.get("window") in ("morning", "afternoon", "evening"),
              f"got {bw.get('window')}")

        by_slot = area_data.get("by_time_slot") or {}
        check("by_time_slot has morning/afternoon/evening",
              all(s in by_slot for s in ("morning", "afternoon", "evening")))

        check("top_failure_reasons is a list",
              isinstance(area_data.get("top_failure_reasons"), list))

        check("model_predicted_failure_rate is float",
              isinstance(area_data.get("model_predicted_failure_rate"), float))

        # time_slot filter
        r = c.get("/api/analytics/area/Velachery?time_slot=morning", headers=mgr)
        check("GET /area/Velachery?time_slot=morning → 200", r.status_code == 200)

        # Invalid area → 400
        r = c.get("/api/analytics/area/UnknownCity", headers=mgr)
        check("Invalid area → 400 INVALID_AREA",
              r.status_code == 400 and (r.get_json() or {}).get("error") == "INVALID_AREA")

        # ── 5. Customer analytics ──────────────────────────────────────────────
        print("\n── 5. Customer analytics ──")
        r = c.get("/api/analytics/customer?address=Nonexistent+Road+XYZ+99999", headers=mgr)
        check("No matching address → 404 NO_HISTORY_FOUND",
              r.status_code == 404 and (r.get_json() or {}).get("error") == "NO_HISTORY_FOUND")

        # Missing address → 400
        r = c.get("/api/analytics/customer", headers=mgr)
        check("Missing address param → 400", r.status_code == 400)

        # Real address from seed data
        r = c.get("/api/analytics/customer?address=7+Main+Road%2C+Adyar%2C+Chennai", headers=mgr)
        check("Known address → 200", r.status_code == 200, r.data[:200])
        if r.status_code == 200:
            cust = r.get_json() or {}
            check("customer summary has success_rate", "success_rate" in (cust.get("summary") or {}))
            check("preferred_delivery_time present", "preferred_delivery_time" in cust)
            check("recent_orders is list", isinstance(cust.get("recent_orders"), list))
            check("recent_orders ≤ 5 items", len(cust.get("recent_orders", [])) <= 5)

        # ── 6. Heatmap ─────────────────────────────────────────────────────────
        print("\n── 6. Heatmap ──")
        r = c.get("/api/analytics/heatmap", headers=mgr)
        check("GET /heatmap → 200", r.status_code == 200, r.data[:200])
        hm = r.get_json() or {}

        zones = hm.get("zones") or []
        check(f"heatmap has exactly {len(AREAS)} zones", len(zones) == len(AREAS), f"got {len(zones)}")

        if zones:
            zone_fields = {"area", "lat", "lon", "order_count", "failure_rate", "risk_band"}
            check("each zone has required fields",
                  all(zone_fields.issubset(set(z.keys())) for z in zones),
                  str([set(z.keys()) for z in zones if not zone_fields.issubset(set(z.keys()))]))
            zone_areas = {z["area"] for z in zones}
            check("all areas present in heatmap",
                  zone_areas == set(AREAS),
                  str(zone_areas))
            check("each zone risk_band is valid",
                  all(z["risk_band"] in ("low", "medium", "high") for z in zones))
            check("zone coordinates are non-zero",
                  all(z["lat"] > 0 and z["lon"] > 0 for z in zones))

        # With time_slot filter
        r = c.get("/api/analytics/heatmap?time_slot=evening", headers=mgr)
        check(f"GET /heatmap?time_slot=evening → 200 with {len(AREAS)} zones",
              r.status_code == 200 and len((r.get_json() or {}).get("zones", [])) == len(AREAS))

        # ── 7. Weather impact ──────────────────────────────────────────────────
        print("\n── 7. Weather impact ──")
        r = c.get("/api/analytics/weather-impact?period=week", headers=mgr)
        check("GET /weather-impact?period=week → 200", r.status_code == 200, r.data[:200])
        wi_data = r.get_json() or {}

        check("period == 'week'", wi_data.get("period") == "week")
        check("daily_correlation is list", isinstance(wi_data.get("daily_correlation"), list))

        wi_summ = wi_data.get("summary") or {}
        check("summary has clear_avg_success",   "clear_avg_success" in wi_summ)
        check("summary has light_rain_avg_success", "light_rain_avg_success" in wi_summ)
        check("summary has heavy_rain_avg_success", "heavy_rain_avg_success" in wi_summ)
        check("summary has estimated_revenue_lost_to_weather_inr",
              "estimated_revenue_lost_to_weather_inr" in wi_summ)

        # Invalid period
        r = c.get("/api/analytics/weather-impact?period=year", headers=mgr)
        check("Invalid period → 400", r.status_code == 400)

        # ── 7b. Area Intelligence ──────────────────────────────────────────────
        print("\n── 7b. Area Intelligence ──")
        r = c.get("/api/analytics/area-intelligence/Velachery", headers=mgr)
        check("GET /area-intelligence/Velachery → 200", r.status_code == 200, r.data[:200])
        ai = r.get_json() or {}
        check("area == 'Velachery'", ai.get("area") == "Velachery")
        check("success_rate present", "success_rate" in ai)
        check("best_delivery_time present", "best_delivery_time" in ai)
        check("rain_impact present", "rain_impact" in ai)
        check("weather_sensitivity present", "weather_sensitivity" in ai)
        check("risk_level present", "risk_level" in ai)
        check("predictions_by_time present", isinstance(ai.get("predictions_by_time"), dict))
        if isinstance(ai.get("predictions_by_time"), dict):
            check("predictions_by_time has morning/afternoon/evening",
                  {"morning", "afternoon", "evening"}.issubset(ai["predictions_by_time"]))
        if ai.get("risk_level"):
            check("Velachery risk_level is high",
                  ai["risk_level"] == "high",
                  f"got {ai.get('risk_level')} — Velachery should be high-risk")
        if ai.get("weather_sensitivity"):
            check("weather_sensitivity is valid",
                  ai["weather_sensitivity"] in ("low", "medium", "high"))

        r = c.get("/api/analytics/area-intelligence/Anna Nagar", headers=mgr)
        check("GET /area-intelligence/Anna Nagar → 200", r.status_code == 200, r.data[:200])
        an = r.get_json() or {}
        if an.get("success_rate") is not None:
            check("Anna Nagar success_rate > Velachery success_rate",
                  an.get("success_rate", 0) > ai.get("success_rate", 1),
                  f"Anna Nagar={an.get('success_rate')} Velachery={ai.get('success_rate')}")

        r = c.get("/api/analytics/area-intelligence/Unknown City", headers=mgr)
        check("Unknown area → 404 AREA_NOT_FOUND",
              r.status_code == 404 and (r.get_json() or {}).get("error") == "AREA_NOT_FOUND")

        r = c.get("/api/analytics/area-intelligence/Adyar", headers=adyar)
        check("Agent → area-intelligence → 403 FORBIDDEN",
              r.status_code == 403 and (r.get_json() or {}).get("error") == "FORBIDDEN")

        # ── 8. Role enforcement ────────────────────────────────────────────────
        print("\n── 8. Role enforcement ──")
        manager_only = [
            ("/api/analytics/dashboard",      "GET", {}),
            ("/api/analytics/kpi",            "GET", {}),
            ("/api/analytics/area/Adyar",     "GET", {}),
            ("/api/analytics/customer?address=x", "GET", {}),
            ("/api/analytics/heatmap",        "GET", {}),
            ("/api/analytics/weather-impact", "GET", {}),
            ("/api/analytics/area-intelligence/Adyar", "GET", {}),
        ]
        for path, method, body in manager_only:
            r = c.get(path, headers=adyar)
            check(
                f"Agent → {path.split('?')[0].split('/')[-1]} → 403",
                r.status_code == 403 and (r.get_json() or {}).get("error") == "FORBIDDEN",
                f"got {r.status_code}",
            )

        # Agent can access cost-savings (already verified above as 200)
        r = c.get("/api/analytics/cost-savings", headers=adyar)
        check("Agent → /cost-savings → 200 (not 403)", r.status_code == 200)

        # ── Summary ────────────────────────────────────────────────────────────
        print(f"\n{'═' * 50}")
        if _failures:
            print(f"  {FAIL}  {len(_failures)} test(s) FAILED:")
            for f in _failures:
                print(f"       • {f}")
        else:
            print(f"  {PASS}  All smoke tests passed.")
        print("═" * 50)

    return len(_failures) == 0


if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
