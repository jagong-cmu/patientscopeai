from fastapi import APIRouter, HTTPException
from backend.schemas import NewsScoreResponse
from backend.services.news import compute_news_score

router = APIRouter()


@router.get("/{stay_id}", response_model=NewsScoreResponse)
def news_score(stay_id: int):
    """
    National Early Warning Score (NEWS2-aligned, aggregate 0–20) from last-24h charted vitals.
    See docs/news2_mapping.md for itemids and limitations.
    """
    result = compute_news_score(stay_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
    return result
