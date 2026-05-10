"""
Counterfactual discharge timing sensitivity: replay the same HGB model at +0h, +12h, +24h
with heuristic forward adjustments (not a validated dynamic forecast).

Training features are anchored at ICU outtime (see sql/mimicscope_build_v1.sql).
Slopes creat_slope / bun_slope are per sequential lab draw; we map hours waited using
delta_hours/24 as a tunable proxy step (documented in methodology_note).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

from backend.schemas import DischargeTimingResponse, DischargeTimingScenario
from backend.services.mimic import get_patient_summary

MODEL_DIR = Path(__file__).resolve().parents[2] / "models" / "saved"
KEY = "72h_unplanned_icu"

DISCLAIMER = (
    "These probabilities are illustrative sensitivity analysis on the same snapshot-trained model; "
    "they are not validated forecasts of how risk evolves over clock time. Forward adjustments "
    "use simple heuristics (lab slopes scaled by wait time, damped vital stabilization, LOS)."
)

METHODOLOGY_NOTE = (
    "Baseline features match mimicscope.features_v1 (vitals/labs ending at ICU outtime). "
    "For +12h / +24h scenarios we add hours to icu_los_hours; advance creatinine/BUN along stored "
    "slopes scaled by (Δhours/24); gently damp lactate when elevated; pull last vitals slightly "
    "toward neutral stability targets; nudge aggregate vitals toward updated last values. "
    "Vasopressor flag is unchanged in v1."
)


def _load_model():
    from joblib import load

    path = MODEL_DIR / f"{KEY}.joblib"
    if not path.exists():
        return None
    return load(path)


def _load_feature_columns() -> list[str] | None:
    path = MODEL_DIR / f"{KEY}.features.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _fetch_features_row(stay_id: int, cols: list[str]) -> np.ndarray | None:
    from sqlalchemy import create_engine, text

    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not database_url:
        return None
    q = text(f"SELECT {', '.join(cols)} FROM mimicscope.features_v1 WHERE stay_id = :stay_id")
    engine = create_engine(database_url)
    try:
        with engine.connect() as conn:
            row = conn.execute(q, {"stay_id": stay_id}).mappings().first()
    except Exception:
        return None
    if not row:
        return None
    vals = [row.get(c) for c in cols]
    return np.array(vals, dtype=float).reshape(1, -1)


def _clip_feature(name: str, v: float) -> float:
    if np.isnan(v):
        return v
    if name.startswith(("creat_", "bun_", "lactate_", "glucose_")):
        return max(0.0, min(v, 50.0)) if "glucose" not in name else max(20.0, min(v, 800.0))
    if name == "map_last" or name.startswith("map_"):
        return max(35.0, min(v, 160.0))
    if name.startswith("hr_"):
        return max(35.0, min(v, 220.0))
    if name.startswith("spo2_"):
        return max(65.0, min(v, 100.0))
    if name.startswith("rr_"):
        return max(4.0, min(v, 60.0))
    if name.startswith("temp_"):
        return max(33.0, min(v, 42.0))
    return v


def _counterfactual_matrix(
    x: np.ndarray,
    cols: list[str],
    delta_h: float,
) -> np.ndarray:
    """Return shape (1, n_features) adjusted for waiting delta_h hours before discharge."""
    idx = {c: i for i, c in enumerate(cols)}
    arr = x.copy()

    def get(c: str) -> float:
        i = idx[c]
        v = arr[0, i]
        return float(v) if not np.isnan(v) else np.nan

    def setv(c: str, val: float) -> None:
        arr[0, idx[c]] = _clip_feature(c, val)

    # ICU LOS increases when discharge is delayed
    if "icu_los_hours" in idx:
        v = get("icu_los_hours")
        if not np.isnan(v):
            setv("icu_los_hours", v + delta_h)

    step = delta_h / 24.0
    if "creat_last" in idx and "creat_slope" in idx:
        c0, s = get("creat_last"), get("creat_slope")
        if not np.isnan(c0) and not np.isnan(s):
            setv("creat_last", c0 + s * step)
    if "bun_last" in idx and "bun_slope" in idx:
        b0, s = get("bun_last"), get("bun_slope")
        if not np.isnan(b0) and not np.isnan(s):
            setv("bun_last", b0 + s * step)

    if "lactate_last" in idx:
        lac = get("lactate_last")
        if not np.isnan(lac) and lac > 2.0:
            drop = 0.08 * (delta_h / 12.0)
            setv("lactate_last", max(1.0, lac - drop))

    damp = min(0.15 * (delta_h / 24.0), 0.12)
    targets = {
        "hr_last": 78.0,
        "map_last": 82.0,
        "rr_last": 16.0,
        "spo2_last": 96.0,
        "temp_last": 37.0,
    }
    for k, tgt in targets.items():
        if k not in idx:
            continue
        cur = get(k)
        if np.isnan(cur):
            continue
        setv(k, cur * (1.0 - damp) + tgt * damp)

    pairs = [
        ("hr_mean", "hr_last"),
        ("hr_min", "hr_last"),
        ("hr_max", "hr_last"),
        ("map_mean", "map_last"),
        ("map_min", "map_last"),
        ("map_max", "map_last"),
        ("rr_mean", "rr_last"),
        ("rr_min", "rr_last"),
        ("rr_max", "rr_last"),
        ("spo2_mean", "spo2_last"),
        ("spo2_min", "spo2_last"),
        ("spo2_max", "spo2_last"),
        ("temp_mean", "temp_last"),
        ("temp_min", "temp_last"),
        ("temp_max", "temp_last"),
    ]
    beta = 0.28 * min(delta_h / 24.0, 1.0)
    for mean_k, last_k in pairs:
        if mean_k not in idx or last_k not in idx:
            continue
        m, last = get(mean_k), get(last_k)
        if np.isnan(m) or np.isnan(last):
            continue
        setv(mean_k, m * (1.0 - beta) + last * beta)

    return arr


def compute_discharge_timing(stay_id: int) -> DischargeTimingResponse | None:
    if not get_patient_summary(stay_id):
        return None

    cols = _load_feature_columns()
    model = _load_model()
    x0 = _fetch_features_row(stay_id, cols) if cols else None

    horizons = (0.0, 12.0, 24.0)
    scenarios: list[DischargeTimingScenario] = []

    if model is None or cols is None or x0 is None:
        base_p = 0.15
        for h in horizons:
            scenarios.append(
                DischargeTimingScenario(
                    horizon_hours=h,
                    probability=round(base_p, 4),
                    delta_vs_now=None if h == 0 else round(base_p - base_p, 4),
                )
            )
        return DischargeTimingResponse(
            stay_id=stay_id,
            scenarios=scenarios,
            disclaimer=DISCLAIMER + " (Placeholder probabilities — train model and refresh features_v1.)",
            methodology_note=METHODOLOGY_NOTE,
            is_placeholder=True,
        )

    p0 = float(model.predict_proba(x0)[0, 1])
    for h in horizons:
        xh = _counterfactual_matrix(x0, cols, h) if h > 0 else x0
        ph = float(model.predict_proba(xh)[0, 1])
        scenarios.append(
            DischargeTimingScenario(
                horizon_hours=h,
                probability=round(ph, 4),
                delta_vs_now=None if h == 0 else round(ph - p0, 4),
            )
        )

    return DischargeTimingResponse(
        stay_id=stay_id,
        scenarios=scenarios,
        disclaimer=DISCLAIMER,
        methodology_note=METHODOLOGY_NOTE,
        is_placeholder=False,
    )
