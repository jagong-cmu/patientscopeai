from fastapi import APIRouter, HTTPException
from backend.schemas import AuditResponse
from backend.services.models import get_subgroup_audit

router = APIRouter()


@router.get("/{stay_id}", response_model=AuditResponse)
def bias_audit(stay_id: int):
    """
    Return subgroup model performance for the patient's demographic profile.
    Surfaces AUC and calibration relative to overall model performance,
    with a plain-language trust advisory for the clinician.
    """
    result = get_subgroup_audit(stay_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
    return result
