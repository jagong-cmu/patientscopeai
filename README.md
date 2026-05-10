# PatientScope AI

## Inspiration

This project grew out of an **AI in Healthcare Applications** course I took at Carnegie Mellon, where I dug into the gap between what clinical ML promises and what actually reaches the bedside. Around the same time, I started working hands-on with the [MIMIC-IV demo dataset](https://physionet.org/content/mimic-iv-demo/) — reconstructing ICU cohorts via chained CTEs, reproducing published prediction pipelines, and seeing up close how messy real critical-care data actually is.

What kept pulling at me was the readmission problem. ICU discharge is one of the highest-stakes transitions in critical care: send a patient to the floor too soon and they bounce back within days, often sicker than when they left. About 1 in 10 ICU patients gets readmitted, and a meaningful share of those discharges were premature in retrospect — the labs hadn't fully resolved, the medication regimen wasn't quite right, the patient was at the edge of stable rather than past it. The clinical team usually has the data to see this; what they don't always have is a tool that synthesizes it under bed-pressure and time-pressure.

Existing risk tools collapse this whole decision into a single opaque vendor score, which is exactly the kind of "trust me bro" output the CMU course had taught me to be skeptical of. **PatientScope AI** is what happens when those threads meet. I wanted decision support that grounds every claim in cohort definitions and source data, surfaces multiple readmission definitions instead of one incomparable rate, and gives the discharge team something they can actually argue with — less black-box probability, more clinical reasoning at the bedside.

## What it does

PatientScope is a clinical-style ICU dashboard backed by MIMIC-style ICU stays in PostgreSQL:

- **Ward / census views** — roster and summaries over ICU stays, with connectivity and latency surfaced to the UI via `GET /api/status` (no silent failures hiding behind a green checkmark).
- **Per-stay assessment** — NEWS-style readiness scoring, multi-definition readmission framing (several operational definitions documented in SQL/docs rather than collapsed into one incomparable rate), and 72-hour readmission risk from a trained scikit-learn Random Forest pipeline served via the API.
- **Vitals and trajectories** — structured pulls from MIMIC-like schemas powering charts and panels.
- **Narrative layer** — Anthropic Claude generates clinician-facing narrative text using a tool-use pattern, with optional persistence and audit paths wired toward MongoDB Atlas.
- **Methodology exposure** — the UI puts methodology and limitations front and center, so reviewers see what was measured, how, and where it falls short.

## How I built it

**Data & SQL.** Loaded MIMIC-IV demo into Postgres using MIT-LCP-style build scripts (create → load → constraints → indexes), with cohort and outcome SQL in `sql/cohort_icu_baseline.sql`, `sql/outcomes_readmission_mimic_demo.sql`, and `sql/mimicscope_build_v1.sql`. Feature snapshots align to ICU windows for modeling and discharge-timing sensitivity analysis.

**Machine learning.** `models/train.py` implements a Random Forest plus `SimpleImputer` in a sklearn `Pipeline`, with optional SMOTE / imbalanced-learn for larger cohorts, hyperparameter search, and stratified splits. Artifacts ship as joblib plus JSON reports so future-me can actually reproduce past-me.

**API.** FastAPI app with CORS, `/health` and `/api/status` (API + DB ping via `ping_database_ms()`), and REST routes under `/api/...`. Database access via `DATABASE_URL` (with `psycopg` normalization for `postgresql+psycopg://`) or discrete `POSTGRES_*` env vars. Modular routers for stays, ward, patient, risk, news, narrative, vitals, watchlist, and audit.

**Frontend.** Vite + React + TypeScript SPA with shadcn/ui and Tailwind, typed API client, `VITE_API_BASE` at build time for production origin, Vite proxy to FastAPI in dev. Root `vercel.json` configures static-only frontend deployment to avoid colliding with Vercel's reserved serverless conventions.

**Ops.** API runs under uvicorn; production pattern is reverse proxy (nginx) → `127.0.0.1:8000` with TLS, separate from static hosting.

## Challenges I ran into

- **Split hosting.** Vercel serves only static assets unless I bring my own backend, and `VITE_API_BASE` has to match the real API origin or the browser cheerfully calls the wrong host (e.g. apex 307s to www and gets HTML when it asked for JSON).
- **HTTPS / mixed content.** A SPA served over HTTPS demands an HTTPS API; raw `http://IP:port` gets a polite "no" from the browser.
- **Postgres on the server.** `database_ok: false` every time `DATABASE_URL` / `POSTGRES_*` disagreed with how Postgres was actually exposed — demo defaults used 5433 locally vs. 5432 on the VM, which is the kind of one-character difference that eats an hour.
- **Packaging vs. platforms.** Backend lives under `backend/` instead of root `api/` to sidestep Vercel's reserved serverless convention. Naming things is hard; naming things in a way that doesn't anger your hosting platform is harder.

## Accomplishments that I'm proud of

- End-to-end SQL → features → sklearn pipeline → API → React UI on realistic ICU schemas, all wired together and actually talking to each other.
- Explicit cohort and outcome documentation, plus multi-definition readmission thinking — no hidden composite score doing the heavy lifting.
- A polished hub UI with typed client code and modular FastAPI design that holds up under judge inspection.
- Operational honesty: status endpoints and methodology views that admit what's uncertain rather than papering over it.

## What I learned

- **Environment parity matters.** Local Docker on 5433, VM on 5432, and `DATABASE_URL` all have to agree, or `/api/status` lies quietly while the API still "runs."
- **Frontend env is build-time.** `VITE_*` variables require a redeploy after changes — easy to forget at 3 AM under hackathon time pressure.
- **Platform boundaries are real.** Static hosts excel at the UI; long-lived FastAPI + Postgres belongs on a small VM or managed container host, not bolted onto a static CDN through sheer optimism.

## What's next for PatientScope AI

- Harden production paths: managed Postgres (or persistent Neon), secrets rotation, tighter CORS than `*`, and structured logging.
- Credentialed MIMIC-IV / BigQuery paths for training parity with the `TRAINING_PARQUET` workflows already sketched in `models/train.py`.
- Stronger validation: calibration plots and notebook-backed audits aligned with `docs/scoring_rubric.md`.
- Optional consolidation: migrate API to Railway, Render, Fly, or Cloud Run to avoid self-managing VMs while keeping the FastAPI codebase intact.
