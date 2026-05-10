export type ReadinessStatus = "green" | "yellow" | "red";

/** UK NEWS2 aggregate clinical band (RCP thresholds on total score). */
export type NewsClinicalBand = "low" | "medium" | "high";

export interface NewsParameterScore {
  name: string;
  label: string;
  points: number;
  value_display: string;
  subscale_note?: string | null;
}

export interface NewsScoreResponse {
  stay_id: number;
  total_score: number;
  clinical_risk_band: NewsClinicalBand;
  parameters: NewsParameterScore[];
  evidence: string[];
  limitations: string[];
  scale_note: string;
}

export interface WardPreviewRow {
  stay_id: number;
  display_patient_id: string;
  news_total: number;
  news_band: NewsClinicalBand;
  icu_los_hours?: number | null;
}

export interface WardSummaryResponse {
  census_count: number;
  bed_capacity: number;
  occupancy_ratio: number;
  pending_admissions_count: number;
  discharge_ready_count: number;
  discharge_queue_preview: WardPreviewRow[];
  high_risk_preview: WardPreviewRow[];
}

export type WardAlertCategory = "lab_trajectory" | "news_context";

export type WardAlertPatientTag = "icu" | "post_monitoring";

export interface WardAlertItem {
  id: string;
  category: WardAlertCategory;
  message: string;
  occurred_at: string;
  stay_id?: number | null;
  tags?: WardAlertPatientTag[];
}

export interface WardAlertsResponse {
  alerts: WardAlertItem[];
}

export interface VitalSeriesPoint {
  charttime_iso: string | null;
  valuenum: number;
}

export interface VitalTimeSeries {
  itemid: number;
  label: string;
  points: VitalSeriesPoint[];
}

export interface VitalsSeriesResponse {
  stay_id: number;
  series: VitalTimeSeries[];
}

export interface WatchlistRow {
  subject_id: number;
  index_stay_id: number;
  display_patient_id: string;
  added_at: string;
  news_total: number;
  news_band: NewsClinicalBand;
  data_freshness_note: string;
}

export interface WatchlistListResponse {
  entries: WatchlistRow[];
}

export type DischargeDestinationCode =
  | "general_ward"
  | "ltach"
  | "nursing_facility"
  | "home"
  | "other";

export interface DischargeEventCreate {
  stay_id: number;
  subject_id: number;
  destination: DischargeDestinationCode;
  notes?: string | null;
}

export interface DischargeEventResponse {
  stay_id: number;
  subject_id: number;
  destination: string;
  notes: string;
  recorded_at: string;
}

export interface RiskDriverFeature {
  feature_key: string;
  label: string;
  direction: string;
  detail: string;
}

export interface RiskDefinition {
  definition: string;
  probability: number;
  confidence_interval: [number, number];
  methodology: string;
  n_train: number;
  explanation?: string | null;
  driver_features?: RiskDriverFeature[];
}

export interface RiskResponse {
  stay_id: number;
  risks: RiskDefinition[];
}

export interface DischargeTimingScenario {
  horizon_hours: number;
  probability: number;
  delta_vs_now?: number | null;
}

export interface DischargeTimingResponse {
  stay_id: number;
  scenarios: DischargeTimingScenario[];
  disclaimer: string;
  methodology_note: string;
  is_placeholder?: boolean;
}

export interface SimilarCase {
  stay_id: number;
  similarity: number;
  readmitted: boolean;
  readmission_definition: string;
  key_differences: string[];
}

export interface GroundingEvidence {
  id: string;
  feature: string;
  finding: string;
  anchor: "news_parameter" | "risk" | "audit" | "trajectory" | null;
}

export interface NarrativeResponse {
  stay_id: number;
  narrative: string;
  similar_cases: SimilarCase[];
  suggestions: string[];
  citations_used?: string[];
  validation_issues?: string[];
  reasoning_skeleton?: Record<string, unknown>;
  grounding_evidence: GroundingEvidence[];
  concordance_signal?: {
    pattern: string;
    rationale: string;
    risk_probability?: number;
  };
}

export interface AuditResponse {
  stay_id: number;
  patient_subgroup: string;
  subgroup_performance: {
    subgroup: string;
    n: number;
    auc: number;
    auc_overall: number;
    calibration_note: string;
  };
  trust_advisory: string;
}

export interface StayListRow {
  stay_id: number;
  display_patient_id: string;
  age_years: number | null;
  gender: string | null;
  primary_diagnosis: string | null;
  icu_los_hours: number | null;
  news_total: number;
  news_band: NewsClinicalBand;
  is_demo: boolean;
}

export interface StayListResponse {
  stays: StayListRow[];
}

export interface VitalsRow {
  itemid: number;
  label: string;
  value: number;
  charttime_iso: string | null;
}

export interface CurrentVitalsResponse {
  stay_id: number;
  vitals: VitalsRow[];
}

export interface PatientSummary {
  stay_id: number;
  subject_id: number;
  hadm_id: number;
  gender: string | null;
  age_years: number | null;
  race: string | null;
  insurance: string | null;
  icu_in: string;
  icu_out: string;
  icu_los_hours: number | null;
  hospital_los_hours: number | null;
  first_careunit: string | null;
  discharge_location: string | null;
  hospital_expire_flag: number | null;
  primary_diagnosis: string | null;
  /** Recorded ICU discharge in app (Mongo); patient leaves ward census roster. */
  discharged_from_icu?: boolean;
  /** On post-monitoring watchlist (Mongo). */
  post_monitoring?: boolean;
}
