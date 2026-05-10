import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter

from backend.schemas import WardAlertsResponse, WardPreviewRow, WardSummaryResponse
from backend.services.cohort_split import split_in_unit_vs_pending
from backend.services.discharge_events_store import get_discharged_stay_ids
from backend.services.icu_scan_limit import ICU_STAY_SCAN_LIMIT
from backend.services.mimic import list_icu_stays
from backend.services.models import predict_risk
from backend.services.news import compute_news_score
from backend.services.ward_alerts import build_ward_alerts

router = APIRouter()


def _anon(subject_id: int) -> str:
    return f"Patient {subject_id % 10000:05d}"


def _enrich_ward_row(r: dict) -> dict | None:
    sid = int(r["stay_id"])
    ns = compute_news_score(sid)
    if not ns:
        return None
    los = r.get("icu_los_hours")
    rr = predict_risk(sid)
    prob = None
    if rr and rr.risks:
        prob = float(rr.risks[0].probability)

    return {
        "stay_id": sid,
        "subject_id": int(r["subject_id"]),
        "display_patient_id": _anon(int(r["subject_id"])),
        "news_total": ns.total_score,
        "news_band": ns.clinical_risk_band,
        "icu_los_hours": float(los) if los is not None else None,
        "readmission_risk_72h": prob,
    }


@router.get("/summary", response_model=WardSummaryResponse)
def ward_summary():
    """
    Ward-level aggregates for dashboard: census vs configured bed capacity,
    discharge-queue preview (lowest 72h readmission risk first, then ascending NEWS),
    and highest risk preview (highest 72h risk first, then NEWS descending).
    """
    capacity = max(1, int(os.getenv("WARD_BED_CAPACITY", "100")))
    pending_env = max(0, int(os.getenv("WARD_PENDING_ADMISSIONS", "0")))
    discharged = get_discharged_stay_ids()
    raw = [r for r in list_icu_stays(ICU_STAY_SCAN_LIMIT) if r["stay_id"] not in discharged]
    rows, pending_overflow = split_in_unit_vs_pending(raw, capacity)
    pending_admissions = len(pending_overflow) + pending_env

    max_workers = max(
        1,
        min(
            int(os.getenv("WARD_ENRICH_WORKERS", "12")),
            len(rows) or 1,
        ),
    )
    enriched: list[dict] = []
    if rows:
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futures = (ex.submit(_enrich_ward_row, r) for r in rows)
            for fut in as_completed(futures):
                row = fut.result()
                if row:
                    enriched.append(row)

    census = len(enriched)
    occupancy_ratio = min(1.0, census / float(capacity))

    # Discharge queue: lowest 72h readmission risk first (safest to discharge), then lower NEWS; missing risk last.
    dq_sorted = sorted(
        enriched,
        key=lambda x: (
            x["readmission_risk_72h"] if x["readmission_risk_72h"] is not None else float("inf"),
            x["news_total"],
        ),
    )[:10]
    discharge_ready_count = len(dq_sorted)

    # Highest risk: primary = 72h risk desc; tie-break = higher NEWS; missing risk sorts last.
    hi_sorted = sorted(
        enriched,
        key=lambda x: (
            x["readmission_risk_72h"] if x["readmission_risk_72h"] is not None else -1.0,
            x["news_total"],
        ),
        reverse=True,
    )[:10]

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
