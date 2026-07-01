#!/usr/bin/env python3
"""
A7 — NLP Pipeline Training

Trains two text classifiers and saves them as sklearn Pipeline objects:

  1. failure_reason_clf_v1.0.pkl
     Classifies free-text delivery failure reasons into:
       weather | customer | traffic | other
     Drop-in replacement for the keyword bucketing in
     analytics_service.get_area_analytics() (Phase 2 note at line 570).

  2. intent_clf_v1.0.pkl
     Classifies agent/manager chat messages into 8 intent categories
     matching ChatIntent labels in backend/app/models/chat_history.py:
       order_status | earnings_query | area_risk | reassign_suggestion |
       weather_query | agent_performance | postpone_query | general

Both use TfidfVectorizer(ngram_range=(1,2)) + LogisticRegression(balanced).

KNOWN LIMITATION (stated explicitly, consistent with A5 precedent):
  Both datasets are generated from per-category sentence templates with
  lexical substitution. Within each category, word choice is deliberately
  distinct (weather words, customer words, traffic words, etc.), so the
  categories are largely separable by vocabulary by construction. High
  validation accuracy reflects template-consistency, not robustness to
  genuinely novel phrasing. A model evaluated on its own synthetic
  generator always looks better than it would on real user text.
  See docs/progress.md Known Issues.

Datasets saved to:  ml/data/raw/failure_reasons.csv
                    ml/data/raw/chat_intents.csv
Models saved to:    ml/models/failure_reason_clf_v1.0.pkl
                    ml/models/intent_clf_v1.0.pkl
MLflow tracking:    ml/mlruns/
"""

import csv
from collections import Counter
from pathlib import Path

import joblib
import mlflow
import mlflow.sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

# ── Paths ──────────────────────────────────────────────────────────────────────

ROOT      = Path(__file__).parent.parent.parent.parent
DATA_DIR  = ROOT / "ml" / "data" / "raw"
MODELS_DIR = ROOT / "ml" / "models"
MLRUNS_DIR = ROOT / "ml" / "mlruns"

# ── Utility ────────────────────────────────────────────────────────────────────

def _expand(templates: list[str], replacements: list[dict], label: str) -> list[tuple[str, str]]:
    """
    Cross-product each template string with each replacement dict.
    Returns (text, label) pairs.  KeyError if a template key is absent from rep.
    """
    rows = []
    for tpl in templates:
        for rep in replacements:
            rows.append((tpl.format(**rep), label))
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# DATASET 1 — Failure Reason Classifier
# 4 categories × 15 templates × 9 replacement dicts = 540 rows
# ══════════════════════════════════════════════════════════════════════════════

