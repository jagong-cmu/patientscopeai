from fastapi import APIRouter, HTTPException
from backend.schemas import ReadinessResponse
from backend.services.scoring import compute_readiness_score

router = APIRouter()


@router.get("/{stay_id}", response_model=ReadinessResponse)
def readiness_score(stay_id: int):
    """
    Compute composite discharge readiness score for a given ICU stay.
    Returns four components: physiological stability, lab trajectory,
    medication readiness, and care continuity.
    """
    result = compute_readiness_score(stay_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
    return result
