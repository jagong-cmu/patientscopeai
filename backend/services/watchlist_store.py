"""MongoDB persistence for post-discharge watchlist (demo — no per-user auth)."""
from __future__ import annotations

from datetime import datetime, timezone

from pymongo.errors import PyMongoError

from backend.services.mongo_connection import get_mongo_client


def _collection():
    client = get_mongo_client()
    if client is None:
        return None
    return client["patientscope"]["watchlist"]


def add_watchlist_entry(subject_id: int, index_stay_id: int) -> dict:
    col = _collection()
    if col is None:
        raise RuntimeError("MONGODB_URI not configured")
    doc = {
        "subject_id": subject_id,
        "index_stay_id": index_stay_id,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        col.update_one({"subject_id": subject_id}, {"$set": doc}, upsert=True)
    except PyMongoError as e:
        raise RuntimeError(f"MongoDB watchlist write failed: {e}") from e
    return doc


def remove_watchlist_entry(subject_id: int) -> bool:
    col = _collection()
    if col is None:
        raise RuntimeError("MONGODB_URI not configured")
    try:
        res = col.delete_one({"subject_id": subject_id})
        return res.deleted_count > 0
    except PyMongoError as e:
        raise RuntimeError(f"MongoDB watchlist delete failed: {e}") from e


def list_watchlist_docs() -> list[dict]:
    col = _collection()
    if col is None:
        raise RuntimeError("MONGODB_URI not configured")
    try:
        return list(col.find({}, {"_id": 0}))
    except PyMongoError as e:
        raise RuntimeError(f"MongoDB watchlist read failed: {e}") from e


def is_subject_on_watchlist(subject_id: int) -> bool:
    col = _collection()
    if col is None:
        return False
    try:
        return col.find_one({"subject_id": subject_id}, {"_id": 1}) is not None
    except PyMongoError:
        return False

