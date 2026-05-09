# Cohort baseline (MIMIC-IV demo)

Used by **MimicScope** feature work. See also `mimicscope_problem_statement.md`, `cohort_definitions.md`, and `sql/outcomes_readmission_mimic_demo.sql`.

This hackathon baseline uses **Option A** indexing: **each ICU stay** (`stay_id`) with **`los >= 1`** is its own analytic row (see **`cohort_definitions.md`**). Demographics and admission timing attach per stay.

## Inclusion

- Rows from `mimiciv_icu.icustays` with **`los >= 1`** (same filter as `outcomes_readmission_mimic_demo.sql`).
- Inner join to `mimiciv_hosp.admissions` on `(subject_id, hadm_id)` so each ICU stay aligns with exactly one hospitalization record.
- Inner join to `mimiciv_hosp.patients` for static demographics (`anchor_age`, `gender`).

## Features / labels (starter)

- **ICU length of stay** (`icu.los`) as a continuous scalar tied to each `stay_id`.
- **Optional phenotype proxy**: ICD-10 codes on that hospitalization beginning with `A41` flag a *sepsis-related billing-code proxy* (`has_sepsis_icd10_proxy`). This is **not** a clinical gold standard — replace with your hackathon definition.

## SQL entry point

See `sql/cohort_icu_baseline.sql` for the chained CTE implementation and aggregate sanity checks.
