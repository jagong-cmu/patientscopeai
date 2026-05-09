from fastapi import APIRouter, HTTPException
from backend.services.mimic import get_patient_summary

router = APIRouter()


@router.get("/{stay_id}")
def patient_summary(stay_id: int):
    """Return basic patient and ICU stay info for a given stay_id."""
    data = get_patient_summary(stay_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
    return data
