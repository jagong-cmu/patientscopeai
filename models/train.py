#!/usr/bin/env python3
"""
Train MimicScope Risk Engine — Random Forest (72h unplanned ICU readmission proxy).

Outcome: outcome_hosp_readmit_72h_unplanned_icu (elective admissions excluded per SQL cohort rules).
Features: mimicscope.training_dataset_v1 (vitals/labs windows ending at ICU outtime).

Methodology alignment: Lee & Tsoi, arXiv:2503.21241 — Random Forest on engineered tabular ICU features,
mean imputation for missing values, grid search over RF hyperparameters, train/test split 80/20.
Their endpoint was in-hospital mortality on MIMIC-III; ours is 72h unplanned ICU readmission after discharge.
They additionally used LASSO/RFE feature selection, min–max scaling, and SMOTE — we keep the SQL-backed
feature set fixed for inference compatibility; SMOTE can be enabled for large cohorts via TRAIN_USE_SMOTE=1.

Artifacts: models/saved/72h_unplanned_icu.joblib (sklearn Pipeline: imputer → RF),
.features.json, .report.json, .explain.json

Holdout validation: training reports auc/auprc on 20% stratified test split (random_state=42).
To re-score only the saved model on the same-style holdout, run: python models/validate_rf.py
(writes 72h_unplanned_icu.validation.json).

Full MIMIC-IV without a local bulk download: PhysioNet offers MIMIC on Google BigQuery for credentialed users.
Materialize the same columns as mimicscope.training_dataset_v1 in BigQuery, export to Parquet or CSV,
then set TRAINING_PARQUET=/path/to/export.parquet or /path/to/export.csv and run (DATABASE_URL not required).
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
import joblib
from sqlalchemy import create_engine, text

try:
    from imblearn.over_sampling import SMOTE
    from imblearn.pipeline import Pipeline as ImbPipeline

    HAS_IMB = True
except ImportError:
    HAS_IMB = False


ROOT = Path(__file__).resolve().parents[1]
SAVED_DIR = ROOT / "models" / "saved"


@dataclass(frozen=True)
class TrainReport:
    n_rows: int
    n_pos: int
    n_features: int
    auc: float | None
    auprc: float | None
    pos_rate: float
    model_family: str
    best_params: dict | None
    used_smote: bool


FEATURE_COLUMNS = [
    "age_years",
    "is_male",
    "icu_los_hours",
    "hr_mean",
    "hr_min",
    "hr_max",
    "map_mean",
    "map_min",
    "map_max",
    "rr_mean",
    "rr_min",
    "rr_max",
    "spo2_mean",
    "spo2_min",
    "spo2_max",
    "temp_mean",
    "temp_min",
    "temp_max",
    "hr_last",
    "map_last",
    "rr_last",
    "spo2_last",
    "temp_last",
    "vasopressor_present_24h",
    "creat_last",
    "creat_slope",
    "bun_last",
    "bun_slope",
    "lactate_last",
    "wbc_last",
    "hgb_last",
    "glucose_last",
]


def _load_training_frame(database_url: str) -> pd.DataFrame:
    engine = create_engine(database_url)
    query = text(
        """
        SELECT
          stay_id,
          outcome_hosp_readmit_72h_unplanned_icu AS y,
          """ + ",\n          ".join(FEATURE_COLUMNS) + """
        FROM mimicscope.training_dataset_v1
        ORDER BY stay_id
        """
    )
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    return df


def _normalize_label_column(df: pd.DataFrame) -> pd.DataFrame:
    if "y" in df.columns:
        return df
    if "outcome_hosp_readmit_72h_unplanned_icu" in df.columns:
        out = df.rename(columns={"outcome_hosp_readmit_72h_unplanned_icu": "y"})
        return out
    raise SystemExit(
        "Training frame needs column 'y' or 'outcome_hosp_readmit_72h_unplanned_icu'. "
        f"Got: {list(df.columns)}"
    )


def _load_training_export(path: Path) -> pd.DataFrame:
    if not path.is_file():
        raise SystemExit(f"TRAINING_PARQUET file not found: {path}")
    suf = path.suffix.lower()
    if suf == ".parquet":
        df = pd.read_parquet(path)
    elif suf in (".csv", ".txt"):
        df = pd.read_csv(path, low_memory=False)
        # BigQuery CSV may stringify some numeric columns
        for col in FEATURE_COLUMNS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        if "stay_id" in df.columns:
            df["stay_id"] = pd.to_numeric(df["stay_id"], errors="coerce").astype("Int64")
        oc = "outcome_hosp_readmit_72h_unplanned_icu"
        if oc in df.columns:
            df[oc] = pd.to_numeric(df[oc], errors="coerce").fillna(0).astype(int)
        elif "y" in df.columns:
            df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0).astype(int)
    else:
        raise SystemExit(f"Unsupported training export type {suf!r}; use .parquet or .csv")

    df = _normalize_label_column(df)
    missing = [c for c in ["stay_id", "y", *FEATURE_COLUMNS] if c not in df.columns]
    if missing:
        raise SystemExit(f"Export missing columns: {missing}")
    return df


def _rf_classifier() -> RandomForestClassifier:
    return RandomForestClassifier(
        random_state=42,
        n_jobs=-1,
        class_weight="balanced_subsample",
    )


def _make_imputer_only_pipeline() -> Pipeline:
    """Paper: mean imputation for continuous variables (all columns here are numeric)."""
    return Pipeline(
        [
            ("imputer", SimpleImputer(strategy="mean")),
            ("rf", _rf_classifier()),
        ]
    )


def _maybe_smote_refit(
    base: Pipeline,
    X_train: np.ndarray,
    y_train: np.ndarray,
) -> tuple[Pipeline | object, bool]:
    """
    Optional SMOTE refit (paper): only when TRAIN_USE_SMOTE=1, imblearn installed,
    and minority class large enough for stable synthetic sampling (not used inside GridSearchCV folds).
    """
    if os.getenv("TRAIN_USE_SMOTE", "").strip() != "1" or not HAS_IMB:
        return base, False
    pos = int(y_train.sum())
    neg = len(y_train) - pos
    min_c = min(pos, neg)
    if min_c < 10:
        print("SMOTE skipped: minority class too small for stable sampling (need >= 10 per class).")
        return base, False

    kn = max(1, min(5, min_c - 1))
    rf_fit = clone(base.named_steps["rf"])
    pipe = ImbPipeline(
        [
            ("imputer", SimpleImputer(strategy="mean")),
            ("smote", SMOTE(random_state=42, k_neighbors=kn)),
            ("rf", rf_fit),
        ]
    )
    pipe.fit(X_train, y_train)
    return pipe, True


def _extract_rf_step(estimator: object) -> RandomForestClassifier | None:
    if hasattr(estimator, "named_steps"):
        rf = estimator.named_steps.get("rf")
        if isinstance(rf, RandomForestClassifier):
            return rf
    return None


def main() -> int:
    load_dotenv(ROOT / ".env")

    parquet_path = (os.environ.get("TRAINING_PARQUET") or "").strip()
    if parquet_path:
        df = _load_training_export(Path(parquet_path).expanduser().resolve())
    else:
        database_url = (os.environ.get("DATABASE_URL") or "").strip()
        if not database_url:
            raise SystemExit(
                "Set DATABASE_URL for Postgres training, or TRAINING_PARQUET=/path/to/export.parquet|.csv "
                "(e.g. BigQuery export). See .env.example."
            )
        df = _load_training_frame(database_url)
        if df.empty:
            raise SystemExit(
                "No rows returned from mimicscope.training_dataset_v1. Did you run sql/mimicscope_build_v1.sql?"
            )

    if df.empty:
        raise SystemExit("Training frame is empty.")

    y = df["y"].astype(int).to_numpy()
    X = df[FEATURE_COLUMNS].to_numpy(dtype=float)

    n_pos = int(y.sum())
    if n_pos < 2:
        raise SystemExit(f"Not enough positives to train (n_pos={n_pos}). Load more data (full MIMIC-IV) or relax cohort.")

    neg = len(y) - n_pos
    # Stratify whenever both classes have ≥2 rows so positives aren't isolated in train or val only.
    strat = y if n_pos >= 2 and neg >= 2 else None
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=strat
    )

    pipe = _make_imputer_only_pipeline()

    param_grid = {
        "rf__n_estimators": [100, 200],
        "rf__max_depth": [None, 12, 24],
        "rf__min_samples_leaf": [1, 2, 5],
        "rf__max_features": ["sqrt", 0.4],
    }

    min_samples_for_grid = len(X_train) >= 40 and int(y_train.sum()) >= 5 and (len(y_train) - int(y_train.sum())) >= 5
    skip_grid = os.getenv("TRAIN_SKIP_GRID", "").strip() == "1"

    if min_samples_for_grid and not skip_grid:
        pos_tr = int(y_train.sum())
        neg_tr = len(y_train) - pos_tr
        n_splits = max(2, min(5, pos_tr, neg_tr))
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        grid = GridSearchCV(
            pipe,
            param_grid,
            scoring="average_precision",
            cv=cv,
            n_jobs=-1,
            refit=True,
        )
        grid.fit(X_train, y_train)
        model = grid.best_estimator_
        best_params = {k: (v.tolist() if hasattr(v, "tolist") else v) for k, v in grid.best_params_.items()}
    else:
        if skip_grid and min_samples_for_grid:
            print("TRAIN_SKIP_GRID=1 — skipping hyperparameter grid (faster). Remove it for full GridSearchCV.")
        pipe.fit(X_train, y_train)
        model = pipe
        best_params = None

    model, used_smote = _maybe_smote_refit(model, X_train, y_train)

    val_proba = model.predict_proba(X_val)
    val_scores = val_proba[:, 1] if val_proba.shape[1] > 1 else val_proba[:, 0]
    auc = None
    auprc = None
    if len(np.unique(y_val)) > 1:
        auc = float(roc_auc_score(y_val, val_scores))
        auprc = float(average_precision_score(y_val, val_scores))

    report = TrainReport(
        n_rows=int(len(df)),
        n_pos=n_pos,
        n_features=len(FEATURE_COLUMNS),
        auc=auc,
        auprc=auprc,
        pos_rate=float(n_pos / max(1, len(df))),
        model_family="random_forest",
        best_params=best_params,
        used_smote=used_smote,
    )

    SAVED_DIR.mkdir(parents=True, exist_ok=True)
    key = "72h_unplanned_icu"
    joblib.dump(model, SAVED_DIR / f"{key}.joblib")
    (SAVED_DIR / f"{key}.features.json").write_text(json.dumps(FEATURE_COLUMNS, indent=2))
    (SAVED_DIR / f"{key}.report.json").write_text(json.dumps(asdict(report), indent=2))

    rf_fit = _extract_rf_step(model)
    if rf_fit is None:
        raise RuntimeError("Could not extract RandomForestClassifier from pipeline.")

    imp = rf_fit.feature_importances_
    medians = {}
    p25 = {}
    p75 = {}
    for i, col in enumerate(FEATURE_COLUMNS):
        col_vals = X[:, i]
        finite = col_vals[~np.isnan(col_vals)]
        if len(finite):
            medians[col] = float(np.median(finite))
            p25[col] = float(np.percentile(finite, 25))
            p75[col] = float(np.percentile(finite, 75))
        else:
            medians[col] = None
            p25[col] = None
            p75[col] = None

    explain_payload = {
        "feature_names": FEATURE_COLUMNS,
        "importances": [float(x) for x in imp],
        "medians": medians,
        "p25": p25,
        "p75": p75,
        "model_family": "random_forest",
        "reference": "arxiv:2503.21241 (RF + mean imputation + grid search; SMOTE optional via TRAIN_USE_SMOTE=1)",
    }
    (SAVED_DIR / f"{key}.explain.json").write_text(json.dumps(explain_payload, indent=2))

    print("Saved:", SAVED_DIR / f"{key}.joblib")
    print(json.dumps(asdict(report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
