"""MongoDB persistence for clinician-recorded discharge destinations (demo — no per-user auth)."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from pymongo.errors import PyMongoError

from backend.services.mongo_connection import get_mongo_client


def _collection():
    client = get_mongo_client()
    if client is None:
        return None
    return client["patientscope"]["discharge_events"]


def get_discharged_stay_ids() -> set[int]:
    """Stay IDs with a recorded discharge (excluded from ward census / roster when Mongo is available)."""
    col = _collection()
    if col is None:
        return set()
    try:
        raw = col.distinct("stay_id")
        return {int(x) for x in raw if x is not None}
    except PyMongoError:
        return set()


def insert_discharge_event(
    *,
    stay_id: int,
    subject_id: int,
    destination: str,
    notes: str | None,
) -> dict:
    col = _collection()
    if col is None:
        raise RuntimeError("MONGODB_URI not configured")
    doc = {
        "stay_id": stay_id,
        "subject_id": subject_id,
        "destination": destination,
        "notes": notes or "",
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        # One document per stay — idempotent confirm / updates destination + timestamp.
        col.replace_one({"stay_id": stay_id}, doc, upsert=True)
    except PyMongoError as e:
        raise RuntimeError(f"MongoDB write failed: {e}") from e
    return doc
