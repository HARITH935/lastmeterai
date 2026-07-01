"""
LastMeter AI — Seed Script
==========================
Creates the full database schema and populates it with:
  - 1 manager account
  - 5 agents (one per Chennai area)
  - 30 orders (6 per agent, mixed statuses)
  - 30 decisions (one per order, realistic GO/NO-GO distribution)
  - 5 agent locations
  - 10 sample notifications
  - 12 audit log entries
  - 2 model_metadata rows (LR + RF, both trained at the same time)
  - 6 chat history rows (3 exchanges for the manager)

Run:
    cd backend
    python seed.py

Idempotent: drops and recreates all tables on each run (dev only).
"""

import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Make sure the app package resolves regardless of cwd.
sys.path.insert(0, str(Path(__file__).parent))

from app import create_app
from app.extensions import db, bcrypt
from app.models import (
    User, UserRole,
    Order, OrderStatus, PackageSize, TimeWindow, ResidenceType,
    Decision, DecisionType, RiskLevel,
    Notification, NotificationCategory,
    AuditLog, AuditAction, EntityType,
    ModelMetadata, ModelName,
    AgentLocation,
    ChatHistory, MessageRole, ChatIntent,
)

app = create_app(os.environ.get("FLASK_ENV", "development"))

# ── Helpers ───────────────────────────────────────────────────────────────────

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

def days_ago(n: int) -> datetime:
    return utcnow() - timedelta(days=n)

def days_ahead(n: int) -> datetime:
    return utcnow() + timedelta(days=n)

def hash_pw(plain: str) -> str:
    return bcrypt.generate_password_hash(plain).decode("utf-8")


# ── Seed data definitions ─────────────────────────────────────────────────────

AREAS = ["Anna Nagar", "T Nagar", "Velachery", "Adyar", "Porur"]

# Approximate centroid coordinates for each area (Chennai).
AREA_COORDS = {
    "Anna Nagar":  (13.0850, 80.2101),
    "T Nagar":     (13.0418, 80.2341),
    "Velachery":   (12.9815, 80.2180),
    "Adyar":       (13.0063, 80.2574),
    "Porur":       (13.0358, 80.1567),
}

AGENTS = [
    {"username": "ravi.kumar",   "name": "Ravi Kumar",    "area": "Adyar",       "phone": "9876543210"},
    {"username": "karthik.raj",  "name": "Karthik Raj",   "area": "T Nagar",     "phone": "9876543211"},
    {"username": "surya.venkat", "name": "Surya Venkat",  "area": "Velachery",   "phone": "9876543212"},
    {"username": "priya.lakshmi","name": "Priya Lakshmi", "area": "Anna Nagar",  "phone": "9876543213"},
    {"username": "deepa.mohan",  "name": "Deepa Mohan",   "area": "Porur",       "phone": "9876543214"},
]

# 6 orders per agent — varied statuses, package sizes, time windows, risk profiles.
ORDER_TEMPLATES = [
    # (customer_name, residence_type, package, window, days_until_deadline,
    #  payment, status, is_urgent, lat_offset, lon_offset, fail_reason)
    ("Anitha Suresh",    ResidenceType.APARTMENT,    PackageSize.MEDIUM,  TimeWindow.MORNING,    2,  350.0, OrderStatus.PENDING,    False,  0.005,  0.003, None),
    ("Babu Krishnan",    ResidenceType.INDEPENDENT,  PackageSize.SMALL,   TimeWindow.AFTERNOON,  1,  180.0, OrderStatus.IN_TRANSIT, True,  -0.004,  0.007, None),
    ("Chitra Nair",      ResidenceType.APARTMENT,    PackageSize.LARGE,   TimeWindow.EVENING,    3,  620.0, OrderStatus.DELIVERED,  False,  0.008, -0.005, None),
    ("Dinesh Raj",       ResidenceType.INDEPENDENT,  PackageSize.SMALL,   TimeWindow.MORNING,    0,  210.0, OrderStatus.FAILED,     False, -0.006,  0.002, "Customer not available"),
    ("Eswari Devi",      ResidenceType.APARTMENT,    PackageSize.MEDIUM,  TimeWindow.AFTERNOON,  4,  400.0, OrderStatus.POSTPONED,  False,  0.003,  0.009, "Heavy rain, requested reschedule"),
    ("Farhan Ahamed",    ResidenceType.INDEPENDENT,  PackageSize.LARGE,   TimeWindow.EVENING,    1,  750.0, OrderStatus.PENDING,    True,  -0.002, -0.004, None),
]

