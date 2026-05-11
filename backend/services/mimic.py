"""MIMIC-IV PostgreSQL query layer (psycopg3)."""
import os
import time

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

_CONNSTR = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5433')} "
    f"dbname={os.getenv('POSTGRES_DB', 'mimiciv')} "
    f"user={os.getenv('POSTGRES_USER', 'mimic')} "
    f"password={os.getenv('POSTGRES_PASSWORD', 'mimic')}"
)


def ping_database_ms() -> tuple[bool, float]:
    """Returns (success, round-trip milliseconds)."""
    t0 = time.perf_counter()
    try:
        with _conn() as con, con.cursor() as cur:
            cur.execute("SELECT 1")
        return True, (time.perf_counter() - t0) * 1000.0
    except Exception:
        return False, (time.perf_counter() - t0) * 1000.0


def _conn():
    # Prefer a full SQLAlchemy-style DATABASE_URL when present (e.g. Supabase).
    # psycopg3 doesn't understand SQLAlchemy's "postgresql+psycopg://" scheme.
    # prepare_threshold=0 avoids prepared-statement issues with poolers (e.g. Supabase).
    url = (os.getenv("DATABASE_URL") or "").strip()
    if url:
        # libpq URI: strip SQLAlchemy / mistaken driver prefixes (Supabase docs sometimes say "psycopg3").
        url = (
            url.replace("postgresql+psycopg3://", "postgresql://", 1)
            .replace("postgresql+psycopg://", "postgresql://", 1)
            .replace("postgresql+psycopg2://", "postgresql://", 1)
        )
        return psycopg.connect(url, row_factory=dict_row, prepare_threshold=0)
    return psycopg.connect(_CONNSTR, row_factory=dict_row, prepare_threshold=0)


def get_patient_summary(stay_id: int) -> dict | None:
    """Return basic stay info joined from icustays + patients + admissions."""
    sql = """
        SELECT
            icu.stay_id,
            icu.subject_id,
            icu.hadm_id,
            p.gender,
            CASE
              WHEN adm.admittime IS NOT NULL THEN
                (p.anchor_age + (
                  EXTRACT(YEAR FROM adm.admittime)::integer - p.anchor_year
                ))::double precision
            END AS age_years,
            adm.race,
            adm.insurance,
            adm.admittime,
            icu.intime   AS icu_in,
            icu.outtime  AS icu_out,
            EXTRACT(EPOCH FROM (icu.outtime - icu.intime)) / 3600 AS icu_los_hours,
            CASE
              WHEN adm.admittime IS NOT NULL AND adm.dischtime IS NOT NULL THEN
                EXTRACT(EPOCH FROM (adm.dischtime - adm.admittime)) / 3600
            END AS hospital_los_hours,
            icu.first_careunit,
            adm.discharge_location,
            adm.hospital_expire_flag,
            prim_dx.long_title AS primary_diagnosis
        FROM mimiciv_icu.icustays icu
        JOIN mimiciv_hosp.patients p
          ON p.subject_id = icu.subject_id
        LEFT JOIN mimiciv_hosp.admissions adm
          ON adm.hadm_id = icu.hadm_id
         AND adm.subject_id = icu.subject_id
        LEFT JOIN LATERAL (
            SELECT d.long_title
            FROM mimiciv_hosp.diagnoses_icd dx
            JOIN mimiciv_hosp.d_icd_diagnoses d
              ON d.icd_code = dx.icd_code
             AND d.icd_version = dx.icd_version
            WHERE dx.hadm_id = icu.hadm_id
              AND dx.seq_num = 1
            LIMIT 1
        ) prim_dx ON TRUE
        WHERE icu.stay_id = %s
    """
    with _conn() as con, con.cursor() as cur:
        cur.execute(sql, (stay_id,))
        row = cur.fetchone()
    return dict(row) if row else None


def get_vitals_last24h(stay_id: int) -> list[dict]:
    """Return charted vitals from the last 24h of an ICU stay."""
    sql = """
        WITH stay_end AS (
            SELECT outtime FROM mimiciv_icu.icustays WHERE stay_id = %s
        )
        SELECT
            ce.itemid,
            di.label,
            ce.charttime,
            ce.valuenum
        FROM mimiciv_icu.chartevents ce
        JOIN mimiciv_icu.d_items di USING (itemid)
        JOIN stay_end se ON true
        WHERE ce.stay_id = %s
          AND ce.valuenum IS NOT NULL
          AND ce.charttime >= se.outtime - INTERVAL '24 hours'
          AND ce.itemid IN (
              220045, 220050, 220051, 220052,
              220179, 220180, 220181,
              220210, 220277, 223761,
              223834,
              227287, 223848,
              225309
          )
        ORDER BY ce.charttime
    """
    with _conn() as con, con.cursor() as cur:
        cur.execute(sql, (stay_id, stay_id))
        return [dict(r) for r in cur.fetchall()]


def get_labs_last48h(stay_id: int) -> list[dict]:
    """Return key labs from the last 48h of an ICU stay."""
    sql = """
        WITH stay AS (
            SELECT hadm_id, outtime
            FROM mimiciv_icu.icustays
            WHERE stay_id = %s
        )
        SELECT
            le.itemid,
            di.label,
            le.charttime,
            le.valuenum,
            le.valueuom
        FROM mimiciv_hosp.labevents le
        JOIN mimiciv_hosp.d_labitems di USING (itemid)
        JOIN stay s ON le.hadm_id = s.hadm_id
        WHERE le.valuenum IS NOT NULL
          AND le.charttime >= s.outtime - INTERVAL '48 hours'
          AND le.itemid IN (
              50912, 51006, 50813, 51301,
              51222, 50931, 50822, 50824
          )
        ORDER BY le.charttime
    """
    with _conn() as con, con.cursor() as cur:
        cur.execute(sql, (stay_id,))
        return [dict(r) for r in cur.fetchall()]


def list_icu_stays(limit: int = 100) -> list[dict]:
    """
    ICU stays with los >= 1 for dashboard list (anonymized labels).
    Excludes in-hospital deaths (MIMIC admissions.hospital_expire_flag).
    Includes primary diagnosis where available.
    """
    sql = """
        SELECT
            icu.stay_id,
            icu.subject_id,
            p.gender,
            (p.anchor_age + (
                EXTRACT(YEAR FROM adm.admittime)::integer - p.anchor_year
            ))::double precision AS age_years,
            EXTRACT(EPOCH FROM (icu.outtime - icu.intime)) / 3600 AS icu_los_hours,
            prim_dx.long_title AS primary_diagnosis
        FROM mimiciv_icu.icustays icu
        JOIN mimiciv_hosp.admissions adm
          ON adm.hadm_id = icu.hadm_id
         AND adm.subject_id = icu.subject_id
        JOIN mimiciv_hosp.patients p
          ON p.subject_id = icu.subject_id
        LEFT JOIN LATERAL (
            SELECT d.long_title
            FROM mimiciv_hosp.diagnoses_icd dx
            JOIN mimiciv_hosp.d_icd_diagnoses d
              ON d.icd_code = dx.icd_code
             AND d.icd_version = dx.icd_version
            WHERE dx.hadm_id = adm.hadm_id
              AND dx.seq_num = 1
            LIMIT 1
        ) prim_dx ON TRUE
        WHERE icu.los >= 1
          AND COALESCE(adm.hospital_expire_flag, 0) = 0
        ORDER BY icu.stay_id
        LIMIT %s
    """
    with _conn() as con, con.cursor() as cur:
        cur.execute(sql, (limit,))
        return [dict(r) for r in cur.fetchall()]
