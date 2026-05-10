import os

from fastapi import APIRouter

from backend.schemas import WardAlertsResponse, WardPreviewRow, WardSummaryResponse
from backend.services.discharge_events_store import get_discharged_stay_ids
from backend.services.icu_scan_limit import ICU_STAY_SCAN_LIMIT
from backend.services.mimic import list_icu_stays
from backend.services.models import predict_risk
from backend.services.news import compute_news_score
from backend.services.ward_alerts import build_ward_alerts

router = APIRouter()


def _anon(subject_id: int) -> str:
    return f"Patient {subject_id % 10000:05d}"


@router.get("/summary", response_model=WardSummaryResponse)
def ward_summary():
    """
    Ward-level aggregates for dashboard: census vs configured bed capacity,
    discharge-queue preview (72h readmission risk desc, then NEWS desc), and highest NEWS cases.
    """
    capacity = max(1, int(os.getenv("WARD_BED_CAPACITY", "100")))
    pending_admissions = max(0, int(os.getenv("WARD_PENDING_ADMISSIONS", "0")))
    discharged = get_discharged_stay_ids()
    rows = [r for r in list_icu_stays(ICU_STAY_SCAN_LIMIT) if r["stay_id"] not in discharged]

    enriched: list[dict] = []
    for r in rows:
        sid = int(r["stay_id"])
        ns = compute_news_score(sid)
        if not ns:
            continue
        los = r.get("icu_los_hours")
        rr = predict_risk(sid)
        prob = None
        if rr and rr.risks:
            prob = float(rr.risks[0].probability)

        enriched.append(
            {
                "stay_id": sid,
                "subject_id": int(r["subject_id"]),
                "display_patient_id": _anon(int(r["subject_id"])),
                "news_total": ns.total_score,
                "news_band": ns.clinical_risk_band,
                "icu_los_hours": float(los) if los is not None else None,
                "readmission_risk_72h": prob,
            }
        )

    census = len(enriched)
    occupancy_ratio = min(1.0, census / float(capacity))

    # Discharge queue: highest 72h readmission risk first, then higher NEWS; missing risk last.
    dq_sorted = sorted(
        enriched,
        key=lambda x: (
            x["readmission_risk_72h"] if x["readmission_risk_72h"] is not None else -1.0,
            x["news_total"],
        ),
        reverse=True,
    )[:10]
    discharge_ready_count = len(dq_sorted)
    hi_sorted = sorted(enriched, key=lambda x: -x["news_total"])[:10]

    def as_preview(d: dict) -> WardPreviewRow:
        return WardPreviewRow(
            stay_id=d["stay_id"],
            display_patient_id=d["display_patient_id"],
            news_total=d["news_total"],
            news_band=d["news_band"],
            icu_los_hours=d["icu_los_hours"],
            readmission_risk_72h=d.get("readmission_risk_72h"),
        )

    return WardSummaryResponse(
        census_count=census,
        bed_capacity=capacity,
        occupancy_ratio=round(occupancy_ratio, 4),
        pending_admissions_count=pending_admissions,
        discharge_ready_count=discharge_ready_count,
        discharge_queue_preview=[as_preview(d) for d in dq_sorted],
        high_risk_preview=[as_preview(d) for d in hi_sorted],
    )


@router.get("/alerts", response_model=WardAlertsResponse)
def ward_alerts():
    return WardAlertsResponse(alerts=build_ward_alerts())
