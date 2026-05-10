"""ICU operational snapshot for narratives and dashboards (demo — beds + configured pending admissions)."""
from __future__ import annotations

import os

from backend.services.discharge_events_store import get_discharged_stay_ids
from backend.services.icu_scan_limit import ICU_STAY_SCAN_LIMIT
from backend.services.mimic import list_icu_stays
from backend.services.news import compute_news_score


def get_ward_operational_context() -> dict:
    capacity = max(1, int(os.getenv("WARD_BED_CAPACITY", "100")))
    pending = max(0, int(os.getenv("WARD_PENDING_ADMISSIONS", "0")))
    discharged = get_discharged_stay_ids()
    rows = [r for r in list_icu_stays(ICU_STAY_SCAN_LIMIT) if r["stay_id"] not in discharged]
    census = 0
    for r in rows:
        sid = int(r["stay_id"])
        if compute_news_score(sid):
            census += 1
    available = max(0, capacity - census)
    projected_load = census + pending
    ratio = min(1.5, projected_load / float(capacity)) if capacity else 0.0
    if ratio >= 0.95:
        pressure = "very_high"
    elif ratio >= 0.85:
        pressure = "high"
    elif ratio >= 0.7:
        pressure = "elevated"
    else:
        pressure = "moderate"
    return {
        "bed_capacity": capacity,
        "beds_in_use": census,
        "pending_admissions": pending,
        "available_beds": available,
        "projected_bed_pressure": pressure,
        "projected_census_plus_pending": projected_load,
    }
