"""
Phase 4 AI narrative layer.

Two-stage pipeline:
1) Synthesis agent: produces a structured reasoning skeleton (JSON).
2) Narrative agent: produces clinician-readable prose with bracket citations [ev_...].
3) Guardrails: deterministic validation of citations + forbidden patterns (strict retry).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

import anthropic

from backend.schemas import GroundingEvidence, NarrativeResponse, SimilarCase
from backend.services.models import predict_risk
from backend.services.mongo import find_similar_cases
from backend.services.mimic import get_patient_summary
from backend.services.news import compute_news_score
from backend.services.ward_context import get_ward_operational_context


ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / ".cache" / "narratives"


def _anthropic_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def _model_name() -> str:
    return os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")


def _hash_json(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, ensure_ascii=False, default=_json_default).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()

def _json_default(o: Any):
    # psycopg may return Decimal for some numeric fields
    try:
        import decimal

        if isinstance(o, decimal.Decimal):
            return float(o)
    except Exception:
        pass
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return str(o)


def _safe_mkdir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _citation_ids_from_text(text: str) -> list[str]:
    return re.findall(r"\[(ev_[a-zA-Z0-9_]+)\]", text)


def _split_sentences(text: str) -> list[str]:
    # Lightweight sentence split; good enough for guardrails.
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _has_citation(sentence: str) -> bool:
    return bool(re.search(r"\[ev_[a-zA-Z0-9_]+\]", sentence))


def _looks_like_clinical_claim(sentence: str) -> bool:
    # Heuristic: if it contains a number/unit/percent or common clinical tokens, treat as claim.
    if re.search(r"\d", sentence):
        return True
    keywords = [
        "stable",
        "trend",
        "increasing",
        "decreasing",
        "vasopressor",
        "lactate",
        "creatinine",
        "readmission",
        "risk",
        "discharge",
        "icu",
        "map",
        "spo2",
        "wbc",
        "bun",
    ]
    s = sentence.lower()
    return any(k in s for k in keywords)


def validate_narrative(narrative_text: str, evidence_ids_in_input: set[str]) -> tuple[bool, list[str]]:
    issues: list[str] = []

    cited = _citation_ids_from_text(narrative_text)
    for cid in cited:
        if cid not in evidence_ids_in_input:
            issues.append(f"Narrative cites {cid} but it does not exist in evidence.")

    forbidden = [
        (r"\bwill be readmitted\b", "Predicts readmission outcome"),
        (r"\bwill not be readmitted\b", "Predicts readmission outcome"),
        (r"\bmust\b", "Uses directive language"),
        (r"\bshould\b(?!\s+consider\b)", "Uses directive language"),
        (r"\bexcellent care\b", "Makes care quality judgment"),
        (r"\bsubstandard care\b", "Makes care quality judgment"),
        (r"\binadequate care\b", "Makes care quality judgment"),
    ]
    for pat, msg in forbidden:
        if re.search(pat, narrative_text, re.IGNORECASE):
            issues.append(msg)

    words = len(narrative_text.split())
    if words > 350:
        issues.append("Narrative exceeds 350 word limit")

    for sent in _split_sentences(narrative_text):
        if _looks_like_clinical_claim(sent) and not _has_citation(sent):
            issues.append(f"Clinical-claim sentence missing citation: {sent[:120]}")

    return (len(issues) == 0), issues


def validate_final_recommendations(text: str, evidence_ids_in_input: set[str]) -> tuple[bool, list[str]]:
    """Stricter citation rules like the main narrative; allows directional discharge language."""
    issues: list[str] = []

    cited = _citation_ids_from_text(text)
    for cid in cited:
        if cid not in evidence_ids_in_input:
            issues.append(f"Final recommendations cite {cid} but it does not exist in evidence.")

    forbidden = [
        (r"\bwill be readmitted\b", "Predicts readmission outcome"),
        (r"\bwill not be readmitted\b", "Predicts readmission outcome"),
        (r"\bexcellent care\b", "Makes care quality judgment"),
        (r"\bsubstandard care\b", "Makes care quality judgment"),
        (r"\binadequate care\b", "Makes care quality judgment"),
    ]
    for pat, msg in forbidden:
        if re.search(pat, text, re.IGNORECASE):
            issues.append(msg)

    words = len(text.split())
    if words > 220:
        issues.append("Final recommendations exceed 220 word limit")

    for sent in _split_sentences(text):
        if _looks_like_clinical_claim(sent) and not _has_citation(sent):
            issues.append(f"Clinical-claim sentence missing citation: {sent[:120]}")

    return (len(issues) == 0), issues


def _grounding_anchor(evidence_row: dict) -> str | None:
    eid = evidence_row.get("id", "")
    if eid == "ev_risk_72h_unplanned_icu":
        return "risk"
    if isinstance(eid, str) and eid.startswith("ev_news"):
        return "news_parameter"
    return None


def _grounding_evidence_list(structured: dict) -> list[GroundingEvidence]:
    out: list[GroundingEvidence] = []
    for e in structured.get("evidence", []):
        out.append(
            GroundingEvidence(
                id=e["id"],
                feature=e.get("feature", ""),
                finding=e.get("finding", ""),
                anchor=_grounding_anchor(e),
            )
        )
    return out


def _compute_concordance_news(news_band: str, risk_prob: float | None) -> dict:
    prob = risk_prob if risk_prob is not None else 0.0
    if news_band == "low" and prob >= 0.25:
        pattern = "discordant_risk"
        rationale = "NEWS aggregate is low, but the 72h ICU Readmission Score is elevated."
    elif news_band in ("medium", "high") and prob >= 0.25:
        pattern = "aligned_concern"
        rationale = "Elevated NEWS aligns with an elevated 72h ICU Readmission Score."
    elif news_band in ("medium", "high") and prob < 0.25:
        pattern = "monitoring_focus"
        rationale = "NEWS suggests physiological concern though near-term readmission risk estimate is not markedly elevated."
    else:
        pattern = "lower_concern"
        rationale = "NEWS aggregate and readmission risk estimates are not strongly discordant."
    return {"pattern": pattern, "rationale": rationale, "risk_probability": prob}


def build_structured_input(stay_id: int) -> dict:
    patient = get_patient_summary(stay_id)
    news = compute_news_score(stay_id)
    risk = predict_risk(stay_id)
    try:
        similar = find_similar_cases(stay_id)
    except Exception:
        similar = []

    if not patient or not news or not risk:
        raise ValueError(f"stay_id {stay_id} not found")

    evidence: list[dict] = []

    for p in news.parameters:
        evid = {
            "id": f"ev_news_{p.name}",
            "feature": p.label,
            "finding": f"{p.label}: {p.value_display} ({p.points} point(s))",
            "severity": news.clinical_risk_band,
            "source_query": "backend/services/news.py (NEWS2-aligned)",
            "source_data": {
                "points": p.points,
                "value_display": p.value_display,
                "subscale_note": p.subscale_note,
            },
        }
        evidence.append(evid)

    risk_def = risk.risks[0] if risk.risks else None
    if risk_def:
        evidence.append(
            {
                "id": "ev_risk_72h_unplanned_icu",
                "feature": "risk_72h_unplanned_icu",
                "finding": f"72h ICU Readmission Score probability {risk_def.probability:.3f}",
                "severity": "info",
                "source_query": "backend/services/models.py (trained model)",
                "source_data": {
                    "probability": risk_def.probability,
                    "confidence_interval": list(risk_def.confidence_interval),
                    "n_train": risk_def.n_train,
                },
            }
        )

    concordance = _compute_concordance_news(news.clinical_risk_band, risk_def.probability if risk_def else None)

    structured = {
        "icu_stay_id": str(stay_id),
        "context": {
            "demographics": {
                "age_years": patient.get("age_years"),
                "gender": patient.get("gender"),
                "race": patient.get("race"),
                "insurance": patient.get("insurance"),
            },
            "icu_los_hours": patient.get("icu_los_hours"),
            "first_careunit": patient.get("first_careunit"),
            "discharge_disposition": patient.get("discharge_location"),
            "ward_operational": get_ward_operational_context(),
        },
        "news": {
            "total_score": news.total_score,
            "clinical_risk_band": news.clinical_risk_band,
            "limitations": news.limitations,
            "scale_note": news.scale_note,
            "parameters": [
                {
                    "name": p.name,
                    "label": p.label,
                    "points": p.points,
                    "value_display": p.value_display,
                    "evidence_id": f"ev_news_{p.name}",
                }
                for p in news.parameters
            ],
        },
        "risk_predictions": {
            "definition": risk_def.definition if risk_def else None,
            "probability": risk_def.probability if risk_def else None,
            "confidence_interval": list(risk_def.confidence_interval) if risk_def else None,
            "training_n": risk_def.n_train if risk_def else None,
            "methodology": risk_def.methodology if risk_def else None,
            "evidence_id": "ev_risk_72h_unplanned_icu" if risk_def else None,
        },
        "similar_cases": [c.model_dump() if hasattr(c, "model_dump") else dict(c) for c in similar],
        "concordance_signal": concordance,
        "evidence": evidence,
    }
    return structured


def run_synthesis_agent(structured_input: dict) -> dict:
    client = _anthropic_client()

    evidence_ids = [e["id"] for e in structured_input.get("evidence", [])]
    system = (
        "You are a clinical reasoning assistant analyzing an ICU stay using NEWS (National Early Warning Score) "
        "and readmission risk context. You MUST output valid JSON only."
    )
    user = {
        "task": "Produce a reasoning skeleton JSON.",
        "constraints": [
            "Use only information present in the structured input.",
            "Every claim must cite evidence IDs in square brackets like [ev_...].",
            f"Valid evidence IDs: {evidence_ids}",
            "Do NOT write prose paragraphs.",
            "Weigh context.ward_operational when reasoning about disposition urgency: crowded ICU + pending admissions increases pressure to prioritize stable transfers.",
        ],
        "required_fields": [
            "headline_finding",
            "supporting_findings",
            "concordance_interpretation",
            "key_uncertainties",
            "recommended_action_categories",
        ],
        "structured_input": structured_input,
    }

    resp = client.messages.create(
        model=_model_name(),
        max_tokens=800,
        system=system,
        messages=[{"role": "user", "content": json.dumps(user, default=_json_default)}],
    )
    txt = (resp.content[0].text or "").strip()

    # Claude may wrap JSON in ```json fences. Extract the first top-level object.
    if "```" in txt:
        txt = re.sub(r"^```[a-zA-Z0-9_+-]*\s*", "", txt)
        txt = re.sub(r"\s*```$", "", txt)
        txt = txt.strip()

    start = txt.find("{")
    end = txt.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"Synthesis agent did not return JSON object. Got: {txt[:200]}")
    return json.loads(txt[start : end + 1])


def run_narrative_agent(structured_input: dict, skeleton: dict, issues: list[str] | None = None) -> str:
    client = _anthropic_client()
    evidence_ids = [e["id"] for e in structured_input.get("evidence", [])]

    system = (
        "You are a clinical communications assistant. "
        "Write clinician-oriented prose with bracket citations. Do not invent facts."
    )

    prompt = {
        "task": (
            "Write a 3–5 paragraph ICU narrative (200–300 words) integrating NEWS, readmission risk, "
            "and ICU bed availability / pending admissions from structured_input.context.ward_operational."
        ),
        "constraints": [
            "Every clinical claim must cite an evidence ID in square brackets like [ev_...].",
            "Use only evidence IDs listed; do not fabricate.",
            "Use deferential language: 'consider', 'may benefit from'. Never directive 'must/should'.",
            "Do not predict outcomes (no 'will be readmitted').",
            "Where ICU capacity is constrained (few available beds and/or significant pending admissions), "
            "tie disposition reasoning explicitly to throughput pressure — still grounded in cited evidence.",
            f"Valid evidence IDs: {evidence_ids}",
        ],
        "structured_input": structured_input,
        "reasoning_skeleton": skeleton,
    }
    if issues:
        prompt["revision_instructions"] = {
            "issues_found_by_validator": issues,
            "fix": "Revise the narrative to address each issue while preserving grounded citations.",
        }

    resp = client.messages.create(
        model=_model_name(),
        max_tokens=800,
        system=system,
        messages=[{"role": "user", "content": json.dumps(prompt, default=_json_default)}],
    )
    return resp.content[0].text


def run_final_recommendations_agent(
    structured_input: dict,
    skeleton: dict,
    narrative: str,
    issues: list[str] | None = None,
) -> str:
    """Directional discharge lean (not a substitute for clinician judgment)."""
    client = _anthropic_client()
    evidence_ids = [e["id"] for e in structured_input.get("evidence", [])]

    system = (
        "You are a clinical communications assistant. "
        "Produce concise directional guidance only — not definitive orders. "
        "Every factual clinical claim must cite evidence IDs in brackets."
    )

    prompt = {
        "task": (
            "Write ONE section (80–180 words) that answers: given cited NEWS and 72h readmission risk, "
            "does the balance of evidence lean toward proceeding with discharge planning / step-down, "
            "toward holding or optimizing care in ICU first, or is the picture mixed? "
            "State the lean clearly and give brief reasoning. "
            "Reference structured_input.context.ward_operational when ICU capacity affects throughput tradeoffs."
        ),
        "constraints": [
            "Use bracket citations [ev_...] for every sentence that states a numeric risk, NEWS contribution, or comparable factual claim.",
            f"Valid evidence IDs only: {evidence_ids}",
            "Use conditional language where appropriate (e.g., consider, may warrant, leans toward).",
            "Do not predict individual outcomes (no 'will be readmitted').",
            "Do not claim the model is definitive — this supports clinician judgment.",
            "Optional: 1–2 short paragraphs separated by a blank line.",
        ],
        "structured_input": structured_input,
        "reasoning_skeleton": skeleton,
        "prior_narrative_for_context": narrative[:1200],
    }
    if issues:
        prompt["revision_instructions"] = {
            "issues_found_by_validator": issues,
            "fix": "Revise final recommendations only; keep citations valid.",
        }

    resp = client.messages.create(
        model=_model_name(),
        max_tokens=500,
        system=system,
        messages=[{"role": "user", "content": json.dumps(prompt, default=_json_default)}],
    )
    return resp.content[0].text


def generate_narrative_with_guardrails(stay_id: int, max_retries: int = 2) -> NarrativeResponse:
    structured = build_structured_input(stay_id)
    evidence_ids = {e["id"] for e in structured.get("evidence", [])}

    cache_key = _hash_json(
        {
            "stay_id": stay_id,
            "structured": structured,
            "model": _model_name(),
            "format_version": "final_recommendations_v1",
        }
    )
    cache_path = CACHE_DIR / f"{cache_key}.json"
    _safe_mkdir(CACHE_DIR)
    if cache_path.exists():
        cached = json.loads(cache_path.read_text())
        return NarrativeResponse(**cached)

    skeleton = run_synthesis_agent(structured)

    issues: list[str] = []
    narrative = ""
    for attempt in range(max_retries + 1):
        narrative = run_narrative_agent(structured, skeleton, issues if attempt > 0 else None)
        ok, issues = validate_narrative(narrative, evidence_ids)
        if ok:
            break

    fr_issues: list[str] = []
    final_recommendations = ""
    for attempt in range(max_retries + 1):
        final_recommendations = run_final_recommendations_agent(
            structured,
            skeleton,
            narrative,
            fr_issues if attempt > 0 else None,
        )
        ok_fr, fr_issues = validate_final_recommendations(final_recommendations, evidence_ids)
        if ok_fr:
            break

    citations_used = sorted(
        set(_citation_ids_from_text(narrative)) | set(_citation_ids_from_text(final_recommendations))
    )
    suggestions = []
    for p in structured["news"]["parameters"]:
        if int(p.get("points", 0)) >= 2:
            eid = p.get("evidence_id") or f"ev_news_{p.get('name', '')}"
            suggestions.append(f"Consider clinical review of {p.get('label', 'parameter')} — see [{eid}]")

    combined_issues = list(issues or []) + list(fr_issues or [])
    result = NarrativeResponse(
        stay_id=stay_id,
        narrative=narrative,
        final_recommendations=final_recommendations if final_recommendations.strip() else None,
        similar_cases=[SimilarCase(**c) if isinstance(c, dict) else c for c in structured.get("similar_cases", [])],
        suggestions=suggestions,
        citations_used=citations_used,
        validation_issues=combined_issues if combined_issues else None,
        reasoning_skeleton=skeleton,
        grounding_evidence=_grounding_evidence_list(structured),
        concordance_signal=structured.get("concordance_signal"),
    )

    cache_path.write_text(result.model_dump_json(indent=2) if hasattr(result, "model_dump_json") else json.dumps(result.dict(), indent=2))
    return result

