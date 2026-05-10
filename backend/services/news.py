"""
National Early Warning Score (NEWS2-aligned, Scale 1 SpO₂).

References UK Royal College of Physicians NEWS2 charts (aggregate score 0–20).
SpO₂ uses Scale 1 (room air). Supplemental oxygen / Scale 2: detected via FiO₂ / O₂ flow
chart items when present — if detected, limitations note that Scale 2 scoring is not applied.

Temperature: chart values > 45 assumed Fahrenheit and converted to °C for NEWS thresholds.
"""
from __future__ import annotations

from typing import Literal

from backend.schemas import NewsParameterScore, NewsScoreResponse
from backend.services.demo_high_news import get_high_news_demo_ids, synthetic_demo_high_news
from backend.services.mimic import get_patient_summary, get_vitals_last24h

# Chart item groups (MIMIC-IV ICU)
ITEM_HR = {220045}
ITEM_RR = {220210}
ITEM_SPO2 = {220277}
ITEM_TEMP = {223761}
# Systolic: prefer NIBP; arterial systolic also common
ITEM_SBP = {220050, 220179, 225309}
ITEM_FIO2 = {223834}
ITEM_O2_FLOW = {227287, 223848}


def _last_by_items(vitals: list[dict], item_ids: set[int]) -> tuple[float | None, str | None]:
    """Most recent charttime value among item ids."""
    rows = [v for v in vitals if v.get("itemid") in item_ids and v.get("valuenum") is not None]
    if not rows:
        return None, None
    rows.sort(key=lambda r: r["charttime"])
    last = rows[-1]
    return float(last["valuenum"]), str(last["charttime"])


def _temp_celsius(val: float) -> float:
    """NEWS2 uses °C; MIMIC often charts °F for some templates."""
    if val > 45:
        return (val - 32.0) * 5.0 / 9.0
    return val


def _score_rr(rr: float) -> int:
    if rr <= 8:
        return 3
    if rr <= 11:
        return 1
    if rr <= 20:
        return 0
    if rr <= 24:
        return 2
    return 3


def _score_spo2_scale1(spo2: float) -> int:
    if spo2 <= 91:
        return 3
    if spo2 <= 93:
        return 2
    if spo2 <= 95:
        return 1
    return 0


def _score_temp_c(t: float) -> int:
    if t <= 35.0:
        return 3
    if t <= 36.0:
        return 1
    if t <= 38.0:
        return 0
    if t <= 39.0:
        return 1
    return 2


def _score_sbp(sbp: float) -> int:
    if sbp <= 90:
        return 3
    if sbp <= 100:
        return 2
    if sbp <= 110:
        return 1
    if sbp <= 219:
        return 0
    return 3


def _score_hr(hr: float) -> int:
    if hr <= 40:
        return 3
    if hr <= 50:
        return 1
    if hr <= 90:
        return 0
    if hr <= 110:
        return 1
    if hr <= 130:
        return 2
    return 3


def _band(total: int) -> Literal["low", "medium", "high"]:
    if total <= 4:
        return "low"
    if total <= 6:
        return "medium"
    return "high"


def _oxygen_therapy_suspected(vitals: list[dict]) -> bool:
    for v in vitals:
        iid = v.get("itemid")
        val = v.get("valuenum")
        if val is None:
            continue
        if iid in ITEM_FIO2 and float(val) > 0.21:
            return True
        if iid in ITEM_O2_FLOW and float(val) > 0:
            return True
    return False


