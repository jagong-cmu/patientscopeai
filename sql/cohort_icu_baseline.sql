-- Baseline cohort for MIMIC-IV demo (schemas: mimiciv_hosp, mimiciv_icu).
-- Illustrates chained CTEs: ICU stays → admissions → patient demographics,
-- plus optional ICD-10 filter on diagnosed conditions during that hospitalization.

WITH icu_base AS (
    SELECT
        i.subject_id,
        i.hadm_id,
        i.stay_id,
        i.intime,
        i.outtime,
        i.los AS icu_los_days
    FROM mimiciv_icu.icustays AS i
    WHERE i.los >= 1  -- Option A index cohort; matches outcomes_readmission_mimic_demo.sql
),
adm AS (
    SELECT
        a.subject_id,
        a.hadm_id,
        a.admittime,
        a.dischtime,
        a.admission_type,
        a.deathtime
    FROM mimiciv_hosp.admissions AS a
),
dx AS (
    SELECT
        d.hadm_id,
        MAX(
            CASE
                WHEN d.icd_version = 10 AND d.icd_code LIKE 'A41%' THEN 1
                ELSE 0
            END
        )::INTEGER AS has_sepsis_icd10_proxy
    FROM mimiciv_hosp.diagnoses_icd AS d
    GROUP BY d.hadm_id
),
cohort AS (
    SELECT
        ib.subject_id,
        ib.hadm_id,
        ib.stay_id,
        ib.intime,
        ib.outtime,
        ib.icu_los_days,
        adm.admittime,
        adm.dischtime,
        adm.admission_type,
        adm.deathtime,
        p.anchor_age,
        p.gender,
        COALESCE(dx.has_sepsis_icd10_proxy, 0) AS has_sepsis_icd10_proxy
    FROM icu_base AS ib
    INNER JOIN adm
        ON ib.subject_id = adm.subject_id
        AND ib.hadm_id = adm.hadm_id
    INNER JOIN mimiciv_hosp.patients AS p
        ON ib.subject_id = p.subject_id
    LEFT JOIN dx
        ON ib.hadm_id = dx.hadm_id
)
SELECT
    COUNT(*) AS cohort_stays,
    COUNT(DISTINCT subject_id) AS cohort_patients,
    SUM(has_sepsis_icd10_proxy) AS stays_with_sepsis_icd10_proxy
FROM cohort;