def _failure_reason_data() -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []

    # ── weather ───────────────────────────────────────────────────────────────
    w_templates = [
        "Heavy {event} made delivery impossible today",
        "Could not deliver due to {event} in the area",
        "{event} flooded the roads near the delivery address",
        "Delivery cancelled because of {event} conditions",
        "Roads were {condition} due to {event}",
        "Extreme {event} prevented reaching the customer",
        "Delivery suspended as {event} damaged the route",
        "{event} caused severe visibility problems on the way",
        "The area experienced {event} and delivery was halted",
        "Weather was too {condition} for safe delivery",
        "Customer area inaccessible due to {event}",
        "Forced to turn back because {event} blocked the path",
        "{event} warning issued and delivery postponed",
        "Unable to deliver due to {condition} weather conditions all day",
        "Storm level {event} hit the route midway",
    ]
    w_reps = [
        {"event": "rain",          "condition": "flooded"},
        {"event": "rainfall",      "condition": "slippery"},
        {"event": "storm",         "condition": "dangerous"},
        {"event": "flooding",      "condition": "waterlogged"},
        {"event": "cyclone",       "condition": "hazardous"},
        {"event": "heavy downpour","condition": "wet"},
        {"event": "thunderstorm",  "condition": "unsafe"},
        {"event": "monsoon rain",  "condition": "flooded"},
        {"event": "flash flood",   "condition": "submerged"},
    ]
    rows.extend(_expand(w_templates, w_reps, "weather"))

    # ── customer ──────────────────────────────────────────────────────────────
    c_templates = [
        "Customer was {state} at the time of delivery",
        "{recipient} did not answer the door",
        "Nobody was {state} at the delivery address",
        "Customer {action} the package upon arrival",
        "{recipient} was absent and could not collect",
        "Attempted delivery but customer was {state}",
        "Customer {action} to accept the order",
        "Delivery failed because {recipient} was not reachable",
        "{recipient} requested delay but then {action}",
        "Customer was {state} when we arrived with the package",
        "No one {state} at the given address",
        "Package undelivered as customer {action} it",
        "{recipient} was busy and {action} to receive delivery",
        "Could not handover since {recipient} was {state}",
        "Third delivery attempt also failed as customer was {state}",
    ]
    c_reps = [
        {"state": "not available",     "recipient": "Customer",       "action": "refused"},
        {"state": "absent",            "recipient": "Recipient",      "action": "was not there"},
        {"state": "unavailable",       "recipient": "Nobody",         "action": "did not answer"},
        {"state": "not home",          "recipient": "Customer",       "action": "cancelled"},
        {"state": "out of town",       "recipient": "Resident",       "action": "declined"},
        {"state": "not reachable",     "recipient": "Contact person", "action": "refused"},
        {"state": "away",              "recipient": "Customer",       "action": "did not pick up"},
        {"state": "asleep",            "recipient": "Customer",       "action": "did not respond"},
        {"state": "unavailable all day","recipient": "Recipient",     "action": "was unreachable"},
    ]
    rows.extend(_expand(c_templates, c_reps, "customer"))

    # ── traffic ───────────────────────────────────────────────────────────────
    t_templates = [
        "Massive {event} on the main road delayed delivery",
        "Road {condition} due to {event} and had to take detour",
        "Heavy {event} near the delivery area",
        "Could not reach customer because {event} blocked the route",
        "{event} on the highway caused major delay",
        "Roads {condition} because of {event} ahead",
        "Delivery delayed due to {event} near customer area",
        "Agent stuck in {event} for over two hours",
        "Route {condition} after {event}",
        "{event} near the junction prevented entry",
        "Delivery time exceeded because of {event}",
        "The usual route was {condition} due to {event}",
        "Could not bypass {event} and took too long",
        "Severe {event} made the road impassable",
        "Delivery skipped as {event} blocked all access roads",
    ]
    t_reps = [
        {"event": "traffic jam",       "condition": "blocked"},
        {"event": "road blockage",     "condition": "closed"},
        {"event": "accident",          "condition": "congested"},
        {"event": "construction work", "condition": "narrowed"},
        {"event": "road closure",      "condition": "shut"},
        {"event": "police barricade",  "condition": "restricted"},
        {"event": "bridge collapse",   "condition": "closed"},
        {"event": "VIP convoy",        "condition": "blocked"},
        {"event": "traffic congestion","condition": "jammed"},
    ]
    rows.extend(_expand(t_templates, t_reps, "traffic"))

    # ── other ─────────────────────────────────────────────────────────────────
    o_templates = [
        "Address {issue} and could not locate the destination",
        "Delivery failed due to {issue} at the pickup point",
        "Package {issue} and delivery could not proceed",
        "Could not find the building because {issue}",
        "Incorrect {info} provided in the order",
        "Access to the building was {issue}",
        "Order {issue} before dispatch was complete",
        "{issue} prevented completion of delivery",
        "Delivery vehicle had {issue} on the way",
        "Could not reach customer due to {issue}",
        "Dispatch error with {issue} in the system",
        "Delivery {issue} after agent left the hub",
        "Technical {issue} delayed the route assignment",
        "Customer address had {issue}",
        "Order cancelled due to {issue} at warehouse",
    ]
    o_reps = [
        {"issue": "not found",                   "info": "address"},
        {"issue": "was locked with no entry",    "info": "phone number"},
        {"issue": "was damaged in transit",      "info": "pin code"},
        {"issue": "had wrong pin code",          "info": "landmark"},
        {"issue": "moved to new location",       "info": "address details"},
        {"issue": "was cancelled by management", "info": "contact"},
        {"issue": "vehicle breakdown",           "info": "address"},
        {"issue": "system error",                "info": "order details"},
        {"issue": "was incomplete",              "info": "address"},
    ]
    rows.extend(_expand(o_templates, o_reps, "other"))

    return rows


