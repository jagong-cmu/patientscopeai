import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter

from backend.schemas import StayListResponse, StayListRow
from backend.services.cohort_split import split_in_unit_vs_pending
from backend.services.discharge_events_store import get_discharged_stay_ids
from backend.services.icu_scan_limit import ICU_STAY_SCAN_LIMIT
from backend.services.mimic import list_icu_stays
from backend.services.models import predict_risk
from backend.services.news import compute_news_score, news_stub_from_subject

router = APIRouter()
_DEFAULT_DEMO_STAY_ID = "31269608"


def _demo_stay_id() -> int:
    """Parse DEMO_STAY_ID; tolerate stray ':' / whitespace from copy-paste."""
    raw = (os.getenv("DEMO_STAY_ID") or _DEFAULT_DEMO_STAY_ID).strip().lstrip(":").strip()
    try:
        return int(raw)
    except ValueError:
        return int(_DEFAULT_DEMO_STAY_ID)


def _anon_label(subject_id: int) -> str:
    return f"Patient {subject_id % 10000:05d}"


def _stay_list_row(r: dict, demo_id: int) -> StayListRow:
    sid = r["stay_id"]
    is_demo = sid == demo_id
    ns = compute_news_score(sid)
    if ns:
        nt = ns.total_score
        nb = ns.clinical_risk_band
    else:
        nt, nb = news_stub_from_subject(r["subject_id"])
    rr = predict_risk(int(sid))
    prob = None
    if rr and rr.risks:
        prob = float(rr.risks[0].probability)
    age = r.get("age_years")
    los = r.get("icu_los_hours")
    return StayListRow(
        stay_id=sid,
        display_patient_id=_anon_label(r["subject_id"]),
        age_years=float(age) if age is not None else None,
        gender=r.get("gender"),
        primary_diagnosis=r.get("primary_diagnosis"),
        icu_los_hours=float(los) if los is not None else None,
        news_total=nt,
        news_band=nb,
        readmission_risk_72h=prob,
        is_demo=is_demo,
    )


def _map_stay_rows(rows: list[dict], demo_id: int, max_workers: int) -> list[StayListRow]:
    if not rows:
        return []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {ex.submit(_stay_list_row, r, demo_id): r for r in rows}
        out = []
        for fut in as_completed(futs):
            out.append(fut.result())
    out.sort(key=lambda row: row.stay_id)
    return out


@router.get("", response_model=StayListResponse)
def list_stays():
    """In-unit ICU roster + pending ICU queue (overflow beyond configured bed capacity); NEWS per row."""
    demo_id = _demo_stay_id()
    discharged = get_discharged_stay_ids()
    raw = [r for r in list_icu_stays(ICU_STAY_SCAN_LIMIT) if r["stay_id"] not in discharged]
    in_unit, pending_rows = split_in_unit_vs_pending(raw)
    n = len(in_unit) + len(pending_rows)
    max_workers = max(
        1,
        min(
            int(os.getenv("STAYS_LIST_WORKERS", "12")),
            n or 1,
        ),
    )
    return StayListResponse(
        stays=_map_stay_rows(in_unit, demo_id, max_workers),
        pending_icu_stays=_map_stay_rows(pending_rows, demo_id, max_workers),
    )
