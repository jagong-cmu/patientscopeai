from fastapi import APIRouter, HTTPException

from backend.schemas import WatchlistCreate, WatchlistListResponse, WatchlistRow
from backend.services.news import compute_news_score
from backend.services.watchlist_store import (
    add_watchlist_entry,
    list_watchlist_docs,
    remove_watchlist_entry,
)

router = APIRouter()

FRESHNESS_NOTE = (
    "NEWS is recomputed from the index ICU stay's last 24h chart window in MIMIC (historical snapshot). "
    "Live post-discharge telemetry is not connected in this demo."
)


def _anon(subject_id: int) -> str:
    return f"Patient {subject_id % 10000:05d}"


def _added_at_str(d: dict) -> str:
    v = d.get("added_at")
    if v is None:
        return ""
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


@router.get("", response_model=WatchlistListResponse)
def get_watchlist():
    """Monitor discharged-at-risk patients; requires MongoDB for persistence."""
    try:
        docs = list_watchlist_docs()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    entries: list[WatchlistRow] = []
    for d in docs:
        try:
            sid = int(d.get("subject_id"))
            stay_id = int(d.get("index_stay_id"))
        except (TypeError, ValueError):
            continue
        try:
            ns = compute_news_score(stay_id)
        except Exception:
            ns = None
        nt = int(ns.total_score) if ns else 0
        nb = ns.clinical_risk_band if ns else "low"
        if nb not in ("low", "medium", "high"):
            nb = "low"
        entries.append(
            WatchlistRow(
                subject_id=sid,
                index_stay_id=stay_id,
                display_patient_id=_anon(sid),
                added_at=_added_at_str(d),
                news_total=nt,
                news_band=nb,
                data_freshness_note=FRESHNESS_NOTE,
            )
        )
    return WatchlistListResponse(entries=entries)


@router.post("", response_model=WatchlistRow)
def post_watchlist(body: WatchlistCreate):
    try:
        doc = add_watchlist_entry(body.subject_id, body.index_stay_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    try:
        ns = compute_news_score(body.index_stay_id)
    except Exception:
        ns = None
    nt = int(ns.total_score) if ns else 0
    nb = ns.clinical_risk_band if ns else "low"
    if nb not in ("low", "medium", "high"):
        nb = "low"
    added_raw = doc.get("added_at", "")
    added_at = added_raw.isoformat() if hasattr(added_raw, "isoformat") else str(added_raw)
    return WatchlistRow(
        subject_id=body.subject_id,
        index_stay_id=body.index_stay_id,
        display_patient_id=_anon(body.subject_id),
        added_at=added_at,
        news_total=nt,
        news_band=nb,
        data_freshness_note=FRESHNESS_NOTE,
    )


@router.delete("/{subject_id}")
def delete_watchlist(subject_id: int):
    try:
        ok = remove_watchlist_entry(subject_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="subject not on watchlist")
    return {"ok": True}