# ══════════════════════════════════════════════════════════════════════════════
# DATASET 2 — Chat Intent Classifier
#
# Intent categories match ChatIntent in backend/app/models/chat_history.py.
# Sizes: order_status(120) + earnings_query(90) + area_risk(90) +
#        reassign_suggestion(75) + weather_query(90) + agent_performance(90) +
#        postpone_query(75) + general(75) = 705 rows
#
# Category rationale:
#   order_status         — agent/manager asks about a specific order
#   earnings_query       — agent asks about own pay; manager about team payout
#   area_risk            — manager checks which areas are failing/risky
#   reassign_suggestion  — manager wants to redistribute orders across agents
#   weather_query        — either role asks about weather impact on deliveries
#   agent_performance    — manager reviews individual or team metrics
#   postpone_query       — either role asks which orders to defer/reschedule
#   general              — greetings, capability questions, off-topic chat
#
# Note: weather_query and postpone_query share vocabulary (rain, flood) but
# differ in framing: weather_query asks "what is the weather?" while
# postpone_query asks "which orders should I delay?". The model must rely on
# action verbs (postpone, delay, defer, reschedule) to distinguish them.
# Ambiguous phrasing like "should I delay due to rain?" could plausibly fit
# either. This limitation is documented in docs/progress.md Known Issues.
# ══════════════════════════════════════════════════════════════════════════════

