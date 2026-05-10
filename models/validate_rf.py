#!/usr/bin/env python3
"""
Validate the saved Random Forest readmission model against MIMIC-IV feature data.

Uses the same cohort and feature columns as models/train.py (mimicscope.training_dataset_v1
or TRAINING_PARQUET export). By default, holds out 20% of rows with a stratified split
(random_state=42) so results match the validation slice described in training — the
on-disk 72h_unplanned_icu.joblib was fit on the complementary 80%.

Environment (same as training):
  DATABASE_URL or TRAINING_PARQUET

Validation overrides:
  VALIDATION_HOLDOUT_FRAC — default 0.2 (20% held out for metrics only)
  VALIDATION_RANDOM_STATE — default 42 (must match train.py for apples-to-apples)

Does not retrain; only scores the saved pipeline on the holdout split.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
import joblib

ROOT = Path(__file__).resolve().parents[1]
SAVED_DIR = ROOT / "models" / "saved"


def _load_train_module():
    train_path = ROOT / "models" / "train.py"
    name = "mimic_train"
    spec = importlib.util.spec_from_file_location(name, train_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {train_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    load_dotenv(ROOT / ".env")
    train = _load_train_module()

    parquet_path = (os.environ.get("TRAINING_PARQUET") or "").strip()
    if parquet_path:
        df = train._load_training_export(Path(parquet_path).expanduser().resolve())
    else:
        database_url = (os.environ.get("DATABASE_URL") or "").strip()
        if not database_url:
            raise SystemExit(
                "Set DATABASE_URL for Postgres, or TRAINING_PARQUET=/path/to/export.parquet|.csv"
            )
        df = train._load_training_frame(database_url)

    if df.empty:
        raise SystemExit("Training frame is empty.")

    holdout_frac = float(os.getenv("VALIDATION_HOLDOUT_FRAC", "0.2"))
    rng = int(os.getenv("VALIDATION_RANDOM_STATE", "42"))

    feat_cols = train.FEATURE_COLUMNS
    y = df["y"].astype(int).to_numpy()
    X = df[feat_cols].to_numpy(dtype=float)

    n_pos = int(y.sum())
    neg = len(y) - n_pos
    strat = y if n_pos >= 2 and neg >= 2 else None

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=holdout_frac,
        random_state=rng,
        stratify=strat,
    )

    model_path = SAVED_DIR / "72h_unplanned_icu.joblib"
    if not model_path.is_file():
        raise SystemExit(f"Saved model not found: {model_path} — run models/train.py first.")

    model = joblib.load(model_path)

    val_proba = model.predict_proba(X_val)
    val_scores = val_proba[:, 1] if val_proba.shape[1] > 1 else val_proba[:, 0]

    out: dict = {
        "n_total_rows": int(len(df)),
        "n_holdout": int(len(y_val)),
        "n_holdout_positive": int(y_val.sum()),
        "holdout_positive_rate": float(y_val.mean()),
        "holdout_frac": holdout_frac,
        "random_state": rng,
        "model_path": str(model_path),
    }

    if len(np.unique(y_val)) > 1:
        out["roc_auc"] = float(roc_auc_score(y_val, val_scores))
        out["average_precision"] = float(average_precision_score(y_val, val_scores))
    else:
        out["roc_auc"] = None
        out["average_precision"] = None
        print("Warning: holdout has only one class — ROC-AUC / AP undefined.")

    thr = float(os.getenv("VALIDATION_THRESHOLD", "0.5"))
    y_hat = (val_scores >= thr).astype(int)
    out["threshold"] = thr
    out["accuracy"] = float(accuracy_score(y_val, y_hat))
    out["precision"] = float(precision_score(y_val, y_hat, zero_division=0))
    out["recall"] = float(recall_score(y_val, y_hat, zero_division=0))
    out["f1"] = float(f1_score(y_val, y_hat, zero_division=0))

    tp = int(np.sum((y_val == 1) & (y_hat == 1)))
    tn = int(np.sum((y_val == 0) & (y_hat == 0)))
    fp = int(np.sum((y_val == 0) & (y_hat == 1)))
    fn = int(np.sum((y_val == 1) & (y_hat == 0)))
    out["confusion_matrix"] = {"tn": tn, "fp": fp, "fn": fn, "tp": tp}

    report_path = SAVED_DIR / "72h_unplanned_icu.validation.json"
    report_path.write_text(json.dumps(out, indent=2))

    print(json.dumps(out, indent=2))
    print("\nWritten:", report_path)
    print(
        "\nNote: train.py uses test_size=0.2 and random_state=42 by default — "
        "same settings here align validation metrics with the training script's holdout slice."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
