"""Claude API client for clinical narrative generation."""
import os
import anthropic
from backend.schemas import NarrativeResponse, ReadinessResponse, RiskResponse, SimilarCase

_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are a clinical decision support assistant helping ICU clinicians at the moment of discharge.

Your role is to synthesize a patient's readiness assessment into a clear, evidence-grounded clinical narrative.

Rules you must follow:
- Every clinical claim must reference a specific data value from the patient's record
- Use precise clinical language appropriate for an ICU attending
- Acknowledge uncertainty explicitly — never overstate confidence
- Never recommend a specific course of action as if you were the clinician; always frame as "consider" or "may warrant"
- Never predict whether a patient WILL be readmitted — only describe risk patterns
- Always end with: "This assessment is decision support only. Clinical judgment remains with the care team."
- If data is sparse, say so explicitly rather than fabricating claims
"""


def generate_narrative(
    stay_id: int,
    readiness: ReadinessResponse,
    risk: RiskResponse,
    similar_cases: list[SimilarCase],
) -> NarrativeResponse:
    # Build structured context for Claude
    readiness_summary = "\n".join(
        f"  - {c.label} [{c.status.upper()}] ({c.score:.2f}): {'; '.join(c.evidence)}"
        for c in readiness.components
    )

    risk_summary = "\n".join(
        f"  - {r.definition}: {r.probability:.1%} risk"
        f" (trained on {r.n_train} patients, {r.methodology})"
        for r in risk.risks
    )

    similar_summary = "\n".join(
        f"  - stay_id {c.stay_id} (similarity {c.similarity:.2f}): "
        f"{'READMITTED' if c.readmitted else 'not readmitted'} — {'; '.join(c.key_differences)}"
        for c in similar_cases[:5]
    ) or "  - No similar cases found in training cohort"

    user_message = f"""Generate a clinical narrative for ICU stay {stay_id}.

READINESS SCORE: {readiness.composite_status.upper()} ({readiness.composite_score:.2f})
{readiness_summary}

MULTI-DEFINITION READMISSION RISK:
{risk_summary}

SIMILAR HISTORICAL CASES:
{similar_summary}

Write a 150-200 word clinical narrative that:
1. Opens with the overall discharge readiness assessment
2. Highlights the 1-2 most clinically significant findings driving the assessment
3. Interprets the readmission risk pattern in light of the most similar historical cases
4. Closes with 2-3 specific considerations for the discharge team (framed as "consider")
5. Ends with the mandatory disclaimer

Cite specific data values from the readiness summary above — do not make up numbers."""

    response = _client.messages.create(
        model=MODEL,
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    narrative_text = response.content[0].text

    # Derive suggestions from yellow/red components
    suggestions = [
        f"Consider {_suggestion_for(c)}"
        for c in readiness.components
        if c.status in ("yellow", "red")
    ]

    return NarrativeResponse(
        stay_id=stay_id,
        narrative=narrative_text,
        similar_cases=similar_cases,
        suggestions=suggestions,
    )


def _suggestion_for(component) -> str:
    mapping = {
        "Physiological Stability": "monitoring vital signs closely for 24h post-transfer",
        "Laboratory Trajectory":   "repeat labs within 12h of transfer, particularly renal function",
        "Medication Readiness":    "pharmacist review of discharge medication regimen before transfer",
        "Care Continuity":         "scheduling follow-up within 7 days and confirming patient has a contact for concerns",
    }
    return mapping.get(component.label, f"additional review of {component.label.lower()}")
