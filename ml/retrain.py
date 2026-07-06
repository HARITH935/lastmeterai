#!/usr/bin/env python3
"""
retrain.py — one-command model retraining + hot-swap for LastMeter AI.

Retrains all three model families in sequence and copies the new artifacts
into ml/models/ so the Flask backend picks them up on next request
(no server restart needed — models are lazy-loaded per-process).

Usage:
    cd ml
    python retrain.py              # retrain all models
    python retrain.py --gonogo     # retrain only GO/NO-GO classifier
    python retrain.py --nlp        # retrain only NLP classifiers
    python retrain.py --area       # retrain only area/time regressor
    python retrain.py --dry-run    # validate data + env, skip training

After retraining, restart the Render service (or redeploy) so the new
.pkl files are picked up by all worker processes.
"""

from __future__ import annotations

import argparse
import importlib
import sys
import time
from pathlib import Path

ML_ROOT = Path(__file__).parent
sys.path.insert(0, str(ML_ROOT))

MODELS_DIR = ML_ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)

MODEL_FILES = {
    "gonogo": [
        "lr_gonogo_v1.0.pkl",
        "rf_gonogo_v1.0.pkl",
        "gonogo_model.pkl",
    ],
    "nlp": [
        "failure_reason_clf_v1.0.pkl",
        "intent_clf_v1.0.pkl",
    ],
    "area": [
        "rf_area_time_v1.0.pkl",
    ],
}


def _check_deps() -> bool:
    missing = []
    for pkg in ("sklearn", "joblib", "numpy", "pandas", "mlflow"):
        try:
            importlib.import_module(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"  ERROR: missing packages: {', '.join(missing)}")
        print("  Run: pip install -r requirements.txt")
        return False
    return True


def _check_data() -> bool:
    raw = ML_ROOT / "data" / "raw"
    required = [
        "synthetic_orders.csv",
        "synthetic_orders_val.csv",
        "failure_reasons.csv",
        "chat_intents.csv",
    ]
    missing = [f for f in required if not (raw / f).exists()]
    if missing:
        print(f"  ERROR: missing data files in ml/data/raw/: {', '.join(missing)}")
        print("  Run: python data/generate_dataset.py")
        return False
    return True


def _print_model_sizes() -> None:
    print("\n  Current model sizes:")
    for name, files in MODEL_FILES.items():
        for f in files:
            p = MODELS_DIR / f
            if p.exists():
                print(f"    {f:<40} {p.stat().st_size / 1024:>8.1f} KB")
            else:
                print(f"    {f:<40}   MISSING")


def run_gonogo() -> bool:
    print("\n" + "=" * 64)
    print("  [1/3] GO/NO-GO Classifier")
    print("=" * 64)
    t0 = time.time()
    try:
        from src.training.train_gonogo import main as train_gonogo
        train_gonogo()
        print(f"\n  GO/NO-GO done in {time.time() - t0:.1f}s")
        return True
    except Exception as exc:
        print(f"\n  ERROR in GO/NO-GO training: {exc}")
        return False


def run_nlp() -> bool:
    print("\n" + "=" * 64)
    print("  [2/3] NLP Classifiers (failure reasons + chat intents)")
    print("=" * 64)
    t0 = time.time()
    try:
        from src.training.train_nlp import main as train_nlp
        train_nlp()
        print(f"\n  NLP done in {time.time() - t0:.1f}s")
        return True
    except Exception as exc:
        print(f"\n  ERROR in NLP training: {exc}")
        return False


def run_area() -> bool:
    print("\n" + "=" * 64)
    print("  [3/3] Area/Time Failure Rate Regressor")
    print("=" * 64)
    t0 = time.time()
    try:
        from src.training.train_area_model import train as train_area
        train_area()
        print(f"\n  Area model done in {time.time() - t0:.1f}s")
        return True
    except Exception as exc:
        print(f"\n  ERROR in area model training: {exc}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Retrain LastMeter AI models")
    parser.add_argument("--gonogo",  action="store_true", help="Retrain GO/NO-GO only")
    parser.add_argument("--nlp",     action="store_true", help="Retrain NLP classifiers only")
    parser.add_argument("--area",    action="store_true", help="Retrain area/time model only")
    parser.add_argument("--dry-run", action="store_true", help="Validate env and data, skip training")
    args = parser.parse_args()

    all_models = not any([args.gonogo, args.nlp, args.area])

    print("\n  LastMeter AI — Model Retraining")
    print("  " + "─" * 40)

    ok = _check_deps()
    if not ok:
        sys.exit(1)
    print("  Dependencies: OK")

    ok = _check_data()
    if not ok:
        sys.exit(1)
    print("  Data files:   OK")

    if args.dry_run:
        _print_model_sizes()
        print("\n  Dry run complete — no models retrained.\n")
        return

    _print_model_sizes()

    t_start = time.time()
    results: dict[str, bool] = {}

    if all_models or args.gonogo:
        results["gonogo"] = run_gonogo()

    if all_models or args.nlp:
        results["nlp"] = run_nlp()

    if all_models or args.area:
        results["area"] = run_area()

    print("\n" + "=" * 64)
    print("  SUMMARY")
    print("─" * 64)
    for name, ok in results.items():
        status = "OK" if ok else "FAILED"
        print(f"  {name:<10} {status}")
    print(f"\n  Total time: {time.time() - t_start:.1f}s")

    _print_model_sizes()

    if all(results.values()):
        print("\n  All models retrained successfully.")
        print("  Deploy or restart the Render service to activate new models.\n")
    else:
        print("\n  Some models failed. Check errors above.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
