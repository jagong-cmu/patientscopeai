import os

from fastapi import APIRouter

from backend.schemas import StayListResponse, StayListRow
from backend.services.discharge_events_store import get_discharged_stay_ids
from backend.services.icu_scan_limit import ICU_STAY_SCAN_LIMIT
from backend.services.mimic import list_icu_stays
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


@router.get("", response_model=StayListResponse)
def list_stays():
    """ICU stays (los >= 1) for dashboard; NEWS computed per stay when chart data exists."""
    demo_id = _demo_stay_id()
    discharged = get_discharged_stay_ids()
    rows = [r for r in list_icu_stays(ICU_STAY_SCAN_LIMIT) if r["stay_id"] not in discharged]
    out: list[StayListRow] = []
    for r in rows:
        sid = r["stay_id"]
        is_demo = sid == demo_id
        ns = compute_news_score(sid)
        if ns:
            nt = ns.total_score
            nb = ns.clinical_risk_band
        else:
            nt, nb = news_stub_from_subject(r["subject_id"])
        age = r.get("age_years")
        los = r.get("icu_los_hours")
        out.append(
            StayListRow(
                stay_id=sid,
                display_patient_id=_anon_label(r["subject_id"]),
                age_years=float(age) if age is not None else None,
                gender=r.get("gender"),
                primary_diagnosis=r.get("primary_diagnosis"),
                icu_los_hours=float(los) if los is not None else None,
                news_total=nt,
                news_band=nb,
                is_demo=is_demo,
            )
        )
    return StayListResponse(stays=out)
