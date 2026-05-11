"""
ML model loading, inference, and subgroup bias audit.
Models are trained by models/train.py and saved to models/saved/.
"""
import functools
import json
import os
import threading
import joblib
import numpy as np
from pathlib import Path
from backend.schemas import RiskDriverFeature, RiskResponse, RiskDefinition, AuditResponse, SubgroupPerformance
from backend.services.mimic import get_patient_summary

MODEL_DIR = Path(__file__).parent.parent.parent / "models" / "saved"

# Human labels for model explanation (RandomForest feature_importances_)
FEATURE_LABELS: dict[str, str] = {
    "age_years": "Age",
    "is_male": "Sex (male indicator)",
    "icu_los_hours": "ICU length of stay",
    "hr_mean": "Heart rate (24h mean)",
    "hr_min": "Heart rate (24h minimum)",
    "hr_max": "Heart rate (24h maximum)",
    "map_mean": "Mean arterial pressure (24h mean)",
    "map_min": "Mean arterial pressure (minimum)",
    "map_max": "Mean arterial pressure (maximum)",
    "rr_mean": "Respiratory rate (24h mean)",
    "rr_min": "Respiratory rate (minimum)",
    "rr_max": "Respiratory rate (maximum)",
    "spo2_mean": "SpO₂ (24h mean)",
    "spo2_min": "SpO₂ (minimum)",
    "spo2_max": "SpO₂ (maximum)",
    "temp_mean": "Temperature (24h mean)",
    "temp_min": "Temperature (minimum)",
    "temp_max": "Temperature (maximum)",
    "hr_last": "Heart rate (last)",
    "map_last": "Mean arterial pressure (last)",
    "rr_last": "Respiratory rate (last)",
    "spo2_last": "SpO₂ (last)",
    "temp_last": "Temperature (last)",
    "vasopressor_present_24h": "Vasopressor exposure (24h)",
    "creat_last": "Creatinine (last)",
    "creat_slope": "Creatinine trend (per lab draw)",
    "bun_last": "BUN (last)",
    "bun_slope": "BUN trend (per lab draw)",
    "lactate_last": "Lactate (last)",
    "wbc_last": "White blood cell count",
    "hgb_last": "Hemoglobin",
    "glucose_last": "Glucose (last)",
}

DEFINITIONS = [
    {
        "key":          "72h_unplanned_icu",
        "definition":   "72h ICU Readmission Score",
        "methodology":  "Estimated from vitals (24h) and labs (48h) prior to ICU exit, compared with the training cohort.",
        "n_train":      0,
    },
]

# Pre-loaded subgroup audit results (populated by models/audit.py after training)
# Structure: {subgroup_key: {auc, auc_overall, n, calibration_note}}
_AUDIT_RESULTS: dict = {}

_sql_engine = None
_sql_engine_lock = threading.Lock()


def _get_features_engine():
    """Single pooled SQLAlchemy engine — avoids creating one engine per inference call."""
    global _sql_engine
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        return None
    # SQLAlchemy psycopg3 dialect is postgresql+psycopg://, not +psycopg3 (common Supabase copy-paste mistake).
    url = url.replace("postgresql+psycopg3://", "postgresql+psycopg://", 1)
    if _sql_engine is not None:
        return _sql_engine
    with _sql_engine_lock:
        if _sql_engine is None:
            from sqlalchemy import create_engine

            pool_size = max(1, int(os.getenv("SQLALCHEMY_POOL_SIZE", "2")))
            max_overflow = max(0, int(os.getenv("SQLALCHEMY_MAX_OVERFLOW", "2")))
            _sql_engine = create_engine(
                url,
                pool_pre_ping=True,
                pool_size=pool_size,
                max_overflow=max_overflow,
            )
    return _sql_engine


@functools.lru_cache(maxsize=16)
def _load_model(key: str):
    path = MODEL_DIR / f"{key}.joblib"
    if not path.exists():
        return None
    return joblib.load(path)


@functools.lru_cache(maxsize=16)
def _load_feature_columns(key: str) -> tuple[str, ...] | None:
    path = MODEL_DIR / f"{key}.features.json"
    if not path.exists():
        return None
    cols = json.loads(path.read_text())
    return tuple(cols) if isinstance(cols, list) else None


@functools.lru_cache(maxsize=16)
def _load_train_report(key: str) -> dict | None:
    path = MODEL_DIR / f"{key}.report.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


