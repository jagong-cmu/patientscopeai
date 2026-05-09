from fastapi import APIRouter, HTTPException
from backend.schemas import NarrativeResponse
from backend.services.narrative_layer import generate_narrative_with_guardrails

router = APIRouter()


@router.get("/{stay_id}", response_model=NarrativeResponse)
def clinical_narrative(stay_id: int):
    """
    Generate a Claude-powered clinical narrative for a patient's discharge assessment.
    Every claim in the narrative is grounded in patient-specific data values.
    Also returns similar historical cases and actionable decision support suggestions.
    """
    try:
        return generate_narrative_with_guardrails(stay_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"stay_id {stay_id} not found")
