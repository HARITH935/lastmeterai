# LastMeter AI — Backend Dev Commands
# Run all targets from the backend/ directory.

.PHONY: help install dev seed db-init db-migrate db-upgrade db-downgrade db-reset test lint

FLASK_APP = manage:app
FLASK     = flask --app $(FLASK_APP)

help:
	@echo ""
	@echo "LastMeter AI Backend"
	@echo "────────────────────────────────────────────"
	@echo "  make install        Install Python dependencies"
	@echo "  make dev            Start development server (hot-reload)"
	@echo "  make seed           Drop + recreate DB + populate seed data"
	@echo ""
	@echo "  make db-init        Initialise Flask-Migrate (first time only)"
	@echo "  make db-migrate     Auto-generate migration from model changes"
	@echo "  make db-upgrade     Apply pending migrations to DB"
	@echo "  make db-downgrade   Roll back the last migration"
	@echo "  make db-reset       Drop all tables + re-run all migrations"
	@echo ""
	@echo "  make test           Run pytest"
	@echo "  make lint           Run flake8"
	@echo ""

# ── Setup ──────────────────────────────────────────────────────────────────────

install:
	pip install -r requirements.txt

# ── Dev server ────────────────────────────────────────────────────────────────

dev:
	FLASK_ENV=development python run.py

# ── Seed ──────────────────────────────────────────────────────────────────────
# seed: safe to run anytime — skips if the DB already has data.
# reseed: forces a full drop + reset back to the demo dataset.

seed:
	python seed.py

reseed:
	python seed.py --force

# ── Migrations ────────────────────────────────────────────────────────────────

db-init:
	$(FLASK) db init

db-migrate:
	$(FLASK) db migrate -m "$(MSG)"

db-upgrade:
	$(FLASK) db upgrade

db-downgrade:
	$(FLASK) db downgrade

# Drop all tables, then replay all migrations from scratch.
db-reset:
	$(FLASK) db downgrade base
	$(FLASK) db upgrade

# ── Tests ─────────────────────────────────────────────────────────────────────

test:
	pytest tests/ -v

# ── Lint ──────────────────────────────────────────────────────────────────────

lint:
	flake8 app/ --max-line-length=100 --ignore=E203,W503
