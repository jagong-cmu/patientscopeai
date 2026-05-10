from pydantic import BaseModel, Field
from typing import Any, Literal, Optional

WardAlertPatientTag = Literal["icu", "post_monitoring"]


class NewsParameterScore(BaseModel):
    """Single NEWS2 parameter row (RCP NEWS2 aggregate chart)."""
    name: str                   # machine key e.g. respiratory_rate
    label: str                  # display label
    points: int                 # 0–3 per parameter
    value_display: str          # human-readable value or em dash
    subscale_note: Optional[str] = None


class NewsScoreResponse(BaseModel):
    stay_id: int
    total_score: int            # 0–20 aggregate
    clinical_risk_band: Literal["low", "medium", "high"]
    parameters: list[NewsParameterScore]
    evidence: list[str]
    limitations: list[str]
    scale_note: str


class RiskDriverFeature(BaseModel):
    """One top-weighted input vs training cohort (descriptive, not causal)."""
    feature_key: str
    label: str
    direction: str              # "higher" | "lower" | "typical"
    detail: str                 # short comparison vs cohort median


class RiskDefinition(BaseModel):
    definition: str             # e.g. "7-day ICU bounce-back"
    probability: float
    confidence_interval: tuple[float, float]
    methodology: str            # brief description of training cohort + model
    n_train: int
    explanation: Optional[str] = None
    driver_features: list[RiskDriverFeature] = Field(default_factory=list)


class DischargeTimingScenario(BaseModel):
    horizon_hours: float
    probability: float
    delta_vs_now: Optional[float] = None  # None when horizon is 0


class DischargeTimingResponse(BaseModel):
    stay_id: int
    scenarios: list[DischargeTimingScenario]
    disclaimer: str
    methodology_note: str
    is_placeholder: bool = False


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
    anchor: Optional[Literal["news_parameter", "risk", "audit", "trajectory"]] = None


class NarrativeResponse(BaseModel):
    stay_id: int
    narrative: str              # Claude-generated prose (insights section)
    final_recommendations: Optional[str] = None  # directional discharge lean + reasoning (citations)
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


class WardPreviewRow(BaseModel):
    stay_id: int
    display_patient_id: str    # five-digit anonymized id (no "Patient" prefix)
    patient_name: str          # deterministic synthetic full name
    news_total: int
    news_band: Literal["low", "medium", "high"]
    icu_los_hours: Optional[float] = None
    readmission_risk_72h: Optional[float] = None


class WardSummaryResponse(BaseModel):
    census_count: int
    bed_capacity: int
    occupancy_ratio: float
    pending_admissions_count: int
    discharge_ready_count: int
    discharge_queue_preview: list[WardPreviewRow]
    high_risk_preview: list[WardPreviewRow]


class WardAlertItem(BaseModel):
    id: str
    category: Literal["lab_trajectory", "news_context", "demo_simulation"]
    message: str
    occurred_at: str
    stay_id: Optional[int] = None
    tags: list[WardAlertPatientTag] = Field(default_factory=list)


class WardAlertsResponse(BaseModel):
    alerts: list[WardAlertItem]


class VitalSeriesPoint(BaseModel):
    charttime_iso: Optional[str] = None
    valuenum: float


class VitalTimeSeries(BaseModel):
    itemid: int
    label: str
    points: list[VitalSeriesPoint]


class VitalsSeriesResponse(BaseModel):
    stay_id: int
    series: list[VitalTimeSeries]


class WatchlistCreate(BaseModel):
    subject_id: int
    index_stay_id: int


class WatchlistRow(BaseModel):
    subject_id: int
    index_stay_id: int
    display_patient_id: str
    patient_name: str
    added_at: str
    news_total: int
    news_band: Literal["low", "medium", "high"]
    data_freshness_note: str


class WatchlistListResponse(BaseModel):
    entries: list[WatchlistRow]


DischargeDestinationCode = Literal["general_ward", "ltach", "nursing_facility", "home", "other"]


class DischargeEventCreate(BaseModel):
    """Clinician-recorded discharge destination (demo persistence)."""
    stay_id: int
    subject_id: int
    destination: DischargeDestinationCode
    notes: Optional[str] = None


class DischargeEventResponse(BaseModel):
    stay_id: int
    subject_id: int
    destination: str
    notes: str
    recorded_at: str


class StayListRow(BaseModel):
    stay_id: int
    display_patient_id: str     # five-digit anonymized id
    patient_name: str           # deterministic synthetic full name
    age_years: Optional[float]
    gender: Optional[str]
    primary_diagnosis: Optional[str]
    icu_los_hours: Optional[float]
    news_total: int             # aggregate NEWS 0–20
    news_band: Literal["low", "medium", "high"]
    readmission_risk_72h: Optional[float] = None
    is_demo: bool


class StayListResponse(BaseModel):
    stays: list[StayListRow]
    pending_icu_stays: list[StayListRow] = Field(default_factory=list)


class VitalsRow(BaseModel):
    """Latest charted value per vital sign item within the ICU stay window."""
    itemid: int
    label: str
    value: float
    charttime_iso: Optional[str] = None


class CurrentVitalsResponse(BaseModel):
    stay_id: int
    vitals: list[VitalsRow]
