# Phase 0 — environment & baseline (completion checklist)

Phase 0 means: **local Postgres + MIMIC demo**, **Python env + notebook SQL**, **repo layout + secrets wiring**, and **optional cloud accounts**. Implementation work (models, full UI, production narrative) starts in Phase 1+.

## Required (hackathon baseline)

| # | Item | How to verify |
|---|------|----------------|
| 1 | **Docker Desktop** running; Compose available | `docker compose version` |
| 2 | **MIMIC-IV demo loaded** | `bash scripts/setup_mimic_demo.sh` finishes with `validate_demo.sql` → **PASSED** for all tables |
| 3 | **`.env` present** | `cp .env.example .env` — never commit `.env` |
| 4 | **`DATABASE_URL`** | Matches docker-compose host port (**5433** by default): `postgresql+psycopg://mimic:mimic@127.0.0.1:5433/mimiciv` |
| 5 | **Python venv + deps** | `python3 -m venv .venv && source .venv/bin/activate && pip install -r python/requirements.txt` |
| 6 | **Jupyter kernel (recommended)** | `python -m ipykernel install --user --name patientscope --display-name "Python (PatientScope)"` — select that kernel in the notebook |
| 7 | **Notebook smoke test** | Open `notebooks/mimic_sql_smoke.ipynb`, run cells through `%sql` → patient count query succeeds |
| 8 | **Baseline SQL runs** | In `psql` or notebook: run `sql/cohort_icu_baseline.sql` and `sql/outcomes_readmission_mimic_demo.sql` without error |

## Deferred / optional (does not block Phase 0)

| Item | Notes |
|------|--------|
| **Anthropic API live call** | `python scripts/hello_claude.py` needs **billing/credits** on the key. Deferred until you top up [Plans & billing](https://console.anthropic.com/). |
| **MongoDB Atlas** | Add `MONGODB_URI` when you wire persistence; optional for SQL-only work. |
| **Vultr** | Only if you deploy infra during the event. |

## One-command sanity check (local)

From repo root, with venv activated:

```bash
python scripts/verify_phase0.py
```

With Postgres running:

```bash
python scripts/verify_phase0.py --db
```

## Repo layout (Phase 0 target)

- `sql/` — cohort + outcome queries  
- `models/` — training (populated in later phases)  
- `backend/` — FastAPI  
- `frontend/` — UI shell  
- `data/` — MIMIC demo (**gitignored**)  
- `notebooks/` — exploration  
- `docs/` — methodology + this checklist  
- `scripts/` — setup, download, smoke tests  

## Common issues

- **`FATAL: role "mimic" does not exist` from host, but `docker compose exec postgres psql -U mimic` works** — something **else** on your Mac is listening on the host port you put in `DATABASE_URL`. The compose file maps Postgres to **5433** so host **5432** (often Homebrew/Postgres.app) does not collide. Put **`...@127.0.0.1:5433/mimiciv`** in `.env`, run `docker compose up -d postgres`, retry `verify_phase0.py --db`.
- **`No module named 'psycopg'`** — install deps in the **same** environment as the Jupyter kernel, or use `postgresql+psycopg2://` + `psycopg2-binary`.  
- **SSL error downloading demo** — `pip install certifi`; script uses certifi when available.  
- **`KeyError: 'DEFAULT'` when using `%sql`** — `ipython-sql` expects PrettyTable **v2** style constants; pin with `pip install 'prettytable>=2.5,<3'` (already in `python/requirements.txt`).  

When rows 1–8 are satisfied, **Phase 0 is complete** for implementation purposes; treat Anthropic/Mongo/Vultr as follow-ups.