def _chat_intent_data() -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []

    # ── order_status (15 × 8 = 120) ──────────────────────────────────────────
    os_t = [
        "What is the status of {ref}?",
        "Where is {ref} right now?",
        "Has {ref} been delivered yet?",
        "Can you check on {ref} for me?",
        "Is {ref} still pending or delivered?",
        "Track {ref} please",
        "Give me an update on {ref}",
        "What happened with {ref}?",
        "Any news on the delivery of {ref}?",
        "Show me the latest status for {ref}",
        "Was {ref} successfully delivered?",
        "I need to know if {ref} is delivered",
        "Delivery status of {ref}",
        "Where does {ref} stand currently?",
        "Is {ref} out for delivery or completed?",
    ]
    os_r = [
        {"ref": "order #124"},         {"ref": "order #256"},
        {"ref": "my last order"},      {"ref": "the pending order"},
        {"ref": "#789"},               {"ref": "order number 42"},
        {"ref": "the Velachery order"},{"ref": "today's first order"},
    ]
    rows.extend(_expand(os_t, os_r, "order_status"))

    # ── earnings_query (15 × 6 = 90) ─────────────────────────────────────────
    eq_t = [
        "How much will I earn {period}?",
        "What are my total earnings for {period}?",
        "Show me my commission for {period}",
        "How much have I made {period}?",
        "What is my pay for {period}?",
        "Earnings breakdown for {period}",
        "Tell me my income for {period}",
        "How much did the team earn {period}?",
        "What is the total payout for {period}?",
        "My earnings summary for {period}",
        "How many rupees did I make {period}?",
        "What is my delivery commission {period}?",
        "Show earnings report for {period}",
        "How much profit from deliveries {period}?",
        "Agent earnings for {period}",
    ]
    eq_r = [
        {"period": "today"},    {"period": "this week"},
        {"period": "this month"},{"period": "yesterday"},
        {"period": "last week"},{"period": "so far today"},
    ]
    rows.extend(_expand(eq_t, eq_r, "earnings_query"))

    # ── area_risk (15 × 6 = 90) ───────────────────────────────────────────────
    ar_t = [
        "Which area has the most {issue}?",
        "What is the failure rate in {area}?",
        "Is {area} a high risk area {time}?",
        "How is {area} performing {time}?",
        "Show me the risk level for {area}",
        "Which zones have {issue} above average?",
        "Risk report for {area}",
        "What are the failure hotspots {time}?",
        "Why is {area} showing high failure rates?",
        "Compare failure rates across areas {time}",
        "List the most problematic delivery zones",
        "Which area should I be worried about?",
        "Area performance breakdown for {area}",
        "Show the delivery success rate in {area}",
        "Which area needs attention due to {issue}?",
    ]
    ar_r = [
        {"area": "Velachery",   "issue": "failures",       "time": "today"},
        {"area": "Adyar",       "issue": "delivery issues", "time": "this week"},
        {"area": "T Nagar",     "issue": "failed orders",  "time": "right now"},
        {"area": "Porur",       "issue": "delays",         "time": "this morning"},
        {"area": "Anna Nagar",  "issue": "no-go decisions","time": "lately"},
        {"area": "all areas",   "issue": "problems",       "time": "today"},
    ]
    rows.extend(_expand(ar_t, ar_r, "area_risk"))

    # ── reassign_suggestion (15 × 5 = 75) ────────────────────────────────────
    rs_t = [
        "Suggest {scope} reassignment",
        "Which orders should be reassigned?",
        "Can you recommend redistributing {scope}?",
        "Who should take over the {area} deliveries?",
        "Reassign {scope} to less loaded agents",
        "Which agent can handle more orders {time}?",
        "Help me redistribute the {scope}",
        "Recommend order reassignments for {area}",
        "Which deliveries need a new agent {time}?",
        "Suggest better routing and assignment for {scope}",
        "Agent workload is uneven so suggest {scope} changes",
        "Move some orders to free agents",
        "Help rebalance {scope} across the team",
        "Which orders should I move to another agent?",
        "Auto suggest reassignment for overloaded routes",
    ]
    rs_r = [
        {"scope": "pending order", "area": "Velachery",  "time": "today"},
        {"scope": "the workload",  "area": "Adyar",      "time": "this afternoon"},
        {"scope": "delivery",      "area": "T Nagar",    "time": "now"},
        {"scope": "order",         "area": "all areas",  "time": "this morning"},
        {"scope": "route",         "area": "Porur",      "time": "evening"},
    ]
    rows.extend(_expand(rs_t, rs_r, "reassign_suggestion"))

    # ── weather_query (15 × 6 = 90) ──────────────────────────────────────────
    wq_t = [
        "What is the weather {condition} in {area}?",
        "Is it raining in {area} {time}?",
        "How is the weather affecting deliveries in {area}?",
        "Weather conditions for {area} {time}",
        "What is the {condition} forecast for {area}?",
        "Is {area} affected by {condition} {time}?",
        "Rain impact on {area} deliveries {time}",
        "Weather update for {area}",
        "Is the weather dangerous for agents in {area}?",
        "How bad is the {condition} in {area}?",
        "Will {condition} affect deliveries {time}?",
        "Check weather for {area} {time}",
        "Storm alert for {area}?",
        "Weather risk level for {area}",
        "Is the {condition} expected to clear up {time}?",
    ]
    wq_r = [
        {"condition": "rain",             "area": "Adyar",     "time": "today"},
        {"condition": "weather situation","area": "Velachery", "time": "this evening"},
        {"condition": "storm",            "area": "Chennai",   "time": "this morning"},
        {"condition": "flooding",         "area": "T Nagar",   "time": "right now"},
        {"condition": "monsoon",          "area": "all areas", "time": "this week"},
        {"condition": "weather",          "area": "Porur",     "time": "afternoon"},
    ]
    rows.extend(_expand(wq_t, wq_r, "weather_query"))

    # ── agent_performance (15 × 6 = 90) ──────────────────────────────────────
    ap_t = [
        "How is {agent} performing {period}?",
        "What is {agent}'s success rate {period}?",
        "Who are the top performing agents {period}?",
        "Which agent has the most deliveries {period}?",
        "Show me {agent}'s delivery stats",
        "How many orders did {agent} complete {period}?",
        "Agent performance report for {period}",
        "Who is underperforming {period}?",
        "What is the team average delivery success rate?",
        "Compare agent performance for {period}",
        "How is the team doing overall {period}?",
        "Which agents need support or training?",
        "Show {agent}'s NO-GO rate",
        "List agents by success rate {period}",
        "Performance breakdown for {agent}",
    ]
    ap_r = [
        {"agent": "Ravi",          "period": "this week"},
        {"agent": "agent 3",       "period": "today"},
        {"agent": "the team",      "period": "this month"},
        {"agent": "all agents",    "period": "yesterday"},
        {"agent": "Kumar",         "period": "last week"},
        {"agent": "the top agent", "period": "this quarter"},
    ]
    rows.extend(_expand(ap_t, ap_r, "agent_performance"))

    # ── postpone_query (15 × 5 = 75) ─────────────────────────────────────────
    pq_t = [
        "Which orders should be postponed {reason}?",
        "Should I delay any deliveries {reason}?",
        "What should I reschedule for tomorrow?",
        "Which orders are not safe to deliver {reason}?",
        "Suggest postponements {reason}",
        "Can you list orders to defer {reason}?",
        "Recommend deferral of risky orders {reason}",
        "Which deliveries should wait until {time}?",
        "Is it better to postpone {area} orders {reason}?",
        "Help me decide what to hold back {reason}",
        "Which NO-GO orders need rescheduling?",
        "What should I put off {reason}?",
        "List all orders that should be deferred",
        "Should today's orders be postponed {reason}?",
        "What is safe to deliver versus what to postpone?",
    ]
    pq_r = [
        {"reason": "due to rain",        "area": "Velachery", "time": "tomorrow morning"},
        {"reason": "because of flooding","area": "Adyar",     "time": "next slot"},
        {"reason": "due to traffic",     "area": "T Nagar",   "time": "evening"},
        {"reason": "given the weather",  "area": "all areas", "time": "later today"},
        {"reason": "for safety",         "area": "risky zones","time": "a better time"},
    ]
    rows.extend(_expand(pq_t, pq_r, "postpone_query"))

    # ── general (75 standalone examples — greetings, capability qs, off-topic) ─
    general_examples = [
        "Hello I need some help",
        "Good morning",
        "Hi there",
        "What can you do?",
        "What features do you have?",
        "Can you help me?",
        "Thanks for the info",
        "Thank you",
        "That was useful",
        "Okay got it",
        "I understand",
        "How does this work?",
        "Tell me something interesting",
        "I am not sure what to ask",
        "What should I focus on today?",
        "Give me a summary of everything",
        "I just wanted to check in",
        "Is anyone there?",
        "Show me something helpful",
        "What is LastMeter AI?",
        "Can you explain how the system works?",
        "What is the purpose of this chat?",
        "Can you do calculations?",
        "I need to think about this",
        "Let me get back to you",
        "Nothing in particular",
        "Tell me a joke",
        "What day is it?",
        "Remind me later",
        "Good evening",
        "Good afternoon",
        "Goodbye",
        "See you later",
        "Have a great day",
        "I am done for now",
        "Signing off",
        "One more thing",
        "Actually never mind",
        "Just checking",
        "Okay thanks",
        "Perfect",
        "Sounds good",
        "Can you repeat that?",
        "I did not understand",
        "Explain again please",
        "Make it simpler",
        "Give a short answer",
        "I need help with something",
        "Not sure what is happening",
        "Everything seems fine",
        "Nothing urgent",
        "Just curious",
        "Interesting",
        "Good to know",
        "Amazing",
        "Got it thanks",
        "Noted",
        "Will do",
        "Understood",
        "No issues",
        "All clear",
        "Looks good",
        "Keep going",
        "What else can you tell me?",
        "Anything new?",
        "Update me",
        "I am back",
        "Still here",
        "Let me know",
        "Please continue",
        "Can you explain what this number means?",
        "I am confused",
        "What is this metric?",
        "What do these results mean?",
        "I am not a tech person",
        "Simple language please",
        "This is helpful thanks",
    ]
    rows.extend([(text, "general") for text in general_examples])

    return rows


