export type ReadinessStatus = "green" | "yellow" | "red";

export interface ComponentScore {
  label: string;
  score: number;
  status: ReadinessStatus;
  evidence: string[];
}

export interface ReadinessResponse {
  stay_id: number;
  composite_score: number;
  composite_status: ReadinessStatus;
  components: ComponentScore[];
}

export interface RiskDefinition {
  definition: string;
  probability: number;
  confidence_interval: [number, number];
  methodology: string;
  n_train: number;
}

export interface RiskResponse {
  stay_id: number;
  risks: RiskDefinition[];
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
  anchor: "readiness_component" | "risk" | "audit" | "trajectory" | null;
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
  readiness_status: ReadinessStatus;
  is_demo: boolean;
}

export interface StayListResponse {
  stays: StayListRow[];
}

export interface TrajectoryPoint {
  t_hours: number;
  y: number;
}

export interface TrajectoryForecast {
  t_hours: number[];
  mean: number[];
  lower: number[];
  upper: number[];
}

export interface TrajectorySeries {
  series_id: string;
  label: string;
  unit: string;
  points: TrajectoryPoint[];
  normal_low: number | null;
  normal_high: number | null;
  trend_label: string;
  forecast: TrajectoryForecast | null;
  discharge_t_hours: number | null;
}

export interface TrajectoryResponse {
  stay_id: number;
  intime_iso: string | null;
  outtime_iso: string | null;
  disclaimer: string;
  series: TrajectorySeries[];
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
}
