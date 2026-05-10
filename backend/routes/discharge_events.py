from fastapi import APIRouter, HTTPException

from backend.schemas import DischargeEventCreate, DischargeEventResponse
from backend.services.discharge_events_store import insert_discharge_event

router = APIRouter()


@router.post("", response_model=DischargeEventResponse)
def post_discharge_event(body: DischargeEventCreate):
    """Record where the patient was discharged (requires MongoDB)."""
    try:
        doc = insert_discharge_event(
            stay_id=body.stay_id,
            subject_id=body.subject_id,
            destination=body.destination,
            notes=(body.notes or "").strip() or None,
        )
    except RuntimeError as e:
        msg = str(e)
        if "MONGODB_URI" in msg or "not configured" in msg.lower():
            detail = "Discharge recording requires MONGODB_URI"
        else:
            detail = msg
        raise HTTPException(status_code=503, detail=detail)
    return DischargeEventResponse(
        stay_id=int(doc["stay_id"]),
        subject_id=int(doc["subject_id"]),
        destination=str(doc["destination"]),
        notes=str(doc.get("notes") or ""),
        recorded_at=str(doc["recorded_at"]),
    )