def make_order_number(seq: int) -> str:
    return f"LM-{seq:04d}"


def make_decision(order: Order, seq: int) -> Decision:
    """
    Fabricate a realistic Decision for seeding.
    Even-numbered orders are GO, odd-numbered are NO-GO, with varied risk scores.
    """
    is_go = (seq % 2 == 0)
    success_prob = round(0.72 + (0.08 if is_go else -0.25), 4)
    # Clamp to valid range.
    success_prob = max(0.05, min(0.97, success_prob))
    risk_score = round((1.0 - success_prob) * 100)

    if risk_score <= 30:
        risk_level = RiskLevel.LOW
    elif risk_score <= 60:
        risk_level = RiskLevel.MEDIUM
    else:
        risk_level = RiskLevel.HIGH

    shap = {
        "weather_risk": round(35.2 if not is_go else 5.1, 1),
        "customer_history_score": round(24.8 if not is_go else 3.2, 1),
        "distance_score": round(15.1 if not is_go else 8.4, 1),
        "time_of_day_score": round(10.3 if not is_go else 4.7, 1),
        "traffic_impact": round(7.8 if not is_go else 2.9, 1),
        "package_size_score": round(4.1 if not is_go else 3.6, 1),
        "agent_profit_score": round(2.7 if not is_go else -1.2, 1),
    }

    reschedule = None
    if not is_go:
        reschedule = {
            "suggested_date": (utcnow() + timedelta(days=2)).strftime("%Y-%m-%d"),
            "suggested_window": "afternoon",
            "predicted_success_probability": 0.81,
            "reason": "Rain expected to clear; afternoon traffic historically lower",
        }

    return Decision(
        order_id=order.id,
        model_name=ModelName.GONOGO_LR,
        model_version="v1.0",
        decision=DecisionType.GO if is_go else DecisionType.NO_GO,
        success_probability=success_prob,
        risk_score=risk_score,
        risk_level=risk_level,
        weather_risk=0.15 if is_go else 0.72,
        customer_history_score=0.10 if is_go else 0.55,
        traffic_impact=0.20 if is_go else 0.65,
        agent_profit_score=0.75 if is_go else 0.35,
        distance_score=0.30 if is_go else 0.58,
        time_of_day_score=0.25 if is_go else 0.60,
        package_size_score=0.10 if is_go else 0.50,
        shap_values=shap,
        weather_snapshot={
            "condition": "Clear" if is_go else "Light Rain",
            "temp_c": 31.2 if is_go else 27.8,
            "humidity": 65 if is_go else 84,
            "wind_kmh": 12.5 if is_go else 22.0,
            "description": "clear sky" if is_go else "light rain",
        },
        reschedule_suggestion=reschedule,
        created_at=utcnow(),
    )


# ── Main seeding function ──────────────────────────────────────────────────────

