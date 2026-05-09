#!/usr/bin/env python3
"""
Train MimicScope Risk Engine v1:

- Outcome: outcome_hosp_readmit_72h_unplanned_icu
- Prediction time: ICU outtime (features computed from windows prior to outtime)
- Training source: Postgres materialized view mimicscope.training_dataset_v1

Artifacts are saved to models/saved/ (gitignored).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import train_test_split
import joblib
from sqlalchemy import create_engine, text


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


FEATURE_COLUMNS = [
    # demographics / metadata
    "age_years",
    "is_male",
    "icu_los_hours",
    # vitals aggregates (24h)
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
    # vitals last
    "hr_last",
    "map_last",
    "rr_last",
    "spo2_last",
    "temp_last",
    # support proxies
    "vasopressor_present_24h",
    # labs last + slopes (48h)
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


def main() -> int:
    load_dotenv(ROOT / ".env")
    import os

    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is missing. Set it in .env (see .env.example).")

    df = _load_training_frame(database_url)
    if df.empty:
        raise SystemExit("No rows returned from mimicscope.training_dataset_v1. Did you run sql/mimicscope_build_v1.sql?")

    y = df["y"].astype(int).to_numpy()
    X = df[FEATURE_COLUMNS].to_numpy(dtype=float)

    n_pos = int(y.sum())
    if n_pos < 2:
        raise SystemExit(f"Not enough positives to train (n_pos={n_pos}). Load more data (full MIMIC-IV) or relax cohort.")

    # Keep splits stable for demo; for full MIMIC you can use time-based splitting later.
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y if n_pos >= 4 else None
    )

    model = HistGradientBoostingClassifier(
        learning_rate=0.05,
        max_depth=3,
        max_iter=300,
        random_state=42,
    )
    model.fit(X_train, y_train)

    # Scores
    val_scores = model.predict_proba(X_val)[:, 1]
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
    )

    SAVED_DIR.mkdir(parents=True, exist_ok=True)
    key = "72h_unplanned_icu"
    joblib.dump(model, SAVED_DIR / f"{key}.joblib")
    (SAVED_DIR / f"{key}.features.json").write_text(json.dumps(FEATURE_COLUMNS, indent=2))
    (SAVED_DIR / f"{key}.report.json").write_text(json.dumps(asdict(report), indent=2))

    print("Saved:", SAVED_DIR / f"{key}.joblib")
    print(json.dumps(asdict(report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

