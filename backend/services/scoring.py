"""
Readiness score engine.
Computes four component scores (green/yellow/red) from MIMIC-IV vitals and labs.
Thresholds are documented in docs/scoring_rubric.md.
"""
from backend.services.mimic import get_vitals_last24h, get_labs_last48h, get_patient_summary
from backend.schemas import ReadinessResponse, ComponentScore
import numpy as np


# ── Vital sign item IDs ────────────────────────────────────────────────────────
HEART_RATE_ITEMS   = {220045}
MAP_ITEMS          = {220052, 220181}
RR_ITEMS           = {220210}
SPO2_ITEMS         = {220277}
TEMP_ITEMS         = {223761}
VASOPRESSOR_ITEMS  = {221906, 221289, 221749, 222315}  # norepinephrine, epinephrine, dopamine, vasopressin
VENT_ITEMS         = {720, 722}  # InspO2 / vent settings proxy

# ── Lab item IDs ──────────────────────────────────────────────────────────────
CREATININE_ITEM = 50912
BUN_ITEM        = 51006
LACTATE_ITEM    = 50813
WBC_ITEM        = 51301
HGB_ITEM        = 51222
GLUCOSE_ITEM    = 50931


def _last(values: list[float]) -> float | None:
    return values[-1] if values else None


def _slope(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    x = np.arange(len(values), dtype=float)
    return float(np.polyfit(x, values, 1)[0])


def _status(score: float) -> str:
    if score >= 0.75:
        return "green"
    if score >= 0.40:
        return "yellow"
    return "red"


def _physio_component(vitals: list[dict]) -> ComponentScore:
    """Score physiological stability from last-24h vitals."""
    evidence = []
    scores = []

    def extract(item_ids):
        return [v["valuenum"] for v in vitals if v["itemid"] in item_ids]

    hr = extract(HEART_RATE_ITEMS)
    if hr:
        last_hr = _last(hr)
        evidence.append(f"Heart rate last value: {last_hr:.0f} bpm")
        if 60 <= last_hr <= 100:
            scores.append(1.0)
        elif 50 <= last_hr < 60 or 100 < last_hr <= 120:
            scores.append(0.5)
        else:
            scores.append(0.0)

    rr = extract(RR_ITEMS)
    if rr:
        last_rr = _last(rr)
        evidence.append(f"Respiratory rate last value: {last_rr:.0f} breaths/min")
        scores.append(1.0 if 12 <= last_rr <= 20 else 0.5 if last_rr <= 24 else 0.0)

    spo2 = extract(SPO2_ITEMS)
    if spo2:
        last_spo2 = _last(spo2)
        evidence.append(f"SpO2 last value: {last_spo2:.0f}%")
        scores.append(1.0 if last_spo2 >= 95 else 0.5 if last_spo2 >= 92 else 0.0)

    map_vals = extract(MAP_ITEMS)
    if map_vals:
        last_map = _last(map_vals)
        evidence.append(f"MAP last value: {last_map:.0f} mmHg")
        scores.append(1.0 if 70 <= last_map <= 110 else 0.5 if last_map >= 60 else 0.0)

    composite = float(np.mean(scores)) if scores else 0.5
    return ComponentScore(
        label="Physiological Stability",
        score=composite,
        status=_status(composite),
        evidence=evidence,
    )


def _lab_component(labs: list[dict]) -> ComponentScore:
    """Score lab trajectory over last 48h."""
    evidence = []
    scores = []

    def extract(item_id):
        return [l["valuenum"] for l in labs if l["itemid"] == item_id]

    creat = extract(CREATININE_ITEM)
    if creat:
        slope = _slope(creat)
        last = _last(creat)
        evidence.append(f"Creatinine: {last:.2f} mg/dL (trend: {slope:+.3f}/measurement)")
        scores.append(1.0 if slope <= 0 and last <= 1.2 else 0.5 if slope <= 0.05 else 0.0)

    lactate = extract(LACTATE_ITEM)
    if lactate:
        last = _last(lactate)
        evidence.append(f"Lactate: {last:.1f} mmol/L")
        scores.append(1.0 if last <= 2.0 else 0.5 if last <= 4.0 else 0.0)

    wbc = extract(WBC_ITEM)
    if wbc:
        last = _last(wbc)
        evidence.append(f"WBC: {last:.1f} K/uL")
        scores.append(1.0 if 4.5 <= last <= 11.0 else 0.5 if last <= 15.0 else 0.0)

    bun = extract(BUN_ITEM)
    if bun:
        slope = _slope(bun)
        last = _last(bun)
        evidence.append(f"BUN: {last:.0f} mg/dL (trend: {slope:+.2f}/measurement)")
        scores.append(1.0 if slope <= 0 and last <= 20 else 0.5 if slope <= 1 else 0.0)

    composite = float(np.mean(scores)) if scores else 0.5
    return ComponentScore(
        label="Laboratory Trajectory",
        score=composite,
        status=_status(composite),
        evidence=evidence,
    )


def _medication_component(stay_id: int, vitals: list[dict]) -> ComponentScore:
    """Simplified medication readiness — checks vasopressor weaning."""
    evidence = []
    scores = []

    vasopressor_vals = [v for v in vitals if v["itemid"] in VASOPRESSOR_ITEMS]
    if vasopressor_vals:
        recent_times = sorted(v["charttime"] for v in vasopressor_vals)
        evidence.append(f"Vasopressor charted {len(vasopressor_vals)} times; last: {recent_times[-1]}")
        scores.append(0.0)  # still on vasopressors
    else:
        evidence.append("No vasopressor charted in last 24h")
        scores.append(1.0)

    composite = float(np.mean(scores)) if scores else 0.75
    return ComponentScore(
        label="Medication Readiness",
        score=composite,
        status=_status(composite),
        evidence=evidence,
    )


def _continuity_component(patient: dict) -> ComponentScore:
    """Score care continuity from stay metadata."""
    evidence = []
    scores = []

    los_hours = patient.get("icu_los_hours", 0)
    evidence.append(f"ICU LOS: {los_hours:.1f} hours")
    scores.append(1.0 if los_hours < 72 else 0.5 if los_hours < 168 else 0.3)

    disposition = patient.get("discharge_location", "")
    evidence.append(f"Discharge destination: {disposition or 'not yet set'}")
    if disposition and disposition not in ("", "DIED", "HOSPICE"):
        scores.append(1.0)
    else:
        scores.append(0.4)

    composite = float(np.mean(scores)) if scores else 0.5
    return ComponentScore(
        label="Care Continuity",
        score=composite,
        status=_status(composite),
        evidence=evidence,
    )


def compute_readiness_score(stay_id: int) -> ReadinessResponse | None:
    patient = get_patient_summary(stay_id)
    if not patient:
        return None

    vitals = get_vitals_last24h(stay_id)
    labs   = get_labs_last48h(stay_id)

    components = [
        _physio_component(vitals),
        _lab_component(labs),
        _medication_component(stay_id, vitals),
        _continuity_component(patient),
    ]

    composite = float(np.mean([c.score for c in components]))
    return ReadinessResponse(
        stay_id=stay_id,
        composite_score=round(composite, 3),
        composite_status=_status(composite),
        components=components,
    )
