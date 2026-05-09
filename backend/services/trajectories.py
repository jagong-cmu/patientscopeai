"""
Build trajectory chart payloads: hourly observed series + illustrative forward forecast.

Forecast bands are for visualization only — not validated clinical predictions.
"""
from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean
from typing import Any

import numpy as np

from backend.schemas import (
    TrajectoryForecast,
    TrajectoryPoint,
    TrajectoryResponse,
    TrajectorySeries,
)
from backend.services.mimic import TRAJ_LAB_ITEMS, get_trajectory_raw_events

DISCLAIMER = (
    "Forward projections and shaded intervals are illustrative extrapolations for dashboard "
    "communication only; they are not validated forecasts or calibrated prediction intervals."
)

# Rough reference bands for shading (not individualized targets)
NORMAL_BANDS: dict[str, tuple[float | None, float | None]] = {
    "creatinine": (0.6, 1.3),
    "bun": (7.0, 20.0),
    "lactate": (0.5, 2.0),
    "wbc": (4.0, 11.0),
    "hemoglobin": (10.0, 16.0),
    "map": (65.0, 105.0),
}

LABELS = {
    "creatinine": ("Creatinine", "mg/dL"),
    "bun": ("BUN", "mg/dL"),
    "lactate": ("Lactate", "mmol/L"),
    "wbc": ("WBC", "K/uL"),
    "hemoglobin": ("Hemoglobin", "g/dL"),
    "map": ("Mean MAP", "mmHg"),
}


def _hours_since(start: datetime, ts: datetime) -> float:
    if ts.tzinfo is None and start.tzinfo is None:
        delta = ts - start
    else:
        delta = ts.replace(tzinfo=start.tzinfo or timezone.utc) - start.replace(
            tzinfo=start.tzinfo or timezone.utc
        )
    return delta.total_seconds() / 3600.0


def _bucket_hourly(
    rows: list[dict[str, Any]],
    intime: datetime,
) -> dict[float, float]:
    """Group values into hourly buckets (floor hour since intime)."""
    buckets: dict[float, list[float]] = {}
    for row in rows:
        ts = row["ts"]
        if ts is None:
            continue
        h = float(np.floor(_hours_since(intime, ts)))
        val = row["val"]
        if val is None:
            continue
        buckets.setdefault(h, []).append(float(val))
    return {h: mean(vals) for h, vals in buckets.items()}


def _trend_label(series_key: str, ys: list[float]) -> str:
    if len(ys) < 2:
        return "Insufficient density"
    slope = float(np.polyfit(np.arange(len(ys)), np.array(ys), 1)[0])
    mag = abs(slope)
    if mag < 1e-6:
        return "Stabilizing"
    # Scale-aware thresholds (very rough)
    thr = {"creatinine": 0.02, "bun": 0.15, "lactate": 0.03, "wbc": 0.08, "hemoglobin": 0.05, "map": 0.5}.get(
        series_key, 0.05
    )
    if mag < thr:
        return "Stabilizing"
    return "Continuing to rise" if slope > 0 else "Improving trajectory"


def _extrapolate_forecast(t_obs: list[float], y_obs: list[float], horizon_h: int = 72) -> TrajectoryForecast | None:
    """Simple linear trend + widening illustrative PI."""
    if len(t_obs) < 2 or len(y_obs) < 2:
        return None
    t_arr = np.array(t_obs[-12:])
    y_arr = np.array(y_obs[-12:])
    if len(t_arr) < 2:
        return None
    coef = np.polyfit(t_arr, y_arr, 1)
    slope, intercept = float(coef[0]), float(coef[1])
    last_t = float(t_obs[-1])
    spread = float(np.std(y_arr)) if len(y_arr) > 2 else abs(float(np.mean(y_arr)) * 0.05 + 1e-6)

    t_hours: list[float] = []
    mean_line: list[float] = []
    lower: list[float] = []
    upper: list[float] = []
    for i in range(1, horizon_h + 1):
        t = last_t + i
        m = slope * t + intercept
        # Widen interval with horizon (illustrative)
        w = spread * (1.0 + 0.02 * i)
        t_hours.append(t)
        mean_line.append(m)
        lower.append(m - w)
        upper.append(m + w)
    return TrajectoryForecast(t_hours=t_hours, mean=mean_line, lower=lower, upper=upper)


def build_trajectory_response(stay_id: int) -> TrajectoryResponse | None:
    raw = get_trajectory_raw_events(stay_id)
    if raw is None:
        return None
    intime: datetime = raw["intime"]
    outtime: datetime = raw["outtime"]
    discharge_h = _hours_since(intime, outtime)

    map_rows = [{"ts": r["ts"], "val": r["val"]} for r in raw["vitals"]]

    series_out: list[TrajectorySeries] = []

    # Labs — one trajectory per analyte
    for item_id, skey in TRAJ_LAB_ITEMS.items():
        sub = [{"ts": r["ts"], "val": r["val"]} for r in raw["labs"] if r["itemid"] == item_id]
        buckets = _bucket_hourly(sub, intime)
        if not buckets:
            points = []
            ys = []
            ts_sorted = []
        else:
            ts_sorted = sorted(buckets.keys())
            ys = [buckets[t] for t in ts_sorted]
            points = [TrajectoryPoint(t_hours=float(t), y=float(y)) for t, y in zip(ts_sorted, ys)]
        lo, hi = NORMAL_BANDS[skey]
        trend = _trend_label(skey, ys)
        fc = _extrapolate_forecast(ts_sorted, ys) if ts_sorted else None
        title, unit = LABELS[skey]
        series_out.append(
            TrajectorySeries(
                series_id=skey,
                label=title,
                unit=unit,
                points=points,
                normal_low=lo,
                normal_high=hi,
                trend_label=trend,
                forecast=fc,
                discharge_t_hours=discharge_h,
            )
        )

    # MAP — merge vital itemids per hour
    if map_rows:
        buckets_map: dict[float, list[float]] = {}
        for row in map_rows:
            h = float(np.floor(_hours_since(intime, row["ts"])))
            buckets_map.setdefault(h, []).append(float(row["val"]))
        buckets_map_avg = {h: mean(vals) for h, vals in buckets_map.items()}
        ts_sorted = sorted(buckets_map_avg.keys())
        ys = [buckets_map_avg[t] for t in ts_sorted]
        points = [TrajectoryPoint(t_hours=float(t), y=float(y)) for t, y in zip(ts_sorted, ys)]
        lo, hi = NORMAL_BANDS["map"]
        fc = _extrapolate_forecast(ts_sorted, ys) if ts_sorted else None
        title, unit = LABELS["map"]
        series_out.append(
            TrajectorySeries(
                series_id="map",
                label=title,
                unit=unit,
                points=points,
                normal_low=lo,
                normal_high=hi,
                trend_label=_trend_label("map", ys),
                forecast=fc,
                discharge_t_hours=discharge_h,
            )
        )
    else:
        lo, hi = NORMAL_BANDS["map"]
        series_out.append(
            TrajectorySeries(
                series_id="map",
                label=LABELS["map"][0],
                unit=LABELS["map"][1],
                points=[],
                normal_low=lo,
                normal_high=hi,
                trend_label="No MAP samples in ICU window",
                forecast=None,
                discharge_t_hours=discharge_h,
            )
        )

    def _iso(dt: datetime | None) -> str | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.isoformat() + "Z"
        return dt.isoformat()

    return TrajectoryResponse(
        stay_id=stay_id,
        intime_iso=_iso(intime),
        outtime_iso=_iso(outtime),
        disclaimer=DISCLAIMER,
        series=series_out,
    )
