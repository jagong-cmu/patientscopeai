from fastapi import APIRouter, HTTPException
from backend.schemas import DischargeTimingResponse, RiskResponse
from backend.services.discharge_timing import compute_discharge_timing
from backend.services.models import predict_risk

router = APIRouter()


@router.get("/{stay_id}/discharge-timing", response_model=DischargeTimingResponse)
def discharge_timing_panel(stay_id: int):
    """
    Sensitivity of the 72h readmission risk estimate if discharge were delayed
    (counterfactual feature adjustments — see response methodology_note).
    """
    result = compute_discharge_timing(stay_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
    return result


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
