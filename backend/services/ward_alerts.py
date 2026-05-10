"""
Critical ward alerts: lab trajectory thresholds/acceleration and NEWS elevation on watched stays.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from backend.schemas import WardAlertItem, WardAlertPatientTag
from backend.services.discharge_events_store import get_discharged_stay_ids
from backend.services.icu_scan_limit import ICU_STAY_SCAN_LIMIT
from backend.services.mimic import get_labs_last48h, list_icu_stays
from backend.services.news import compute_news_score
from backend.services.watchlist_store import list_watchlist_docs

# Lab itemids (align with mimic SQL)
LACTATE = 50813
CREATININE = 50912
WBC = 51301

SURNAMES = (
    "Chen",
    "Patel",
    "Garcia",
    "Nguyen",
    "Okafor",
    "Kim",
    "Martinez",
    "Brown",
    "Singh",
    "Lee",
)
GIVEN = ("W", "A", "M", "J", "R", "S", "L", "K", "D", "T")


def synthetic_name(subject_id: int) -> str:
    h = hashlib.sha256(str(subject_id).encode()).hexdigest()
    si = int(h[:8], 16) % len(SURNAMES)
    gi = int(h[8:16], 16) % len(GIVEN)
    return f"{SURNAMES[si]}, {GIVEN[gi]}."


def _iso(ct: Any) -> str:
    if ct is None:
        return datetime.now(timezone.utc).isoformat()
    if hasattr(ct, "isoformat"):
        return ct.isoformat()
    return str(ct)


def _mins_ago(ct: Any) -> str:
    if ct is None:
        return "recently"
    try:
        if hasattr(ct, "timestamp"):
            t = ct.timestamp()
        else:
            t = datetime.fromisoformat(str(ct).replace("Z", "+00:00")).timestamp()
        delta = max(0, (datetime.now(timezone.utc).timestamp() - t) / 60)
        if delta < 90:
            return f"{int(delta)} min ago"
        return f"{int(delta / 60)} h ago"
    except Exception:
        return "recently"


def _patient_tags(stay_id: int, watch_stays: set[int]) -> list[WardAlertPatientTag]:
    tags: list[WardAlertPatientTag] = ["icu"]
    if stay_id in watch_stays:
        tags.append("post_monitoring")
    return tags


def _ward_enriched_rows() -> list[dict]:
    discharged = get_discharged_stay_ids()
    rows = [r for r in list_icu_stays(ICU_STAY_SCAN_LIMIT) if r["stay_id"] not in discharged]
    enriched: list[dict] = []
    for r in rows:
        sid = int(r["stay_id"])
        ns = compute_news_score(sid)
        if not ns:
            continue
        los = r.get("icu_los_hours")
        enriched.append(
            {
                "stay_id": sid,
                "subject_id": int(r["subject_id"]),
                "news_total": ns.total_score,
                "news_band": ns.clinical_risk_band,
                "icu_los_hours": float(los) if los is not None else None,
            }
        )
    return enriched


def discharge_queue_stay_ids(enriched: list[dict]) -> set[int]:
    dq = sorted(
        enriched,
        key=lambda x: (x["news_total"], -(x["icu_los_hours"] or 0.0)),
    )[:10]
    return {int(x["stay_id"]) for x in dq}


def build_ward_alerts() -> list[WardAlertItem]:
    enriched = _ward_enriched_rows()
    dq_ids = discharge_queue_stay_ids(enriched)
    watch_stays: set[int] = set()
    try:
        for doc in list_watchlist_docs():
            try:
                watch_stays.add(int(doc["index_stay_id"]))
            except (TypeError, KeyError, ValueError):
                continue
    except Exception:
        pass

    watch_union = dq_ids | watch_stays
    alerts: list[WardAlertItem] = []
    lab_uid = 0

    # Lab trajectory (census) — max 2 alerts per stay
    for row in enriched:
        stay_id = int(row["stay_id"])
        sid = int(row["subject_id"])
        nm = synthetic_name(sid)
        labs = get_labs_last48h(stay_id)
        by_item: dict[int, list[dict]] = {}
        for lab in labs:
            iid = int(lab["itemid"])
            by_item.setdefault(iid, []).append(lab)
        added = 0
        for iid, series in by_item.items():
            if added >= 2:
                break
            series.sort(key=lambda x: x["charttime"])
            label = str(series[-1].get("label") or iid)
            uom = (series[-1].get("valueuom") or "").strip()
            ct = series[-1]["charttime"]
            vals = [float(x["valuenum"]) for x in series]

            if len(vals) >= 3:
                d1 = vals[-2] - vals[-3]
                d2 = vals[-1] - vals[-2]
                if d1 > 0 and d2 > 0 and d2 > d1 * 1.15:
                    lab_uid += 1
                    alerts.append(
                        WardAlertItem(
                            id=f"lab-{stay_id}-{iid}-acc-{lab_uid}",
                            category="lab_trajectory",
                            message=(
                                f"{nm} — {label} ↑ {vals[-3]:.2f} → {vals[-2]:.2f} → {vals[-1]:.2f}"
                                f"{(' ' + uom) if uom else ''}, {_mins_ago(ct)}."
                            ),
                            occurred_at=_iso(ct),
                            stay_id=stay_id,
                            tags=_patient_tags(stay_id, watch_stays),
                        )
                    )
                    added += 1
                    continue

            if len(vals) >= 2:
                pval, val = vals[-2], vals[-1]
                if iid == LACTATE and pval < 4 <= val:
                    lab_uid += 1
                    alerts.append(
                        WardAlertItem(
                            id=f"lab-{stay_id}-{iid}-cross-{lab_uid}",
                            category="lab_trajectory",
                            message=(
                                f"{nm} — {label} ↑ {pval:.1f} → {val:.1f}"
                                f"{(' ' + uom) if uom else ''}, {_mins_ago(ct)}."
                            ),
                            occurred_at=_iso(ct),
                            stay_id=stay_id,
                            tags=_patient_tags(stay_id, watch_stays),
                        )
                    )
                    added += 1
                    continue
                if iid == CREATININE and val >= 2.0 and val > pval * 1.25:
                    lab_uid += 1
                    alerts.append(
                        WardAlertItem(
                            id=f"lab-{stay_id}-{iid}-cr-{lab_uid}",
                            category="lab_trajectory",
                            message=(
                                f"{nm} — {label} ↑ {pval:.2f} → {val:.2f}"
                                f"{(' ' + uom) if uom else ''}, {_mins_ago(ct)}."
                            ),
                            occurred_at=_iso(ct),
                            stay_id=stay_id,
                            tags=_patient_tags(stay_id, watch_stays),
                        )
                    )
                    added += 1
                    continue

            if len(vals) == 1 and iid == LACTATE and vals[-1] >= 4.0:
                lab_uid += 1
                alerts.append(
                    WardAlertItem(
                        id=f"lab-{stay_id}-{iid}-thr-{lab_uid}",
                        category="lab_trajectory",
                        message=(
                            f"{nm} — {label} {vals[-1]:.1f}"
                            f"{(' ' + uom) if uom else ''} (≥4), {_mins_ago(ct)}."
                        ),
                        occurred_at=_iso(ct),
                        stay_id=stay_id,
                        tags=_patient_tags(stay_id, watch_stays),
                    )
                )
                added += 1

    # NEWS on discharge-tracked or post-monitoring
    for row in enriched:
        stay_id = int(row["stay_id"])
        if stay_id not in watch_union:
            continue
        nt = int(row["news_total"])
        if nt < 7 and row["news_band"] != "high":
            continue
        sid = int(row["subject_id"])
        nm = synthetic_name(sid)
        dq_note = " · Discharge-queue candidate" if stay_id in dq_ids else ""
        alerts.append(
            WardAlertItem(
                id=f"news-{stay_id}",
                category="news_context",
                message=f"{nm} — NEWS {nt} ({row['news_band']}){dq_note}.",
                occurred_at=datetime.now(timezone.utc).isoformat(),
                stay_id=stay_id,
                tags=_patient_tags(stay_id, watch_stays),
            )
        )

    alerts.sort(key=lambda a: a.occurred_at, reverse=True)
    return alerts[:40]
