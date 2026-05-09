from pydantic import BaseModel, Field
from typing import Any, Literal, Optional


class ComponentScore(BaseModel):
    label: str                  # e.g. "Physiological Stability"
    score: float                # 0.0 – 1.0
    status: str                 # "green" | "yellow" | "red"
    evidence: list[str]         # human-readable data points driving this score


class ReadinessResponse(BaseModel):
    stay_id: int
    composite_score: float
    composite_status: str       # "green" | "yellow" | "red"
    components: list[ComponentScore]


class RiskDefinition(BaseModel):
    definition: str             # e.g. "7-day ICU bounce-back"
    probability: float
    confidence_interval: tuple[float, float]
    methodology: str            # brief description of training cohort + model
    n_train: int


class RiskResponse(BaseModel):
    stay_id: int
    risks: list[RiskDefinition]


class SimilarCase(BaseModel):
    stay_id: int
    similarity: float
    readmitted: bool
    readmission_definition: str
    key_differences: list[str]


class GroundingEvidence(BaseModel):
    """Evidence row for UI citation linking (subset of narrative structured_input evidence)."""
    id: str
    feature: str
    finding: str
    anchor: Optional[Literal["readiness_component", "risk", "audit", "trajectory"]] = None


class NarrativeResponse(BaseModel):
    stay_id: int
    narrative: str              # Claude-generated clinical narrative
    similar_cases: list[SimilarCase]
    suggestions: list[str]      # actionable, not directive
    citations_used: Optional[list[str]] = None
    validation_issues: Optional[list[str]] = None
    reasoning_skeleton: Optional[dict] = None
    grounding_evidence: list[GroundingEvidence] = Field(default_factory=list)
    concordance_signal: Optional[dict[str, Any]] = None


class SubgroupPerformance(BaseModel):
    subgroup: str               # e.g. "Black female patients, age 65–80"
    n: int
    auc: float
    auc_overall: float
    calibration_note: str       # plain-language calibration summary


class AuditResponse(BaseModel):
    stay_id: int
    patient_subgroup: str
    subgroup_performance: SubgroupPerformance
    trust_advisory: str         # e.g. "Model tends to underpredict risk in this subgroup"


class StayListRow(BaseModel):
    stay_id: int
    display_patient_id: str     # anonymized label e.g. Patient 10001
    age_years: Optional[float]
    gender: Optional[str]
    primary_diagnosis: Optional[str]
    icu_los_hours: Optional[float]
    readiness_status: str       # green | yellow | red (demo row computed; others stub)
    is_demo: bool


class StayListResponse(BaseModel):
    stays: list[StayListRow]


class TrajectoryPoint(BaseModel):
    t_hours: float              # hours since ICU admission (intime)
    y: float


class TrajectoryForecast(BaseModel):
    """Illustrative forward projection — not a validated clinical forecast."""
    t_hours: list[float]
    mean: list[float]
    lower: list[float]
    upper: list[float]


class TrajectorySeries(BaseModel):
    series_id: str
    label: str
    unit: str
    points: list[TrajectoryPoint]
    normal_low: Optional[float] = None
    normal_high: Optional[float] = None
    trend_label: str            # e.g. "Stabilizing", "Continuing to rise"
    forecast: Optional[TrajectoryForecast] = None
    discharge_t_hours: Optional[float] = None  # hours from intime to ICU out


class TrajectoryResponse(BaseModel):
    stay_id: int
    intime_iso: Optional[str] = None
    outtime_iso: Optional[str] = None
    disclaimer: str
    series: list[TrajectorySeries]
