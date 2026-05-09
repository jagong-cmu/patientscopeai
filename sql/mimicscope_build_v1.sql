-- Build derived tables/views for MimicScope v1 training.
-- Target: 72h unplanned ICU readmission after hospital discharge (proxy).
--
-- This script is safe to re-run. It creates a dedicated schema `mimicscope`
-- and materialized views for index stays, labels, features, and the final
-- wide training dataset.

CREATE SCHEMA IF NOT EXISTS mimicscope;

DROP MATERIALIZED VIEW IF EXISTS mimicscope.training_dataset_v1;
DROP MATERIALIZED VIEW IF EXISTS mimicscope.features_v1;
DROP MATERIALIZED VIEW IF EXISTS mimicscope.labels_v1;
DROP MATERIALIZED VIEW IF EXISTS mimicscope.index_stays_v1;

-- 1) Index ICU stays (Option A): one row per stay_id, LOS >= 1 day.
CREATE MATERIALIZED VIEW mimicscope.index_stays_v1 AS
SELECT
  icu.stay_id,
  icu.subject_id,
  icu.hadm_id,
  icu.intime  AS icu_intime,
  icu.outtime AS icu_outtime,
  icu.los     AS icu_los_days,
  adm.admittime,
  adm.dischtime,
  adm.admission_type,
  adm.deathtime
FROM mimiciv_icu.icustays AS icu
JOIN mimiciv_hosp.admissions AS adm
  ON adm.subject_id = icu.subject_id
 AND adm.hadm_id = icu.hadm_id
WHERE icu.los >= 1;

CREATE INDEX ON mimicscope.index_stays_v1 (stay_id);
CREATE INDEX ON mimicscope.index_stays_v1 (subject_id);
CREATE INDEX ON mimicscope.index_stays_v1 (hadm_id);

