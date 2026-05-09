import os

from fastapi import APIRouter

from backend.schemas import StayListResponse, StayListRow
from backend.services.mimic import list_icu_stays
from backend.services.scoring import compute_readiness_score

router = APIRouter()

STAY_LIST_LIMIT = 15
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
    """ICU stays (los >= 1) for dashboard; demo row gets computed readiness, others stub."""
    demo_id = _demo_stay_id()
    rows = list_icu_stays(STAY_LIST_LIMIT)
    out: list[StayListRow] = []
    for r in rows:
        sid = r["stay_id"]
        is_demo = sid == demo_id
        if is_demo:
            rr = compute_readiness_score(sid)
            rs = rr.composite_status if rr else "yellow"
        else:
            rs = ["green", "yellow", "red"][r["subject_id"] % 3]
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
                readiness_status=rs,
                is_demo=is_demo,
            )
        )
    return StayListResponse(stays=out)
