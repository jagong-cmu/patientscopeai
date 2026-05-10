from fastapi import APIRouter, HTTPException

from backend.schemas import CurrentVitalsResponse, VitalsSeriesResponse
from backend.services.current_vitals import build_current_vitals, build_vitals_series

router = APIRouter()


@router.get("/{stay_id}/series", response_model=VitalsSeriesResponse)
def vitals_series(stay_id: int):
    result = build_vitals_series(stay_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Stay not found")
    return result


@router.get("/{stay_id}", response_model=CurrentVitalsResponse)
def current_vitals(stay_id: int):
    result = build_current_vitals(stay_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Stay not found")
    return result