def seed():
    with app.app_context():
        print("Dropping existing tables …")
        db.drop_all()
        print("Creating tables …")
        db.create_all()

        # ── 1. Manager ────────────────────────────────────────────────────────
        manager = User(
            username="manager",
            password_hash=hash_pw("manager123"),
            role=UserRole.MANAGER,
            name="Operations Manager",
            phone="9800000001",
            area=None,
            city="Chennai",
            is_active=True,
        )
        db.session.add(manager)
        db.session.flush()  # get manager.id
        print(f"  Created manager: {manager.username} (id={manager.id})")

        # ── 2. Agents ─────────────────────────────────────────────────────────
        agents: list[User] = []
        for a in AGENTS:
            user = User(
                username=a["username"],
                password_hash=hash_pw("agent123"),
                role=UserRole.AGENT,
                name=a["name"],
                phone=a["phone"],
                area=a["area"],
                city="Chennai",
                is_active=True,
            )
            db.session.add(user)
            agents.append(user)
        db.session.flush()
        for a in agents:
            print(f"  Created agent: {a.username} (id={a.id}) — area={a.area}")

        # ── 3. Agent Locations ────────────────────────────────────────────────
        location_offsets = [0.001, -0.002, 0.003, -0.001, 0.002]
        for i, agent in enumerate(agents):
            base_lat, base_lon = AREA_COORDS[agent.area]
            loc = AgentLocation(
                agent_id=agent.id,
                latitude=round(base_lat + location_offsets[i], 6),
                longitude=round(base_lon + location_offsets[i], 6),
                area=agent.area,
                heading=round(45.0 * (i + 1) % 360, 1),
                speed_kmh=round(18.5 + i * 2.3, 1),
                is_online=True,
                current_order_id=None,
                last_updated=utcnow(),
            )
            db.session.add(loc)
        db.session.flush()
        print("  Created 5 agent locations")

        # ── 4. Orders + Decisions ─────────────────────────────────────────────
        all_orders: list[Order] = []
        order_seq = 1
        for agent in agents:
            base_lat, base_lon = AREA_COORDS[agent.area]
            for tmpl in ORDER_TEMPLATES:
                (cname, rtype, pkg, window, days, payment,
                 status, urgent, dlat, dlon, fail_reason) = tmpl

                order = Order(
                    order_number=make_order_number(order_seq),
                    customer_name=cname,
                    customer_phone=f"98765{order_seq:05d}",
                    customer_address=f"{order_seq * 7} Main Road, {agent.area}, Chennai",
                    area=agent.area,
                    city="Chennai",
                    latitude=round(base_lat + dlat, 6),
                    longitude=round(base_lon + dlon, 6),
                    residence_type=rtype,
                    agent_id=agent.id,
                    package_size=pkg,
                    time_window=window,
                    deadline=days_ahead(days),
                    status=status,
                    failure_reason=fail_reason,
                    payment_amount=payment,
                    is_urgent=urgent,
                    created_by=manager.id,
                    created_at=days_ago(3 - (order_seq % 3)),
                    updated_at=days_ago(1),
                )
                db.session.add(order)
                all_orders.append(order)
                order_seq += 1

        db.session.flush()
        print(f"  Created {len(all_orders)} orders")

        # One Decision per order.
        for i, order in enumerate(all_orders):
            decision = make_decision(order, i)
            db.session.add(decision)
        db.session.flush()
        print(f"  Created {len(all_orders)} decisions")

        # ── 5. Model Metadata (LR + RF, both v1.0) ───────────────────────────
        trained = days_ago(1)

        lr_meta = ModelMetadata(
            model_name=ModelName.GONOGO_LR,
            model_version="v1.0",
            mlflow_run_id="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
            mlflow_experiment_id="1",
            accuracy=0.914,
            precision_score=0.907,
            recall_score=0.921,
            f1_score=0.914,
            confusion_matrix={"tn": 412, "fp": 38, "fn": 22, "tp": 528},
            feature_importance=[
                {"feature": "weather_risk",           "importance": 0.2831},
                {"feature": "customer_history_score", "importance": 0.2147},
                {"feature": "distance_score",         "importance": 0.1612},
                {"feature": "traffic_impact",         "importance": 0.1389},
                {"feature": "time_of_day_score",      "importance": 0.0974},
                {"feature": "package_size_score",     "importance": 0.0631},
                {"feature": "agent_profit_score",     "importance": 0.0416},
            ],
            dataset_size=5000,
            training_parameters={"C": 1.0, "max_iter": 1000, "solver": "lbfgs"},
            artifact_path="ml/models/lr_gonogo_v1.0.pkl",
            is_production=True,
            trained_at=trained,
        )

        rf_meta = ModelMetadata(
            model_name=ModelName.GONOGO_RF,
            model_version="v1.0",
            mlflow_run_id="b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
            mlflow_experiment_id="2",
            accuracy=0.927,
            precision_score=0.918,
            recall_score=0.935,
            f1_score=0.926,
            confusion_matrix={"tn": 418, "fp": 32, "fn": 18, "tp": 532},
            feature_importance=[
                {"feature": "weather_risk",           "importance": 0.2614},
                {"feature": "customer_history_score", "importance": 0.2298},
                {"feature": "traffic_impact",         "importance": 0.1553},
                {"feature": "distance_score",         "importance": 0.1441},
                {"feature": "time_of_day_score",      "importance": 0.1012},
                {"feature": "package_size_score",     "importance": 0.0672},
                {"feature": "agent_profit_score",     "importance": 0.0410},
            ],
            dataset_size=5000,
            training_parameters={
                "n_estimators": 200,
                "max_depth": 12,
                "min_samples_split": 4,
                "random_state": 42,
            },
            artifact_path="ml/models/rf_gonogo_v1.0.pkl",
            is_production=False,
            trained_at=trained,
        )

        db.session.add(lr_meta)
        db.session.add(rf_meta)
        db.session.flush()
        print("  Created 2 model_metadata rows (LR prod + RF validation)")

        # ── 6. Notifications ─────────────────────────────────────────────────
        notif_data = [
            # (user, category, title, message, is_read, order_index)
            (manager, NotificationCategory.AI_ALERT,
             "5 orders flagged NO-GO",
             "AI flagged 5 orders as NO-GO. Velachery and Adyar areas most affected. Consider rescheduling.",
             False, None),
            (manager, NotificationCategory.WEATHER_ALERT,
             "Heavy rain expected in Adyar",
             "OpenWeather forecast: heavy rain tomorrow afternoon in Adyar. 8 orders at risk.",
             False, None),
            (manager, NotificationCategory.SYSTEM_ALERT,
             "Model v1.0 deployed",
             "GO/NO-GO Logistic Regression v1.0 is now the active production model. Accuracy: 91.4%",
             True, None),
            (agents[0], NotificationCategory.DELIVERY_ALERT,
             "Order LM-0004 urgent — deliver today",
             "Order LM-0004 deadline is today. Mark as delivered or contact manager.",
             False, 3),
            (agents[0], NotificationCategory.AI_ALERT,
             "Order LM-0005 flagged NO-GO",
             "AI analysis: NO-GO. Weather risk 35%, customer history 25%. Reschedule suggested for 26 Jun afternoon.",
             False, 4),
            (agents[1], NotificationCategory.DELIVERY_ALERT,
             "New order assigned: LM-0007",
             "Order LM-0007 assigned to you in T Nagar. Package: Small. Window: Afternoon.",
             True, 6),
            (agents[1], NotificationCategory.WEATHER_ALERT,
             "Light rain in T Nagar this morning",
             "Current conditions: light rain, 22 km/h winds. Exercise caution on two-wheelers.",
             False, None),
            (agents[2], NotificationCategory.AI_ALERT,
             "Order LM-0011 flagged NO-GO",
             "High risk delivery. Recommend postponing to tomorrow morning.",
             False, 10),
            (agents[3], NotificationCategory.DELIVERY_ALERT,
             "Order LM-0019 marked Delivered",
             "Order LM-0019 successfully delivered. Earnings updated: +₹400.",
             True, 18),
            (agents[4], NotificationCategory.SYSTEM_ALERT,
             "Your profile has been updated",
             "Manager updated your contact phone number. Check profile settings.",
             True, None),
        ]

        for idx, (user, cat, title, msg, is_read, oi) in enumerate(notif_data):
            n = Notification(
                user_id=user.id,
                category=cat,
                title=title,
                message=msg,
                is_read=is_read,
                order_id=all_orders[oi].id if oi is not None else None,
                created_at=days_ago(idx % 3),
            )
            db.session.add(n)
        db.session.flush()
        print("  Created 10 notifications")

        # ── 7. Audit Logs ─────────────────────────────────────────────────────
        audit_data = [
            (EntityType.ORDER,   all_orders[0].id,  AuditAction.ORDER_CREATED,
             f"Order {all_orders[0].order_number} created by Operations Manager",
             manager.id, None, {"order_number": all_orders[0].order_number, "area": "Adyar"}),
            (EntityType.DECISION, all_orders[0].id, AuditAction.AI_FLAGGED_GO,
             f"AI flagged {all_orders[0].order_number} as GO — risk score 28",
             None, None, {"decision": "GO", "risk_score": 28}),
            (EntityType.ORDER,   all_orders[1].id,  AuditAction.ORDER_STATUS_CHANGED,
             f"Order {all_orders[1].order_number} status changed to In Transit by Ravi Kumar",
             agents[0].id,
             {"status": "pending"},
             {"status": "in_transit"}),
            (EntityType.ORDER,   all_orders[2].id,  AuditAction.ORDER_STATUS_CHANGED,
             f"Order {all_orders[2].order_number} marked Delivered by Ravi Kumar",
             agents[0].id,
             {"status": "in_transit"},
             {"status": "delivered"}),
            (EntityType.DECISION, all_orders[4].id, AuditAction.AI_FLAGGED_NO_GO,
             f"AI flagged {all_orders[4].order_number} as NO-GO — risk score 72, weather risk dominant",
             None, None, {"decision": "NO-GO", "risk_score": 72}),
            (EntityType.ORDER,   all_orders[4].id,  AuditAction.ORDER_STATUS_CHANGED,
             f"Order {all_orders[4].order_number} postponed by Ravi Kumar — heavy rain",
             agents[0].id,
             {"status": "pending"},
             {"status": "postponed"}),
            (EntityType.ORDER,   all_orders[6].id,  AuditAction.ORDER_REASSIGNED,
             f"Order {all_orders[6].order_number} reassigned to Karthik Raj by Operations Manager",
             manager.id,
             {"agent_id": agents[0].id},
             {"agent_id": agents[1].id}),
            (EntityType.AGENT,   agents[0].id,       AuditAction.AGENT_LOGIN,
             "Agent Ravi Kumar logged in",
             agents[0].id, None, {"ip": "192.168.1.10"}),
            (EntityType.AGENT,   manager.id,          AuditAction.MANAGER_LOGIN,
             "Manager logged in",
             manager.id, None, {"ip": "192.168.1.1"}),
            (EntityType.ORDER,   all_orders[3].id,   AuditAction.ORDER_STATUS_CHANGED,
             f"Order {all_orders[3].order_number} marked Failed — customer not available",
             agents[0].id,
             {"status": "in_transit"},
             {"status": "failed"}),
            (EntityType.SYSTEM,  None,                "model_deployed",
             "GO/NO-GO Logistic Regression v1.0 promoted to production",
             None, None, {"model": "gonogo_lr", "version": "v1.0"}),
            (EntityType.DECISION, all_orders[10].id, AuditAction.AI_FLAGGED_NO_GO,
             f"AI flagged {all_orders[10].order_number} as NO-GO — risk score 68",
             None, None, {"decision": "NO-GO", "risk_score": 68}),
        ]

        for i, (etype, eid, action, desc, actor_id, old_v, new_v) in enumerate(audit_data):
            al = AuditLog(
                entity_type=etype,
                entity_id=eid,
                action=action,
                description=desc,
                actor_id=actor_id,
                old_value=old_v,
                new_value=new_v,
                created_at=utcnow() - timedelta(hours=i * 2),
            )
            db.session.add(al)
        db.session.flush()
        print("  Created 12 audit log entries")

        # ── 8. Chat History (3 exchanges for the manager) ─────────────────────
        import uuid
        session_id = str(uuid.uuid4())
        chat_rows = [
            ChatHistory(
                user_id=manager.id,
                role=MessageRole.USER,
                message="Which area has the most failed deliveries this week?",
                intent=ChatIntent.AREA_RISK,
                intent_confidence=0.94,
                session_id=session_id,
                created_at=days_ago(1) + timedelta(hours=10),
            ),
            ChatHistory(
                user_id=manager.id,
                role=MessageRole.ASSISTANT,
                message=(
                    "Velachery had the highest failure rate this week at 28% (7 out of 25 "
                    "deliveries). The main contributors were weather risk (35%) and evening "
                    "time-window issues (30%). I'd suggest shifting Velachery deliveries to "
                    "the morning window tomorrow when rain is expected to clear."
                ),
                intent=None,
                intent_confidence=None,
                context_data={
                    "area_stats": [
                        {"area": "Velachery",  "failure_rate": 0.28, "total": 25},
                        {"area": "Adyar",      "failure_rate": 0.22, "total": 18},
                        {"area": "T Nagar",    "failure_rate": 0.15, "total": 20},
                        {"area": "Anna Nagar", "failure_rate": 0.10, "total": 22},
                        {"area": "Porur",      "failure_rate": 0.08, "total": 16},
                    ]
                },
                gemini_tokens_used=312,
                session_id=session_id,
                created_at=days_ago(1) + timedelta(hours=10, minutes=1),
            ),
            ChatHistory(
                user_id=manager.id,
                role=MessageRole.USER,
                message="Suggest reassignments for the high-risk orders in Adyar.",
                intent=ChatIntent.REASSIGN_SUGGESTION,
                intent_confidence=0.89,
                session_id=session_id,
                created_at=days_ago(1) + timedelta(hours=10, minutes=3),
            ),
            ChatHistory(
                user_id=manager.id,
                role=MessageRole.ASSISTANT,
                message=(
                    "I see 3 high-risk orders in Adyar (LM-0004, LM-0005, LM-0006). "
                    "Ravi Kumar currently has a 96% success rate and 2 spare time slots "
                    "this afternoon. I recommend reassigning LM-0004 and LM-0005 to him "
                    "for the morning window. LM-0006 (Large package) may need a dedicated "
                    "run — consider postponing to tomorrow when traffic eases."
                ),
                intent=None,
                intent_confidence=None,
                context_data={
                    "high_risk_orders": [
                        {"order_number": "LM-0004", "risk_score": 72},
                        {"order_number": "LM-0005", "risk_score": 68},
                        {"order_number": "LM-0006", "risk_score": 61},
                    ],
                    "available_agents": [
                        {"agent_id": 2, "name": "Ravi Kumar", "success_rate": 0.96, "spare_slots": 2},
                    ],
                },
                gemini_tokens_used=428,
                session_id=session_id,
                created_at=days_ago(1) + timedelta(hours=10, minutes=4),
            ),
            ChatHistory(
                user_id=agents[0].id,
                role=MessageRole.USER,
                message="How much will I earn today?",
                intent=ChatIntent.EARNINGS_QUERY,
                intent_confidence=0.97,
                session_id=str(uuid.uuid4()),
                created_at=utcnow() - timedelta(hours=3),
            ),
            ChatHistory(
                user_id=agents[0].id,
                role=MessageRole.ASSISTANT,
                message=(
                    "Based on your current orders, you have 2 delivered today (₹350 + ₹180 = ₹530) "
                    "and 1 in-transit (₹750, expected). If the in-transit order delivers, "
                    "today's total would be ₹1,280. Keep an eye on Order LM-0002 — "
                    "it's marked urgent so prioritise that next!"
                ),
                intent=None,
                intent_confidence=None,
                context_data={
                    "agent_id": None,   # filled at runtime; placeholder in seed
                    "delivered_today": 2,
                    "earned_today": 530.0,
                    "pending_amount": 750.0,
                },
                gemini_tokens_used=198,
                session_id=None,
                created_at=utcnow() - timedelta(hours=3, minutes=1),
            ),
        ]
        for ch in chat_rows:
            if ch.user_id is None:
                ch.user_id = agents[0].id  # fix placeholder
            db.session.add(ch)
        db.session.flush()
        print("  Created 6 chat history rows")

        # ── Commit everything ─────────────────────────────────────────────────
        db.session.commit()
        print("\n✓ Seed complete.")
        print(f"  Manager login: username=manager  password=manager123")
        print(f"  Agent logins:  password=agent123 for all agents")
        print(f"  Agent usernames: {', '.join(a.username for a in agents)}")


if __name__ == "__main__":
    seed()
