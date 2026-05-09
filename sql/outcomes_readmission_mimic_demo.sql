-- Outcome labels for MimicScope (MIMIC-IV demo).
-- Pair with docs/cohort_definitions.md; tune inclusion rules to match your index cohort.
--
-- Definitions implemented here:
--   outcome_hosp_readmit_72h_unplanned_icu — proxy: new admission within 72h of dischtime where admission_type <> 'ELECTIVE' AND that admission has any ICU stay
--
-- Demo caveats: tiny sample (~100 patients); use for pipeline validation, not published rates.

WITH index_stays AS (
    SELECT
        icu.stay_id,
        icu.subject_id,
        icu.hadm_id,
        icu.intime AS icu_intime,
        icu.outtime AS icu_outtime,
        icu.los AS icu_los_days,
        adm.admittime,
        adm.dischtime,
        adm.admission_type,
        adm.deathtime
    FROM mimiciv_icu.icustays AS icu
    INNER JOIN mimiciv_hosp.admissions AS adm
        ON icu.subject_id = adm.subject_id
        AND icu.hadm_id = adm.hadm_id
    WHERE icu.los >= 1
),
readmit_72h_unplanned_icu AS (
    SELECT
        i.stay_id AS index_stay_id,
        -- keep one example readmission hadm_id for debugging/spot checks
        MIN(
            CASE
                WHEN a.hadm_id <> i.hadm_id
                    AND a.admittime > i.dischtime
                    AND a.admittime <= i.dischtime + INTERVAL '72 hours'
                    AND (a.admission_type IS NULL OR a.admission_type <> 'ELECTIVE')
                    AND icu2.stay_id IS NOT NULL
                THEN a.hadm_id
                ELSE NULL
            END
        ) AS readmit_hadm_id_72h_unplanned_icu,
        MAX(
            CASE
                WHEN a.hadm_id <> i.hadm_id
                    AND a.admittime > i.dischtime
                    AND a.admittime <= i.dischtime + INTERVAL '72 hours'
                    AND (a.admission_type IS NULL OR a.admission_type <> 'ELECTIVE')
                    AND icu2.stay_id IS NOT NULL
                THEN 1
                ELSE 0
            END
        )::INTEGER AS outcome_hosp_readmit_72h_unplanned_icu
    FROM index_stays AS i
    LEFT JOIN mimiciv_hosp.admissions AS a
        ON i.subject_id = a.subject_id
    LEFT JOIN mimiciv_icu.icustays AS icu2
        ON a.hadm_id = icu2.hadm_id
    GROUP BY i.stay_id
)
SELECT
    i.stay_id,
    i.subject_id,
    i.hadm_id,
    i.icu_outtime,
    i.dischtime,
    u.readmit_hadm_id_72h_unplanned_icu,
    COALESCE(u.outcome_hosp_readmit_72h_unplanned_icu, 0) AS outcome_hosp_readmit_72h_unplanned_icu
FROM index_stays AS i
LEFT JOIN readmit_72h_unplanned_icu AS u
    ON i.stay_id = u.index_stay_id
ORDER BY i.stay_id;
