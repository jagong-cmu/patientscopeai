# Readiness score rubric (v1)

This document describes the **transparent, rule-based** discharge readiness scoring used by the API endpoint:

- `GET /api/readiness/{stay_id}`

Implementation: `backend/services/scoring.py`.

## Output shape

The readiness engine returns:

- **Composite score**: float in \([0, 1]\) with a traffic-light status
- **Components**: four component scores, each with evidence strings showing the values used

Status mapping:

- **green**: score ≥ 0.75  
- **yellow**: 0.40 ≤ score < 0.75  
- **red**: score < 0.40

## Component 1 — Physiological Stability (last 24h)

Computed from last-available values in the last 24 hours of the ICU stay.

### Heart rate (bpm)

- green (1.0): 60–100
- yellow (0.5): 50–59 or 101–120
- red (0.0): otherwise

### Respiratory rate (breaths/min)

- green (1.0): 12–20
- yellow (0.5): 21–24
- red (0.0): ≥ 25 or < 12

### SpO2 (%)

- green (1.0): ≥ 95
- yellow (0.5): 92–94
- red (0.0): < 92

### Mean arterial pressure (MAP, mmHg)

- green (1.0): 70–110
- yellow (0.5): 60–69 or > 110
- red (0.0): < 60

Component score = mean of available sub-scores (defaults to 0.5 if no data).

## Component 2 — Laboratory Trajectory (last 48h)

Uses simple last-value thresholds and direction-of-change (“trend”) approximations.
Trend is a linear fit slope over the measurement sequence (not time-weighted).

### Creatinine (mg/dL)

- green (1.0): trend ≤ 0 and last ≤ 1.2
- yellow (0.5): trend ≤ 0.05
- red (0.0): otherwise

### Lactate (mmol/L)

- green (1.0): ≤ 2.0
- yellow (0.5): 2.1–4.0
- red (0.0): > 4.0

### WBC (K/uL)

- green (1.0): 4.5–11.0
- yellow (0.5): 11.1–15.0
- red (0.0): > 15.0 or < 4.5

### BUN (mg/dL)

- green (1.0): trend ≤ 0 and last ≤ 20
- yellow (0.5): trend ≤ 1
- red (0.0): otherwise

Component score = mean of available sub-scores (defaults to 0.5 if no data).

## Component 3 — Medication Readiness (last 24h)

Proxy for ongoing hemodynamic support:

- red (0.0): any charted vasopressor item in the last 24h
- green (1.0): no vasopressor charted in the last 24h

Component score defaults to 0.75 if no data.

## Component 4 — Care Continuity (metadata)

### ICU length of stay (hours)

- green (1.0): < 72h
- yellow (0.5): 72h–167.9h
- red (0.3): ≥ 168h

### Discharge destination

- green (1.0): non-empty discharge location not in \(`DIED`, `HOSPICE`\)
- yellow/red (0.4): missing or indicates end-of-life destination

Component score = mean of the two sub-scores (defaults to 0.5 if missing).

## Notes / limitations

- This is a **heuristic, transparent** rubric for hackathon prototyping; it is not a validated clinical score.
- Demo data has gaps and small N; evidence strings should be treated as *illustrative*.
- The trend calculation is by measurement order, not by timestamp spacing.