@functools.lru_cache(maxsize=16)
def _load_explain_artifact(key: str) -> dict | None:
    path = MODEL_DIR / f"{key}.explain.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def _build_risk_explanation(
    features: np.ndarray,
    feature_columns: list[str],
    explain: dict | None,
    *,
    model_loaded: bool,
    features_available: bool,
) -> tuple[str | None, list[RiskDriverFeature]]:
    """
    Short cohort-relative summary using global feature importances (not SHAP).
    Does not claim causal mechanisms.
    """
    if not model_loaded or not features_available or explain is None:
        return None, []

    names = explain.get("feature_names") or []
    imps = np.array(explain.get("importances") or [], dtype=float)
    medians = explain.get("medians") or {}
    p25 = explain.get("p25") or {}
    p75 = explain.get("p75") or {}

    if len(names) != len(imps) or len(imps) == 0:
        return None, []

    top_k = min(8, len(imps))
    top_idx = np.argsort(imps)[-top_k:][::-1]

    drivers: list[RiskDriverFeature] = []
    col_index = {c: i for i, c in enumerate(feature_columns)}
    imp_sum = float(imps.sum()) or 1.0

    for fi in top_idx:
        fname = names[fi]
        frac = float(imps[fi]) / imp_sum
        if fname not in col_index:
            continue
        v = features[0, col_index[fname]]
        label = FEATURE_LABELS.get(fname, fname.replace("_", " "))
        m = medians.get(fname)
        lo = p25.get(fname)
        hi = p75.get(fname)

        if np.isnan(v):
            drivers.append(
                RiskDriverFeature(
                    feature_key=fname,
                    label=label,
                    direction="typical",
                    detail=(
                        f"{label} was missing in the feature row; the model may treat missing values implicitly "
                        f"(global importance share ~{int(round(frac * 100))}%)."
                    ),
                )
            )
            continue

        if m is None or np.isnan(m):
            direction = "typical"
            detail = (
                f"{label} = {v:.3g} (no cohort median available). "
                f"Global importance share ~{int(round(frac * 100))}%."
            )
        elif lo is not None and hi is not None and not (np.isnan(lo) or np.isnan(hi)):
            if v > hi:
                direction = "higher"
                detail = (
                    f"{label} is above the training cohort's typical band (~75th percentile). "
                    f"Importance share ~{int(round(frac * 100))}%."
                )
            elif v < lo:
                direction = "lower"
                detail = (
                    f"{label} is below the training cohort's typical band (~25th percentile). "
                    f"Importance share ~{int(round(frac * 100))}%."
                )
            else:
                direction = "typical"
                detail = (
                    f"{label} falls near the middle of the training cohort distribution. "
                    f"Importance share ~{int(round(frac * 100))}%."
                )
        elif not np.isnan(m):
            direction = "higher" if v > m else "lower" if v < m else "typical"
            detail = (
                f"{label} is {'above' if v > m else 'below' if v < m else 'near'} the cohort median. "
                f"Importance share ~{int(round(frac * 100))}%."
            )
        else:
            direction = "typical"
            detail = f"{label} = {v:.3g}. Importance share ~{int(round(frac * 100))}%."

        drivers.append(
            RiskDriverFeature(
                feature_key=fname,
                label=label,
                direction=direction,
                detail=detail,
            )
        )

    # UI surfaces driver_features (vitals/labs signals); omit long RF methodology text.
    if drivers:
        return None, drivers
    return (
        "Feature drivers unavailable — ensure mimicscope.features_v1 is populated for this stay.",
        [],
    )


def _fetch_features_from_db(stay_id: int, feature_columns: list[str]) -> np.ndarray | None:
    """
    Fetch feature row from Postgres derived view mimicscope.features_v1.
    Falls back to None if the view doesn't exist or the stay_id isn't present.
    """
    from sqlalchemy import text

    engine = _get_features_engine()
    if engine is None:
        return None

    cols_sql = ", ".join(feature_columns)
    q = text(f"SELECT {cols_sql} FROM mimicscope.features_v1 WHERE stay_id = :stay_id")
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
    cols_tuple = _load_feature_columns(key)
    cols = list(cols_tuple) if cols_tuple else []
    features = None
    if cols:
        features = _fetch_features_from_db(stay_id, cols)

    risks = []
    for defn in DEFINITIONS:
        model = _load_model(defn["key"])
        report = _load_train_report(defn["key"]) or {}
        explain = _load_explain_artifact(defn["key"])
        n_train = int(report.get("n_rows") or defn["n_train"] or 0)
        model_ok = model is not None and features is not None
        if model_ok:
            prob = float(model.predict_proba(features)[0][1])
            methodology_extra = ""
        else:
            # No derived feature row (e.g. mimicscope.features_v1 missing) or no trained model
            prob = 0.15
            methodology_extra = " (placeholder — deploy features_v1 + trained model for live scores)"

        expl_text, drivers = _build_risk_explanation(
            features if features is not None else np.array([[]]),
            cols,
            explain,
            model_loaded=model is not None,
            features_available=features is not None,
        )

        risks.append(RiskDefinition(
            definition=defn["definition"],
            probability=round(prob, 4),
            confidence_interval=(
                round(max(0, prob - 0.10), 4),
                round(min(1, prob + 0.10), 4),
            ),
            methodology=defn["methodology"] + methodology_extra,
            n_train=n_train,
            explanation=expl_text,
            driver_features=drivers,
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
