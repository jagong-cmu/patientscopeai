#!/usr/bin/env bash
# Download MIMIC-IV demo (PhysioNet open subset) and load into local Postgres via MIT-LCP build scripts.
# Prerequisites: Docker + docker compose; Python 3 for PhysioNet download (wget not required).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEMO_VERSION="${MIMIC_DEMO_VERSION:-2.2}"
DATA_ROOT="${ROOT}/data/mimic-iv-demo/${DEMO_VERSION}"
BUILD_DIR="${ROOT}/scripts/vendor/mimic-build"
RAW_BASE="https://raw.githubusercontent.com/MIT-LCP/mimic-code/main/mimic-iv/buildmimic/postgres"

mkdir -p "${DATA_ROOT}/hosp" "${DATA_ROOT}/icu" "${BUILD_DIR}"

echo "==> Fetching MIT-LCP PostgreSQL build scripts"
for f in create.sql load_gz.sql constraint.sql index.sql validate_demo.sql; do
  curl -fsSL "${RAW_BASE}/${f}" -o "${BUILD_DIR}/${f}"
done

echo "==> Starting Postgres (docker compose)"
docker compose up -d postgres

echo "==> Waiting for Postgres to become ready"
until docker compose exec -T postgres pg_isready -U mimic -d mimiciv >/dev/null 2>&1; do
  sleep 2
done

need_download=0
if [[ ! -f "${DATA_ROOT}/hosp/patients.csv.gz" || ! -f "${DATA_ROOT}/icu/icustays.csv.gz" ]]; then
  need_download=1
fi

if [[ "${need_download}" -eq 1 ]]; then
  echo "==> Downloading MIMIC-IV demo ${DEMO_VERSION} from PhysioNet (large; chartevents may take several minutes)"
  mkdir -p "${ROOT}/data/mimic-iv-demo"
  python3 "${ROOT}/scripts/download_mimic_demo.py" --dest "${ROOT}/data/mimic-iv-demo" --version "${DEMO_VERSION}"
else
  echo "==> Demo files already present under ${DATA_ROOT}; skipping download"
fi

echo "==> Creating schemas / tables (drops existing MIMIC schemas in this DB)"
docker compose exec -T postgres psql -U mimic -d mimiciv -v ON_ERROR_STOP=1 -f /mimic_build/create.sql

echo "==> Loading gzipped CSVs (this can take a few minutes on first load)"
docker compose exec -T postgres psql -U mimic -d mimiciv -v ON_ERROR_STOP=1 -v mimic_data_dir=/mimic_data -f /mimic_build/load_gz.sql

echo "==> Adding constraints"
docker compose exec -T postgres psql -U mimic -d mimiciv -v ON_ERROR_STOP=1 -v mimic_data_dir=/mimic_data -f /mimic_build/constraint.sql

echo "==> Creating indexes"
docker compose exec -T postgres psql -U mimic -d mimiciv -v ON_ERROR_STOP=1 -v mimic_data_dir=/mimic_data -f /mimic_build/index.sql

echo "==> Validating demo row counts (expect PASSED for each table)"
docker compose exec -T postgres psql -U mimic -d mimiciv -v ON_ERROR_STOP=1 -f /mimic_build/validate_demo.sql

echo ""
echo "Done. Connect with:"
echo "  psql postgresql://mimic:mimic@127.0.0.1:5433/mimiciv"
echo "Or set DATABASE_URL in .env for Jupyter / Python."
