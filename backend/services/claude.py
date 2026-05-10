"""Claude API client for clinical narrative generation."""
import os
import anthropic
from backend.schemas import NarrativeResponse, NewsScoreResponse, RiskResponse, SimilarCase

_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are a clinical decision support assistant helping ICU clinicians at the moment of discharge.

Your role is to synthesize a patient's NEWS assessment and risk context into a clear, evidence-grounded clinical narrative.

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
    news: NewsScoreResponse,
    risk: RiskResponse,
    similar_cases: list[SimilarCase],
) -> NarrativeResponse:
    news_summary = "\n".join(
        f"  - {p.label}: {p.value_display} ({p.points} pts)"
        for p in news.parameters
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

NEWS AGGREGATE: {news.total_score} (clinical band: {news.clinical_risk_band.upper()})
{news_summary}

LIMITATIONS: {'; '.join(news.limitations[:5])}

MULTI-DEFINITION READMISSION RISK:
{risk_summary}

SIMILAR HISTORICAL CASES:
{similar_summary}

Write a 150-200 word clinical narrative that:
1. Opens with the NEWS aggregate and clinical risk band
2. Highlights the 1-2 most clinically significant physiological parameters
3. Interprets the readmission risk pattern in light of the most similar historical cases
4. Closes with 2-3 specific considerations for the care team (framed as "consider")
5. Ends with the mandatory disclaimer

Cite specific data values from the NEWS summary above — do not make up numbers."""

    response = _client.messages.create(
        model=MODEL,
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    narrative_text = response.content[0].text

    suggestions = [
        f"Consider clinical review of {p.label} ({p.points} NEWS point(s))"
        for p in news.parameters
        if p.points >= 2
    ]

    return NarrativeResponse(
        stay_id=stay_id,
        narrative=narrative_text,
        similar_cases=similar_cases,
        suggestions=suggestions,
    )