# ══════════════════════════════════════════════════════════════════════════════
# TRAINING
# ══════════════════════════════════════════════════════════════════════════════

def _train_and_save(
    rows: list[tuple[str, str]],
    labels: list[str],
    artifact_path: Path,
    experiment_name: str,
    run_name: str,
    version: str = "v1.0",
) -> dict:
    """
    80/20 stratified split → TF-IDF + LR → evaluate → MLflow → save pkl.
    Returns result dict with run_id, metrics, and the fitted pipeline.
    """
    texts = [r[0] for r in rows]
    cats  = [r[1] for r in rows]

    X_train, X_val, y_train, y_val = train_test_split(
        texts, cats, test_size=0.20, random_state=42, stratify=cats,
    )

    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
        ("clf",   LogisticRegression(C=1.0, max_iter=1000, random_state=42,
                                     class_weight="balanced")),
    ])
    pipe.fit(X_train, y_train)
    y_pred = pipe.predict(X_val)

    acc       = accuracy_score(y_val, y_pred)
    report    = classification_report(y_val, y_pred, labels=labels, output_dict=True,
                                      zero_division=0)
    report_txt= classification_report(y_val, y_pred, labels=labels, zero_division=0)

    majority_class = Counter(y_train).most_common(1)[0][0]
    baseline_acc   = sum(1 for y in y_val if y == majority_class) / len(y_val)

    print(f"\n{'='*62}")
    print(f"  {experiment_name}")
    print(f"{'='*62}")
    print(f"  Rows: {len(rows)}  |  Train: {len(X_train)}  |  Val: {len(X_val)}")
    print(f"\n  Val accuracy      : {acc:.4f} ({acc*100:.2f}%)")
    print(f"  Baseline ('{majority_class}'): {baseline_acc:.4f} ({baseline_acc*100:.2f}%)")
    print(f"  Gap over baseline : +{(acc-baseline_acc)*100:.2f}pp")
    print(f"\n  Per-class report:\n{report_txt}")

    # MLflow
    mlflow.set_tracking_uri(str(MLRUNS_DIR))
    mlflow.set_experiment(experiment_name)
    with mlflow.start_run(run_name=run_name) as run:
        mlflow.log_params({
            "model_type":   "TF-IDF + LogisticRegression",
            "ngram_range":  "(1, 2)",
            "sublinear_tf": True,
            "class_weight": "balanced",
            "C":            1.0,
            "max_iter":     1000,
            "n_train":      len(X_train),
            "n_val":        len(X_val),
            "n_labels":     len(labels),
            "version":      version,
        })
        mlflow.log_metric("val_accuracy",            round(acc, 4))
        mlflow.log_metric("majority_baseline_acc",   round(baseline_acc, 4))
        mlflow.log_metric("accuracy_over_baseline",  round(acc - baseline_acc, 4))
        mlflow.log_metric("macro_precision", round(report["macro avg"]["precision"], 4))
        mlflow.log_metric("macro_recall",    round(report["macro avg"]["recall"], 4))
        mlflow.log_metric("macro_f1",        round(report["macro avg"]["f1-score"], 4))
        for label in labels:
            if label in report:
                r = report[label]
                mlflow.log_metric(f"precision_{label}", round(r["precision"], 4))
                mlflow.log_metric(f"recall_{label}",    round(r["recall"], 4))
                mlflow.log_metric(f"f1_{label}",        round(r["f1-score"], 4))
        mlflow.sklearn.log_model(pipe, "model")
        run_id = run.info.run_id

    pipe.version = version
    joblib.dump(pipe, artifact_path)
    print(f"  Saved: {artifact_path} ({artifact_path.stat().st_size:,} bytes)")
    print(f"  MLflow run_id: {run_id}")

    return {
        "run_id":         run_id,
        "acc":            acc,
        "baseline_acc":   baseline_acc,
        "majority_class": majority_class,
        "report":         report,
        "n_train":        len(X_train),
        "n_val":          len(X_val),
        "pipe":           pipe,
    }


