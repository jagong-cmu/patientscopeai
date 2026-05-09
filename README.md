# PatientScope / MimicScope

**MimicScope** — hackathon project for transparent ICU **discharge readiness** + multi-definition **readmission risk** on MIMIC-style data (see `docs/mimicscope_problem_statement.md`). This repo (`PatientScope`) holds code, SQL, notebooks, and integrations (Anthropic, MongoDB Atlas, Vultr).

## Repo layout

| Path | Purpose |
|------|---------|
| `sql/` | Cohort + feature SQL |
| `models/` | Training code + saved artifacts (large files stay untracked) |
| `backend/` | FastAPI app (package name `backend` — avoids Vercel’s reserved root `api/` folder) |
| `frontend/` | Vite + React dashboard (census, assessment, methodology) |
| `data/` | MIMIC demo + derived tables (**gitignored**) |
| `notebooks/` | Exploration |
| `docs/` | Cohort notes |
| `scripts/` | DB setup, Claude smoke test, downloads |

## Prerequisites accounts (do ahead of time)

- **Anthropic**: API key from [console.anthropic.com](https://console.anthropic.com/)
- **MongoDB Atlas**: free tier cluster + connection string (`MONGODB_URI`)
- **Vultr**: account ready if you deploy VMs/object storage during the event

Copy `.env.example` → `.env` and fill secrets.

## Phase 0 (environment) — done?

Use **[`docs/phase_0_checklist.md`](docs/phase_0_checklist.md)** as the source of truth: Docker + MIMIC demo, `.venv` + `python/requirements.txt`, Jupyter kernel, notebook smoke test, baseline SQL.

Quick verify (after activating `.venv`):

```bash
python scripts/verify_phase0.py          # imports + .env + DATABASE_URL
python scripts/verify_phase0.py --db     # also ping Postgres (container must be up)
```

**Anthropic credits** and **Atlas/Vultr** can be deferred; they do not block closing Phase 0 for local MIMIC work.

## MIMIC-IV demo in PostgreSQL

Requires **Docker** with Compose.

```bash
chmod +x scripts/setup_mimic_demo.sh
bash scripts/setup_mimic_demo.sh
```

This downloads the open [MIMIC-IV demo v2.2](https://physionet.org/content/mimic-iv-demo) into `./data/` (gitignored), applies MIT-LCP [`mimic-code`](https://github.com/MIT-LCP/mimic-code) Postgres build scripts (`create` → `load_gz` → `constraint` → `index`), and runs `validate_demo.sql`.

Connect:

```bash
psql postgresql://mimic:mimic@127.0.0.1:5433/mimiciv
```

If another Postgres on your Mac already uses **5432**, Docker publishes this DB on **5433** — match `DATABASE_URL` in `.env`.

## Jupyter + `%sql`

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
python -m ipykernel install --user --name patientscope --display-name "Python (PatientScope)"
jupyter notebook notebooks/mimic_sql_smoke.ipynb
```

Use kernel **Python (PatientScope)**. Confirm `%sql` cells run after Postgres is loaded.

## SQL baseline

| File | Purpose |
|------|---------|
| `sql/cohort_icu_baseline.sql` | Chained CTEs: ICU stays → admissions → patients (+ optional sepsis ICD proxy). |
| `sql/outcomes_readmission_mimic_demo.sql` | Labels: 7d ICU bounce (same `hadm_id`), 30d any-cause hospital readmission. |
| `docs/cohort_definitions.md` | Draft definitions — finalize index cohort + planned-readmission simplifications. |

## API

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs`.

## Claude API + tool use

```bash
source .venv/bin/activate
python scripts/hello_claude.py
```

Expect a two-step Messages exchange (tool request → `tool_result` → final assistant text). Requires `ANTHROPIC_API_KEY` and **account credits** (Console → Plans & billing). If you see `credit balance is too low`, Phase 0 is still complete for DB/notebook work; add credits before the hackathon demo that needs live LLM calls.

## Frontend

```bash
cd frontend
cp .env.example .env.local   # optional; leave empty to use Vite proxy to the API
npm install
npm run dev                   # http://127.0.0.1:5173 — proxies /api → http://127.0.0.1:8000
```

Run the API (`uvicorn` above) in another terminal. Census (`/`) loads `GET /api/stays`; open a row to view the assessment (`/stay/:stay_id`). Production build: `npm run build` → static assets in `frontend/dist/`.

**Vercel:** root [`vercel.json`](vercel.json) sets **`"framework": null`** and installs/builds only `frontend/` so the deployment is a **static Vite site**, not Vercel’s FastAPI template (which looks for `main.py` / `api/main.py` and errors if the preset is on but there is no entrypoint). If builds still pick FastAPI, open the project on Vercel → **Settings → General → Framework Preset** and set it to **Other** (or leave auto-detect after this `vercel.json` is on `main`). The FastAPI app lives in [`backend/`](backend/) (not `api/`) because Vercel reserves a root **`api/`** folder for serverless routes. Local Python deps: [`python/requirements.txt`](python/requirements.txt).

The census/roster calls **`GET /api/stays`** via [`frontend/src/api/client.ts`](frontend/src/api/client.ts). On Vercel there is no backend on the same origin unless you add something else, so you must host FastAPI elsewhere (Railway, Render, Fly, etc.) and set **`VITE_API_BASE`** to that API’s public origin (e.g. `https://your-service.onrender.com`) in **Vercel → Settings → Environment Variables** for Production (and Preview if you use it), **without** a trailing slash—then **Redeploy** so the variable is available at build time. Leave `VITE_API_BASE` unset only when using the local Vite proxy.

The dashboard chrome and shadcn theme are adapted from [icu-insights-hub](https://github.com/jagong-cmu/icu-insights-hub) (sidebar shell, stat cards, Tailwind tokens); routing stays **React Router** + your FastAPI integration (not TanStack Start).

Optional backend env **`DEMO_STAY_ID`** (default `31269608`) marks which roster row gets real readiness vs stub labels — match your demo `stay_id`.
