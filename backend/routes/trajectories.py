from fastapi import APIRouter, HTTPException

from backend.schemas import TrajectoryResponse
from backend.services.trajectories import build_trajectory_response

router = APIRouter()


@router.get("/{stay_id}", response_model=TrajectoryResponse)
def trajectories(stay_id: int):
    """Hourly observed labs/vitals + illustrative forward bands (see disclaimer)."""
    result = build_trajectory_response(stay_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
    return result