# ══════════════════════════════════════════════════════════════════════════════
# HAND-WRITTEN TEST SENTENCES
# Not generated from templates — written independently to probe robustness.
# ══════════════════════════════════════════════════════════════════════════════

_FR_HAND_TESTS = [
    ("Could not make it to the address, the entire street was submerged", "weather"),
    ("Tried three times but nobody would open the gate",                  "customer"),
    ("Got stuck behind a procession on the main street for over an hour", "traffic"),
    ("Wrong flat number on the order, went to third floor instead of fifth","other"),
    ("Incessant drizzle made the roads slippery throughout the journey",  "weather"),
]

_CI_HAND_TESTS = [
    ("What is the situation in T Nagar this morning?",                    "area_risk"),
    ("Can you move some of Ravi's orders to the other agents?",           "reassign_suggestion"),
    ("My total earnings so far this month?",                              "earnings_query"),
    ("Should we hold off deliveries in flood prone areas for now?",       "postpone_query"),
    ("How is Kumar doing compared to last week?",                         "agent_performance"),
]


def _hand_test(pipe: Pipeline, test_sentences: list[tuple[str, str]], label: str) -> None:
    print(f"\n  Hand-written test sentences — {label}:")
    for text, expected in test_sentences:
        predicted = pipe.predict([text])[0]
        probs     = pipe.predict_proba([text])[0]
        conf      = round(max(probs), 3)
        mark      = "PASS" if predicted == expected else "FAIL"
        print(f"    [{mark}] predicted={predicted:<22s} conf={conf:.3f} expected={expected}")
        print(f"           text: \"{text}\"")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main() -> tuple[dict, dict]:
    # ── 1. Failure-reason classifier ─────────────────────────────────────────
    fr_rows = _failure_reason_data()
    fr_csv  = DATA_DIR / "failure_reasons.csv"
    with open(fr_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "category"])
        writer.writerows(fr_rows)
    print(f"Wrote {len(fr_rows)} rows → {fr_csv}")

    FR_LABELS = ["weather", "customer", "traffic", "other"]
    fr_result = _train_and_save(
        fr_rows,
        FR_LABELS,
        MODELS_DIR / "failure_reason_clf_v1.0.pkl",
        "failure_reason_classifier",
        "failure_reason_clf_v1.0",
    )
    _hand_test(fr_result["pipe"], _FR_HAND_TESTS, "failure reasons")

    # ── 2. Chat intent classifier ─────────────────────────────────────────────
    ci_rows = _chat_intent_data()
    ci_csv  = DATA_DIR / "chat_intents.csv"
    with open(ci_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "intent"])
        writer.writerows(ci_rows)
    print(f"\nWrote {len(ci_rows)} rows → {ci_csv}")

    INTENT_LABELS = [
        "order_status", "earnings_query", "area_risk", "reassign_suggestion",
        "weather_query", "agent_performance", "postpone_query", "general",
    ]
    ci_result = _train_and_save(
        ci_rows,
        INTENT_LABELS,
        MODELS_DIR / "intent_clf_v1.0.pkl",
        "chat_intent_classifier",
        "intent_clf_v1.0",
    )
    _hand_test(ci_result["pipe"], _CI_HAND_TESTS, "chat intents")

    return fr_result, ci_result


if __name__ == "__main__":
    main()
