# MimicScope — problem statement

**MimicScope** is the product name for this hackathon build: a **transparent discharge readiness assessment** for ICU clinicians, grounded in structured data (MIMIC-style charts/labs) plus honest **multi-definition readmission risk** and **subgroup performance** disclosure—addressing the “black-box score” critique from precision-medicine / clinical AI ethics work (e.g., transparency, calibration, equity).

## Why “readmission” is slippery

Hospitals differ in how they measure readmission: index stay definition, 7 vs 30 days, same-hospital vs any hospital, planned vs unplanned, ICU bounce vs all-cause hospital return. **Rates are not directly comparable** without explicit definitions. MimicScope’s design is to **show several labeled risks side-by-side** with cohort metadata, not to collapse everything into one number.

## What you standardize in software (hackathon scope)

You cannot fix cross-hospital policy differences in 24 hours. You **can**:

1. **Document** each outcome definition in `docs/cohort_definitions.md` (fill as you lock rules).
2. **Implement** each definition in SQL with the same variables each time (see `sql/outcomes_readmission_mimic_demo.sql`).
3. **Disclose** in the UI which definition each score uses and that demo data is **small-N proof-of-concept**.

Full MIMIC-IV (credentialled) generalizes methodology; **demo v2.2** (~100 patients) is for pipeline validation only.

## Relationship to current discharge workflow

Real ICU discharge combines physiology, trajectory, bed pressure, and handoff quality. MimicScope is **decision support**, not a replacement for judgment—aligned with the contrast your team described vs opaque vendor scores.

## Next steps (checklist)

- [ ] Confirm Postgres + demo load (`scripts/setup_mimic_demo.sh`).
- [ ] Finalize **index ICU stay** inclusion/exclusion rules in `docs/cohort_definitions.md`.
- [ ] Validate outcome SQL row counts and edge cases (death, transfers).
- [ ] Extract features for readiness + models; train simple baselines in `models/`.
- [ ] API + UI: readiness components, multi-definition risk cards, narrative + limitations.
