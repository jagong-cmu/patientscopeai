-- ============================================================================
-- MimicScope v1 — BigQuery (same logic as sql/mimicscope_build_v1.sql)
--
-- STEP-BY-STEP (what to do in BigQuery console)
--
-- 1) Select your Google Cloud *project* (dropdown at top — this is where NEW tables are written).
--
-- 2) Create a dataset in that project to hold outputs, e.g. name it `mimicscope`
--    (BigQuery → ⋮ Add dataset → Location **US** if PhysioNet tables are US).
--
-- 3) Find your linked MIMIC-IV dataset names. In Explorer, expand projects until you see datasets
--    such as `mimiciv_icu`, `mimiciv_hosp`, OR `mimiciv_v3_1_icu`, `mimiciv_v3_1_hosp`.
--    Note the **full** table IDs, e.g. `physionet-data.mimiciv_icu.icustays`
--
-- 4) In THIS file, replace every occurrence of:
--      physionet-data.mimiciv_3_1_icu    → your ICU dataset id WITHOUT a trailing dot
--                        e.g. `physionet-data.mimiciv_icu`
--      physionet-data.mimiciv_3_1_hosp   → your HOSP dataset id
--                        e.g. `physionet-data.mimiciv_hosp`
--    (Keep the backticks. Use the same MIMIC version for ICU + HOSP.)
--
-- 5) Replace every occurrence of:
--      OUTPUT_DATASET   → where tables should be created, e.g. `my-gcp-project.mimicscope`
--    Or if your console already uses one project, `mimicscope` alone may work as OUTPUT_DATASET.
--
-- 6) Run each block below in order (or paste the whole file). Expect large scan costs on full MIMIC.
--
-- 7) Export for training (do not download raw CSV dumps):
--    SELECT * FROM `OUTPUT_DATASET.training_dataset_v1`
--    Query results → Save → Parquet (or CSV) → TRAINING_PARQUET in .env → python models/train.py
-- ============================================================================

-- --- copy/paste replace helpers (use Find & Replace in editor before running) ---
-- physionet-data.mimiciv_3_1_icu   = `physionet-data.mimiciv_icu`
-- physionet-data.mimiciv_3_1_hosp  = `physionet-data.mimiciv_hosp`
-- OUTPUT_DATASET  = `YOUR_PROJECT_ID.mimicscope`

-- 1) Index ICU stays: LOS >= 1 day
CREATE OR REPLACE TABLE `patientscope.mimicscope.index_stays_v1` AS
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
FROM `physionet-data.mimiciv_3_1_icu.icustays` AS icu
JOIN `physionet-data.mimiciv_3_1_hosp.admissions` AS adm
  ON adm.subject_id = icu.subject_id AND adm.hadm_id = icu.hadm_id
WHERE icu.los >= 1;

-- 2) Labels: 72h unplanned readmission with ICU on that hospitalization
CREATE OR REPLACE TABLE `patientscope.mimicscope.labels_v1` AS
WITH readmit AS (
  SELECT
    i.stay_id,
    MIN(
      CASE
        WHEN a.hadm_id <> i.hadm_id
         AND a.admittime > i.dischtime
         AND a.admittime <= TIMESTAMP_ADD(i.dischtime, INTERVAL 72 HOUR)
         AND (a.admission_type IS NULL OR a.admission_type <> 'ELECTIVE')
         AND icu2.stay_id IS NOT NULL
        THEN a.hadm_id
      END
    ) AS readmit_hadm_id_72h_unplanned_icu,
    MAX(
      CASE
        WHEN a.hadm_id <> i.hadm_id
         AND a.admittime > i.dischtime
         AND a.admittime <= TIMESTAMP_ADD(i.dischtime, INTERVAL 72 HOUR)
         AND (a.admission_type IS NULL OR a.admission_type <> 'ELECTIVE')
         AND icu2.stay_id IS NOT NULL
        THEN 1 ELSE 0
      END
    ) AS outcome_hosp_readmit_72h_unplanned_icu
  FROM `patientscope.mimicscope.index_stays_v1` AS i
  LEFT JOIN `physionet-data.mimiciv_3_1_hosp.admissions` AS a ON a.subject_id = i.subject_id
  LEFT JOIN `physionet-data.mimiciv_3_1_icu.icustays` AS icu2 ON icu2.hadm_id = a.hadm_id
  GROUP BY i.stay_id
)
SELECT stay_id, readmit_hadm_id_72h_unplanned_icu, outcome_hosp_readmit_72h_unplanned_icu
FROM readmit;

