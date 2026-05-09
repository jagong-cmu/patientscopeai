# Cohort & outcome definitions

Single source of truth for SQL labels and the demo pipeline. **SQL:** `sql/cohort_icu_baseline.sql`, `sql/outcomes_readmission_mimic_demo.sql`.

## Index ICU stay — **Option A (locked)**

**Analytic unit:** each **`stay_id`** in `mimiciv_icu.icustays` is its own **index ICU stay** (one row per ICU episode, not collapsed to one row per `hadm_id`).

**Rationale:** Discharge readiness and 7-day ICU bounce are defined at **each ICU exit**; multiple ICU stints in the same hospitalization are separate decision points.

**Inclusion (matches outcome SQL):**

- Inner join `mimiciv_icu.icustays` → `mimiciv_hosp.admissions` on `(subject_id, hadm_id)`.
- **`los >= 1` day** on `icustays` — drops ultra-brief transfers; aligns with `index_stays` in `outcomes_readmission_mimic_demo.sql`.

**Optional filters (add later if you want; then update SQL + this doc together):**

- Adults only (MIMIC age convention of your choice).
- Alive at ICU discharge: `deathtime` IS NULL OR `deathtime > icu.outtime`.

**30-day hospital readmission label:** computed from the **hospital** `dischtime` on the index stay’s `hadm_id`. All ICU stays that share the same `hadm_id` get the **same** `outcome_hosp_readmit_30d` value (same admission discharge). That is intentional for Option A.

## Other outcomes (removed from v1 scope)

Earlier drafts included (a) 7-day ICU bounce within the same hospitalization and (b) 30-day all-cause readmission (plus elective/non-elective proxies). For the v1 project scope we are **only** targeting **Outcome D** below, so those additional outcomes were removed from `sql/outcomes_readmission_mimic_demo.sql` to reduce ambiguity.

## Outcome D — **Unplanned ICU readmission within 72 hours of discharge** (project focus)

**Intent:** Flag “rapid bounce back” after hospital discharge where the patient returns quickly and requires ICU-level care.

**Operational rule (implemented):**

There exists a *new* `mimiciv_hosp.admissions` row \(readmission\) for the same `subject_id` such that:

- `a.hadm_id <> index.hadm_id`
- `a.admittime > index.dischtime`
- `a.admittime <= index.dischtime + 72 hours`
- `a.admission_type <> 'ELECTIVE'` (or NULL) **→ unplanned proxy**
- and the readmission hospitalization has **any ICU stay**: there exists `mimiciv_icu.icustays` row with `icu2.hadm_id = a.hadm_id`

**SQL output:** `outcome_hosp_readmit_72h_unplanned_icu`

**Notes:**

- This is a **hospital readmission** anchored on **hospital discharge** (`dischtime`), not an ICU-to-ICU transfer inside the same `hadm_id`.
- “Unplanned” is still a proxy; we’re using `admission_type != ELECTIVE` because the demo lacks full claims-style planned-readmission rules.

## Notes on fairness / subgroup reporting

Record at minimum: age band, `gender`, race/ethnicity fields available in `patients` / `admissions` for your cohort table. Demo N is **too small** for stable subgroup metrics—show **methodology**, not definitive disparities.
