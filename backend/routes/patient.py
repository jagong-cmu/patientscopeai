from fastapi import APIRouter, HTTPException
from backend.services.discharge_events_store import get_discharged_stay_ids
from backend.services.mimic import get_patient_summary
from backend.services.watchlist_store import is_subject_on_watchlist

router = APIRouter()


@router.get("/{stay_id}")
def patient_summary(stay_id: int):
    """Return basic patient and ICU stay info for a given stay_id."""
    data = get_patient_summary(stay_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
    out = dict(data)
    sid = int(out["subject_id"])
    out["discharged_from_icu"] = stay_id in get_discharged_stay_ids()
    out["post_monitoring"] = is_subject_on_watchlist(sid)
    return out