-- 3) Features (vitals 24h + labs 48h before ICU out)
CREATE OR REPLACE TABLE `patientscope.mimicscope.features_v1` AS
WITH stay_end AS (
  SELECT stay_id, hadm_id, subject_id, icu_intime, icu_outtime
  FROM `patientscope.mimicscope.index_stays_v1`
),
vitals AS (
  SELECT se.stay_id, ce.itemid, ce.charttime, ce.valuenum
  FROM stay_end se
  JOIN `physionet-data.mimiciv_3_1_icu.chartevents` ce ON ce.stay_id = se.stay_id
  WHERE ce.valuenum IS NOT NULL
    AND ce.charttime >= TIMESTAMP_SUB(se.icu_outtime, INTERVAL 24 HOUR)
    AND ce.charttime <= se.icu_outtime
    AND ce.itemid IN (220045, 220052, 220181, 220210, 220277, 223761, 221906, 221289, 221749, 222315)
),
vitals_agg AS (
  SELECT
    stay_id,
    AVG(CASE WHEN itemid = 220045 THEN valuenum END) AS hr_mean,
    MIN(CASE WHEN itemid = 220045 THEN valuenum END) AS hr_min,
    MAX(CASE WHEN itemid = 220045 THEN valuenum END) AS hr_max,
    AVG(CASE WHEN itemid IN (220052, 220181) THEN valuenum END) AS map_mean,
    MIN(CASE WHEN itemid IN (220052, 220181) THEN valuenum END) AS map_min,
    MAX(CASE WHEN itemid IN (220052, 220181) THEN valuenum END) AS map_max,
    AVG(CASE WHEN itemid = 220210 THEN valuenum END) AS rr_mean,
    MIN(CASE WHEN itemid = 220210 THEN valuenum END) AS rr_min,
    MAX(CASE WHEN itemid = 220210 THEN valuenum END) AS rr_max,
    AVG(CASE WHEN itemid = 220277 THEN valuenum END) AS spo2_mean,
    MIN(CASE WHEN itemid = 220277 THEN valuenum END) AS spo2_min,
    MAX(CASE WHEN itemid = 220277 THEN valuenum END) AS spo2_max,
    AVG(CASE WHEN itemid = 223761 THEN valuenum END) AS temp_mean,
    MIN(CASE WHEN itemid = 223761 THEN valuenum END) AS temp_min,
    MAX(CASE WHEN itemid = 223761 THEN valuenum END) AS temp_max,
    MAX(CASE WHEN itemid IN (221906, 221289, 221749, 222315) THEN 1 ELSE 0 END) AS vasopressor_present_24h
  FROM vitals
  GROUP BY stay_id
),
vitals_ranked AS (
  SELECT stay_id, itemid, valuenum AS last_value,
    ROW_NUMBER() OVER (PARTITION BY stay_id, itemid ORDER BY charttime DESC) AS rn
  FROM vitals
),
vitals_last AS (
  SELECT stay_id, itemid, last_value FROM vitals_ranked WHERE rn = 1
),
vitals_last_pivot AS (
  SELECT
    stay_id,
    MAX(CASE WHEN itemid = 220045 THEN last_value END) AS hr_last,
    MAX(CASE WHEN itemid IN (220052, 220181) THEN last_value END) AS map_last,
    MAX(CASE WHEN itemid = 220210 THEN last_value END) AS rr_last,
    MAX(CASE WHEN itemid = 220277 THEN last_value END) AS spo2_last,
    MAX(CASE WHEN itemid = 223761 THEN last_value END) AS temp_last
  FROM vitals_last
  GROUP BY stay_id
),
labs AS (
  SELECT se.stay_id, le.itemid, le.charttime, le.valuenum
  FROM stay_end se
  JOIN `physionet-data.mimiciv_3_1_hosp.labevents` le ON le.hadm_id = se.hadm_id
  WHERE le.valuenum IS NOT NULL
    AND le.charttime >= TIMESTAMP_SUB(se.icu_outtime, INTERVAL 48 HOUR)
    AND le.charttime <= se.icu_outtime
    AND le.itemid IN (50912, 51006, 50813, 51301, 51222, 50931)
),
labs_ranked AS (
  SELECT stay_id, itemid, valuenum AS last_value,
    ROW_NUMBER() OVER (PARTITION BY stay_id, itemid ORDER BY charttime DESC) AS rn
  FROM labs
),
labs_last AS (
  SELECT stay_id, itemid, last_value FROM labs_ranked WHERE rn = 1
),
labs_last_pivot AS (
  SELECT
    stay_id,
    MAX(CASE WHEN itemid = 50912 THEN last_value END) AS creat_last,
    MAX(CASE WHEN itemid = 51006 THEN last_value END) AS bun_last,
    MAX(CASE WHEN itemid = 50813 THEN last_value END) AS lactate_last,
    MAX(CASE WHEN itemid = 51301 THEN last_value END) AS wbc_last,
    MAX(CASE WHEN itemid = 51222 THEN last_value END) AS hgb_last,
    MAX(CASE WHEN itemid = 50931 THEN last_value END) AS glucose_last
  FROM labs_last
  GROUP BY stay_id
),
labs_ordered AS (
  SELECT stay_id, itemid, valuenum, charttime,
    ROW_NUMBER() OVER (PARTITION BY stay_id, itemid ORDER BY charttime) AS rn
  FROM labs
),
labs_slope AS (
  SELECT
    stay_id,
    itemid,
    SAFE_DIVIDE(
      COUNT(*) * SUM(rn * valuenum) - SUM(rn) * SUM(valuenum),
      NULLIF(COUNT(*) * SUM(rn * rn) - SUM(rn) * SUM(rn), 0)
    ) AS slope
  FROM labs_ordered
  GROUP BY stay_id, itemid
  HAVING COUNT(*) >= 2
),
labs_slope_pivot AS (
  SELECT
    stay_id,
    MAX(CASE WHEN itemid = 50912 THEN slope END) AS creat_slope,
    MAX(CASE WHEN itemid = 51006 THEN slope END) AS bun_slope
  FROM labs_slope
  GROUP BY stay_id
),
demo_age AS (
  SELECT
    icu.stay_id,
    CAST(p.anchor_age AS FLOAT64) AS age_years,
    CASE WHEN p.gender = 'M' THEN 1 WHEN p.gender = 'F' THEN 0 ELSE NULL END AS is_male
  FROM `physionet-data.mimiciv_3_1_icu.icustays` icu
  JOIN `physionet-data.mimiciv_3_1_hosp.patients` p ON p.subject_id = icu.subject_id
),
icu_los AS (
  SELECT stay_id,
    TIMESTAMP_DIFF(icu_outtime, icu_intime, SECOND) / 3600.0 AS icu_los_hours
  FROM stay_end
)
SELECT
  se.stay_id,
  da.age_years,
  da.is_male,
  il.icu_los_hours,
  va.hr_mean, va.hr_min, va.hr_max,
  va.map_mean, va.map_min, va.map_max,
  va.rr_mean, va.rr_min, va.rr_max,
  va.spo2_mean, va.spo2_min, va.spo2_max,
  va.temp_mean, va.temp_min, va.temp_max,
  vl.hr_last, vl.map_last, vl.rr_last, vl.spo2_last, vl.temp_last,
  va.vasopressor_present_24h,
  ll.creat_last, ls.creat_slope,
  ll.bun_last, ls.bun_slope,
  ll.lactate_last,
  ll.wbc_last,
  ll.hgb_last,
  ll.glucose_last
