from fastapi import APIRouter, HTTPException
from backend.schemas import RiskResponse
from backend.services.models import predict_risk

router = APIRouter()


@router.get("/{stay_id}", response_model=RiskResponse)
def risk_panel(stay_id: int):
    """
    Return risk under an explicit, single definition:

    - 72-hour unplanned ICU readmission after hospital discharge (proxy)
    """
    result = predict_risk(stay_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
    return result