def compute_news_score(stay_id: int) -> NewsScoreResponse | None:
    patient = get_patient_summary(stay_id)
    if not patient:
        return None

    sid = int(stay_id)
    if sid in get_high_news_demo_ids():
        return synthetic_demo_high_news(sid)

    vitals = get_vitals_last24h(stay_id)
    limitations: list[str] = []
    evidence: list[str] = []
    params: list[NewsParameterScore] = []

    if _oxygen_therapy_suspected(vitals):
        limitations.append(
            "Supplemental oxygen or elevated FiO₂ may be present; NEWS2 Scale 2 is not scored here — "
            "interpret SpO₂ alongside oxygen delivery per local protocol."
        )

    rr, _ = _last_by_items(vitals, ITEM_RR)
    if rr is not None:
        pts = _score_rr(rr)
        params.append(
            NewsParameterScore(
                name="respiratory_rate",
                label="Respiratory rate",
                points=pts,
                value_display=f"{rr:.0f} breaths/min",
                subscale_note=None,
            )
        )
        evidence.append(f"Respiratory rate {rr:.0f} → {pts} point(s)")
    else:
        params.append(
            NewsParameterScore(
                name="respiratory_rate",
                label="Respiratory rate",
                points=0,
                value_display="—",
                subscale_note="Not charted in last 24h",
            )
        )
        limitations.append("Respiratory rate missing — scored as 0; incomplete NEWS.")

    spo2, _ = _last_by_items(vitals, ITEM_SPO2)
    if spo2 is not None:
        pts = _score_spo2_scale1(spo2)
        params.append(
            NewsParameterScore(
                name="spo2",
                label="SpO₂ (Scale 1)",
                points=pts,
                value_display=f"{spo2:.0f}%",
                subscale_note="Scale 1 (room air chart); see limitations if on oxygen.",
            )
        )
        evidence.append(f"SpO₂ {spo2:.0f}% (Scale 1) → {pts} point(s)")
    else:
        params.append(
            NewsParameterScore(
                name="spo2",
                label="SpO₂",
                points=0,
                value_display="—",
                subscale_note="Not charted",
            )
        )
        limitations.append("SpO₂ missing — scored as 0; incomplete NEWS.")

    temp_raw, _ = _last_by_items(vitals, ITEM_TEMP)
    if temp_raw is not None:
        tc = _temp_celsius(temp_raw)
        pts = _score_temp_c(tc)
        params.append(
            NewsParameterScore(
                name="temperature",
                label="Temperature",
                points=pts,
                value_display=f"{tc:.1f} °C",
                subscale_note="Converted from °F if chart used Fahrenheit.",
            )
        )
        evidence.append(f"Temperature {tc:.1f} °C → {pts} point(s)")
    else:
        params.append(
            NewsParameterScore(
                name="temperature",
                label="Temperature",
                points=0,
                value_display="—",
                subscale_note="Not charted",
            )
        )
        limitations.append("Temperature missing — scored as 0; incomplete NEWS.")

    sbp, _ = _last_by_items(vitals, ITEM_SBP)
    if sbp is not None:
        pts = _score_sbp(sbp)
        params.append(
            NewsParameterScore(
                name="systolic_bp",
                label="Systolic BP",
                points=pts,
                value_display=f"{sbp:.0f} mmHg",
                subscale_note="Latest NIBP/arterial systolic in window.",
            )
        )
        evidence.append(f"Systolic BP {sbp:.0f} mmHg → {pts} point(s)")
    else:
        params.append(
            NewsParameterScore(
                name="systolic_bp",
                label="Systolic BP",
                points=0,
                value_display="—",
                subscale_note="Not charted",
            )
        )
        limitations.append("Systolic BP missing — scored as 0; incomplete NEWS.")

    hr, _ = _last_by_items(vitals, ITEM_HR)
    if hr is not None:
        pts = _score_hr(hr)
        params.append(
            NewsParameterScore(
                name="pulse",
                label="Pulse",
                points=pts,
                value_display=f"{hr:.0f} bpm",
                subscale_note=None,
            )
        )
        evidence.append(f"Pulse {hr:.0f} bpm → {pts} point(s)")
    else:
        params.append(
            NewsParameterScore(
                name="pulse",
                label="Pulse",
                points=0,
                value_display="—",
                subscale_note="Not charted",
            )
        )
        limitations.append("Pulse missing — scored as 0; incomplete NEWS.")

    # Consciousness — rarely structured in chartevents; default Alert
    params.append(
        NewsParameterScore(
            name="consciousness",
            label="Consciousness (ACVPU)",
            points=0,
            value_display="Alert (assumed)",
            subscale_note="Structured ACVPU often unavailable in MIMIC chartevents — defaulted to Alert (0).",
        )
    )
    limitations.append(
        "ACVPU not routinely extracted from structured data; defaulted to Alert (0). Verify clinically."
    )

    total = sum(p.points for p in params)
    band = _band(total)

    limitations.append(
        "NEWS2 thresholds follow UK RCP aggregate scoring (low 0–4, medium 5–6, high ≥7). "
        "This implementation uses Scale 1 SpO₂ unless Scale 2 is added later."
    )

    return NewsScoreResponse(
        stay_id=stay_id,
        total_score=total,
        clinical_risk_band=band,
        parameters=params,
        evidence=evidence,
        limitations=limitations,
        scale_note="SpO₂ Scale 1 (room air). Supplemental oxygen scoring (Scale 2) not fully automated.",
    )


def news_stub_from_subject(subject_id: int) -> tuple[int, Literal["low", "medium", "high"]]:
    """Deterministic stub when vitals unavailable (roster demo)."""
    s = subject_id % 21
    band: Literal["low", "medium", "high"] = "low" if s <= 4 else "medium" if s <= 6 else "high"
    return s, band