FROM stay_end se
LEFT JOIN demo_age da ON da.stay_id = se.stay_id
LEFT JOIN icu_los il ON il.stay_id = se.stay_id
LEFT JOIN vitals_agg va ON va.stay_id = se.stay_id
LEFT JOIN vitals_last_pivot vl ON vl.stay_id = se.stay_id
LEFT JOIN labs_last_pivot ll ON ll.stay_id = se.stay_id
LEFT JOIN labs_slope_pivot ls ON ls.stay_id = se.stay_id;

-- 4) Training-wide table (same columns as Postgres mimicscope.training_dataset_v1)
CREATE OR REPLACE TABLE `patientscope.mimicscope.training_dataset_v1` AS
SELECT
  i.stay_id,
  i.subject_id,
  i.hadm_id,
  i.icu_outtime,
  i.dischtime,
  l.readmit_hadm_id_72h_unplanned_icu,
  l.outcome_hosp_readmit_72h_unplanned_icu,
  f.age_years,
  f.is_male,
  f.icu_los_hours,
  f.hr_mean, f.hr_min, f.hr_max,
  f.map_mean, f.map_min, f.map_max,
  f.rr_mean, f.rr_min, f.rr_max,
  f.spo2_mean, f.spo2_min, f.spo2_max,
  f.temp_mean, f.temp_min, f.temp_max,
  f.hr_last, f.map_last, f.rr_last, f.spo2_last, f.temp_last,
  f.vasopressor_present_24h,
  f.creat_last, f.creat_slope,
  f.bun_last, f.bun_slope,
  f.lactate_last,
  f.wbc_last,
  f.hgb_last,
  f.glucose_last
FROM `patientscope.mimicscope.index_stays_v1` i
JOIN `patientscope.mimicscope.labels_v1` l ON l.stay_id = i.stay_id
JOIN `patientscope.mimicscope.features_v1` f ON f.stay_id = i.stay_id;