-- 2) Labels: 72h unplanned hospital readmission that includes an ICU stay.
CREATE MATERIALIZED VIEW mimicscope.labels_v1 AS
WITH readmit AS (
  SELECT
    i.stay_id,
    MIN(
      CASE
        WHEN a.hadm_id <> i.hadm_id
         AND a.admittime > i.dischtime
         AND a.admittime <= i.dischtime + INTERVAL '72 hours'
         AND (a.admission_type IS NULL OR a.admission_type <> 'ELECTIVE')
         AND icu2.stay_id IS NOT NULL
        THEN a.hadm_id
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
  FROM mimicscope.index_stays_v1 AS i
  LEFT JOIN mimiciv_hosp.admissions AS a
    ON a.subject_id = i.subject_id
  LEFT JOIN mimiciv_icu.icustays AS icu2
    ON icu2.hadm_id = a.hadm_id
  GROUP BY i.stay_id
)
SELECT
  stay_id,
  readmit_hadm_id_72h_unplanned_icu,
  outcome_hosp_readmit_72h_unplanned_icu
FROM readmit;

CREATE INDEX ON mimicscope.labels_v1 (stay_id);

-- 3) Features: vitals (last 24h), labs (last 48h), and metadata.
-- Vitals/labs are anchored to each stay's ICU outtime.
CREATE MATERIALIZED VIEW mimicscope.features_v1 AS
WITH stay_end AS (
  SELECT stay_id, hadm_id, subject_id, icu_intime, icu_outtime
  FROM mimicscope.index_stays_v1
),
-- Vitals window: last 24h before ICU outtime.
vitals AS (
  SELECT
    se.stay_id,
    ce.itemid,
    ce.charttime,
    ce.valuenum
  FROM stay_end se
  JOIN mimiciv_icu.chartevents ce
    ON ce.stay_id = se.stay_id
  WHERE ce.valuenum IS NOT NULL
    AND ce.charttime >= se.icu_outtime - INTERVAL '24 hours'
    AND ce.charttime <= se.icu_outtime
    AND ce.itemid IN (220045, 220052, 220181, 220210, 220277, 223761, 221906, 221289, 221749, 222315)
),
vitals_agg AS (
  SELECT
    stay_id,
    AVG(valuenum) FILTER (WHERE itemid = 220045) AS hr_mean,
    MIN(valuenum) FILTER (WHERE itemid = 220045) AS hr_min,
    MAX(valuenum) FILTER (WHERE itemid = 220045) AS hr_max,
    AVG(valuenum) FILTER (WHERE itemid IN (220052, 220181)) AS map_mean,
    MIN(valuenum) FILTER (WHERE itemid IN (220052, 220181)) AS map_min,
    MAX(valuenum) FILTER (WHERE itemid IN (220052, 220181)) AS map_max,
    AVG(valuenum) FILTER (WHERE itemid = 220210) AS rr_mean,
    MIN(valuenum) FILTER (WHERE itemid = 220210) AS rr_min,
    MAX(valuenum) FILTER (WHERE itemid = 220210) AS rr_max,
    AVG(valuenum) FILTER (WHERE itemid = 220277) AS spo2_mean,
    MIN(valuenum) FILTER (WHERE itemid = 220277) AS spo2_min,
    MAX(valuenum) FILTER (WHERE itemid = 220277) AS spo2_max,
    AVG(valuenum) FILTER (WHERE itemid = 223761) AS temp_mean,
    MIN(valuenum) FILTER (WHERE itemid = 223761) AS temp_min,
    MAX(valuenum) FILTER (WHERE itemid = 223761) AS temp_max,
    MAX(CASE WHEN itemid IN (221906, 221289, 221749, 222315) THEN 1 ELSE 0 END)::INTEGER AS vasopressor_present_24h
  FROM vitals
  GROUP BY stay_id
),
vitals_last AS (
  SELECT DISTINCT ON (stay_id, itemid)
    stay_id,
    itemid,
    valuenum AS last_value
  FROM vitals
  ORDER BY stay_id, itemid, charttime DESC
),
vitals_last_pivot AS (
  SELECT
    stay_id,
    MAX(last_value) FILTER (WHERE itemid = 220045) AS hr_last,
    MAX(last_value) FILTER (WHERE itemid IN (220052, 220181)) AS map_last,
    MAX(last_value) FILTER (WHERE itemid = 220210) AS rr_last,
    MAX(last_value) FILTER (WHERE itemid = 220277) AS spo2_last,
    MAX(last_value) FILTER (WHERE itemid = 223761) AS temp_last
  FROM vitals_last
  GROUP BY stay_id
),
-- Labs window: last 48h before ICU outtime, via hadm_id.
labs AS (
  SELECT
    se.stay_id,
    le.itemid,
    le.charttime,
    le.valuenum
  FROM stay_end se
  JOIN mimiciv_hosp.labevents le
    ON le.hadm_id = se.hadm_id
  WHERE le.valuenum IS NOT NULL
    AND le.charttime >= se.icu_outtime - INTERVAL '48 hours'
    AND le.charttime <= se.icu_outtime
    AND le.itemid IN (50912, 51006, 50813, 51301, 51222, 50931)
),
labs_last AS (
  SELECT DISTINCT ON (stay_id, itemid)
    stay_id,
    itemid,
    valuenum AS last_value
  FROM labs
  ORDER BY stay_id, itemid, charttime DESC
),
labs_last_pivot AS (
  SELECT
    stay_id,
    MAX(last_value) FILTER (WHERE itemid = 50912) AS creat_last,
    MAX(last_value) FILTER (WHERE itemid = 51006) AS bun_last,
    MAX(last_value) FILTER (WHERE itemid = 50813) AS lactate_last,
    MAX(last_value) FILTER (WHERE itemid = 51301) AS wbc_last,
    MAX(last_value) FILTER (WHERE itemid = 51222) AS hgb_last,
    MAX(last_value) FILTER (WHERE itemid = 50931) AS glucose_last
  FROM labs_last
  GROUP BY stay_id
),
labs_slope AS (
  -- slope by measurement order (not time-weighted), matching the readiness engine approach
  SELECT
    stay_id,
    itemid,
    regr_slope(valuenum, rn) AS slope
  FROM (
    SELECT
      stay_id,
      itemid,
      valuenum,
      ROW_NUMBER() OVER (PARTITION BY stay_id, itemid ORDER BY charttime) AS rn
    FROM labs
  ) t
  GROUP BY stay_id, itemid
),
labs_slope_pivot AS (
  SELECT
    stay_id,
    MAX(slope) FILTER (WHERE itemid = 50912) AS creat_slope,
    MAX(slope) FILTER (WHERE itemid = 51006) AS bun_slope
  FROM labs_slope
  GROUP BY stay_id
),
demo_age AS (
  -- MIMIC demo uses anchor_age; keep it simple and consistent with other code
  SELECT
    icu.stay_id,
    p.anchor_age::FLOAT AS age_years,
    CASE WHEN p.gender = 'M' THEN 1 WHEN p.gender = 'F' THEN 0 ELSE NULL END AS is_male
  FROM mimiciv_icu.icustays icu
  JOIN mimiciv_hosp.patients p
    ON p.subject_id = icu.subject_id
),
icu_los AS (
  SELECT
    stay_id,
    EXTRACT(EPOCH FROM (icu_outtime - icu_intime)) / 3600.0 AS icu_los_hours
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
  ll.bun_last,   ls.bun_slope,
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

CREATE INDEX ON mimicscope.features_v1 (stay_id);

-- 4) Final training dataset
CREATE MATERIALIZED VIEW mimicscope.training_dataset_v1 AS
SELECT
  i.stay_id,
  i.subject_id,
  i.hadm_id,
  i.icu_outtime,
  i.dischtime,
  l.readmit_hadm_id_72h_unplanned_icu,
  l.outcome_hosp_readmit_72h_unplanned_icu,
  -- feature columns (exclude f.stay_id to avoid duplicate column names)
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
FROM mimicscope.index_stays_v1 i
JOIN mimicscope.labels_v1 l
  ON l.stay_id = i.stay_id
JOIN mimicscope.features_v1 f
  ON f.stay_id = i.stay_id;

CREATE INDEX ON mimicscope.training_dataset_v1 (stay_id);

