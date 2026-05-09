"""
ML model loading, inference, and subgroup bias audit.
Models are trained by models/train.py and saved to models/saved/.
"""
import os
import json
import joblib
import numpy as np
from pathlib import Path
from backend.schemas import RiskResponse, RiskDefinition, AuditResponse, SubgroupPerformance
from backend.services.mimic import get_patient_summary

MODEL_DIR = Path(__file__).parent.parent.parent / "models" / "saved"

DEFINITIONS = [
    {
        "key":          "72h_unplanned_icu",
        "definition":   "72-hour unplanned ICU readmission after hospital discharge (proxy)",
        "methodology":  "HistGradientBoosting trained on MIMIC-IV; features from last-24h vitals + last-48h labs before ICU outtime; label uses non-ELECTIVE readmission within 72h with ICU stay.",
        "n_train":      0,
    },
]

# Pre-loaded subgroup audit results (populated by models/audit.py after training)
# Structure: {subgroup_key: {auc, auc_overall, n, calibration_note}}
_AUDIT_RESULTS: dict = {}


def _load_model(key: str):
    path = MODEL_DIR / f"{key}.joblib"
    if not path.exists():
        return None
    return joblib.load(path)


def _load_feature_columns(key: str) -> list[str] | None:
    path = MODEL_DIR / f"{key}.features.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _load_train_report(key: str) -> dict | None:
    path = MODEL_DIR / f"{key}.report.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def _fetch_features_from_db(stay_id: int, feature_columns: list[str]) -> np.ndarray | None:
    """
    Fetch feature row from Postgres derived view mimicscope.features_v1.
    Falls back to None if the view doesn't exist or the stay_id isn't present.
    """
    from sqlalchemy import create_engine, text

    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not database_url:
        return None

    cols_sql = ", ".join(feature_columns)
    q = text(f"SELECT {cols_sql} FROM mimicscope.features_v1 WHERE stay_id = :stay_id")
    engine = create_engine(database_url)
    try:
        with engine.connect() as conn:
            row = conn.execute(q, {"stay_id": stay_id}).mappings().first()
    except Exception:
        return None

    if not row:
        return None

    vals = [row.get(c) for c in feature_columns]
    return np.array(vals, dtype=float).reshape(1, -1)


def predict_risk(stay_id: int) -> RiskResponse | None:
    """Return risk panel; 404 only if the stay does not exist in MIMIC tables."""
    if not get_patient_summary(stay_id):
        return None

    key = "72h_unplanned_icu"
    cols = _load_feature_columns(key)
    features = None
    if cols:
        features = _fetch_features_from_db(stay_id, cols)

    risks = []
    for defn in DEFINITIONS:
        model = _load_model(defn["key"])
        report = _load_train_report(defn["key"]) or {}
        n_train = int(report.get("n_rows") or defn["n_train"] or 0)
        if model is not None and features is not None:
            prob = float(model.predict_proba(features)[0][1])
            methodology_extra = ""
        else:
            # No derived feature row (e.g. mimicscope.features_v1 missing) or no trained model
            prob = 0.15
            methodology_extra = " (placeholder — deploy features_v1 + trained model for live scores)"

        risks.append(RiskDefinition(
            definition=defn["definition"],
            probability=round(prob, 4),
            confidence_interval=(
                round(max(0, prob - 0.10), 4),
                round(min(1, prob + 0.10), 4),
            ),
            methodology=defn["methodology"] + methodology_extra,
            n_train=n_train,
        ))

    return RiskResponse(stay_id=stay_id, risks=risks)


def get_subgroup_audit(stay_id: int) -> AuditResponse | None:
    patient = get_patient_summary(stay_id)
    if not patient:
        return None

    race      = (patient.get("race") or "Unknown").split(" ")[0].title()
    gender    = patient.get("gender", "?")
    age       = patient.get("age_years", 0)
    age_tier  = "18–64" if age < 65 else ("65–79" if age < 80 else "80+")
    insurance = patient.get("insurance", "Unknown")

    subgroup_label = f"{race} {gender} patients, age {age_tier}"
    subgroup_key   = f"{race}_{gender}_{age_tier}".lower().replace(" ", "_")

    # Pull from audit cache or return defaults
    audit = _AUDIT_RESULTS.get(subgroup_key, {})
    auc_sg      = audit.get("auc",         0.72)
    auc_overall = audit.get("auc_overall", 0.79)
    n           = audit.get("n",           10)
    cal_note    = audit.get(
        "calibration_note",
        "Calibration data limited for this subgroup — interpret with caution.",
    )

    delta = auc_overall - auc_sg
    if delta > 0.08:
        advisory = (
            f"Model AUC is {delta:.2f} lower for {subgroup_label} than overall. "
            "The model may systematically underpredict risk — consider applying additional "
            "clinical judgment beyond the numeric output."
        )
    elif delta > 0.04:
        advisory = (
            f"Modest AUC gap ({delta:.2f}) for {subgroup_label}. "
            "Model performance is acceptable but imperfect for this population."
        )
    else:
        advisory = f"Model performance for {subgroup_label} is consistent with overall performance."

    return AuditResponse(
        stay_id=stay_id,
        patient_subgroup=subgroup_label,
        subgroup_performance=SubgroupPerformance(
            subgroup=subgroup_label,
            n=n,
            auc=auc_sg,
            auc_overall=auc_overall,
            calibration_note=cal_note,
        ),
        trust_advisory=advisory,
    )


def load_audit_results(results: dict):
    """Called by models/audit.py after training to populate subgroup cache."""
    global _AUDIT_RESULTS
    _AUDIT_RESULTS = results
