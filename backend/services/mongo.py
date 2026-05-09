"""MongoDB Atlas — similar case retrieval via vector search."""
import os
import numpy as np
from pymongo import MongoClient
from backend.schemas import SimilarCase

_client = None


def _get_collection():
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI", "")
        if not uri:
            return None
        _client = MongoClient(uri)
    return _client["patientscope"]["icu_stays"]


def upsert_stay_vector(stay_id: int, feature_vector: list[float], metadata: dict):
    """Store a stay's feature vector and metadata in MongoDB."""
    col = _get_collection()
    if col is None:
        return
    col.update_one(
        {"stay_id": stay_id},
        {"$set": {"stay_id": stay_id, "features": feature_vector, **metadata}},
        upsert=True,
    )


def find_similar_cases(stay_id: int, k: int = 5) -> list[SimilarCase]:
    """
    Return k most similar historical ICU stays using cosine similarity.
    Falls back to empty list if MongoDB is unavailable.
    """
    col = _get_collection()
    if col is None:
        return []

    query_doc = col.find_one({"stay_id": stay_id})
    if not query_doc or "features" not in query_doc:
        return []

    query_vec = np.array(query_doc["features"])
    results = []

    for doc in col.find({"stay_id": {"$ne": stay_id}}):
        if "features" not in doc:
            continue
        candidate = np.array(doc["features"])

        # Cosine similarity (handle NaN by zeroing)
        q = np.nan_to_num(query_vec)
        c = np.nan_to_num(candidate)
        denom = np.linalg.norm(q) * np.linalg.norm(c)
        if denom == 0:
            continue
        similarity = float(np.dot(q, c) / denom)

        differences = _describe_differences(query_doc, doc)
        results.append(
            SimilarCase(
                stay_id=doc["stay_id"],
                similarity=round(similarity, 3),
                readmitted=doc.get("readmitted_30d", False),
                readmission_definition="30-day all-cause",
                key_differences=differences,
            )
        )

    results.sort(key=lambda x: x.similarity, reverse=True)
    return results[:k]


def _describe_differences(query: dict, candidate: dict) -> list[str]:
    """Generate plain-language descriptions of key feature differences."""
    diffs = []
    feature_labels = [
        ("HR mean", 0),
        ("MAP mean", 1),
        ("creatinine last", 5),
        ("BUN last", 7),
        ("lactate last", 8),
        ("LOS hours", 4),
    ]
    q_feat = np.nan_to_num(np.array(query.get("features", [])))
    c_feat = np.nan_to_num(np.array(candidate.get("features", [])))

    for label, idx in feature_labels:
        if idx < len(q_feat) and idx < len(c_feat):
            delta = c_feat[idx] - q_feat[idx]
            if abs(delta) > 0.1 * max(abs(q_feat[idx]), 1):
                direction = "higher" if delta > 0 else "lower"
                diffs.append(f"{label} {direction} ({delta:+.1f})")

    return diffs[:3] or ["similar profile overall"]
