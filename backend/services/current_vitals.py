"""Latest-per-item vitals from chartevents (last 24h of ICU stay)."""

from backend.schemas import (
    CurrentVitalsResponse,
    VitalSeriesPoint,
    VitalTimeSeries,
    VitalsRow,
    VitalsSeriesResponse,
)
from backend.services.mimic import get_patient_summary, get_vitals_last24h


def _charttime_iso(ct) -> str | None:
    if ct is None:
        return None
    if hasattr(ct, "isoformat"):
        return ct.isoformat()
    return str(ct)


def build_current_vitals(stay_id: int) -> CurrentVitalsResponse | None:
    if not get_patient_summary(stay_id):
        return None
    rows = get_vitals_last24h(stay_id)
    latest: dict[int, dict] = {}
    for r in rows:
        iid = int(r["itemid"])
        ct = r["charttime"]
        prev = latest.get(iid)
        if prev is None or ct > prev["charttime"]:
            latest[iid] = r
    vitals: list[VitalsRow] = []
    for iid in sorted(latest.keys(), key=lambda x: (latest[x].get("label") or "").lower()):
        r = latest[iid]
        vitals.append(
            VitalsRow(
                itemid=iid,
                label=r.get("label") or str(iid),
                value=float(r["valuenum"]),
                charttime_iso=_charttime_iso(r["charttime"]),
            )
        )
    return CurrentVitalsResponse(stay_id=stay_id, vitals=vitals)


def build_vitals_series(stay_id: int) -> VitalsSeriesResponse | None:
    if not get_patient_summary(stay_id):
        return None
    rows = get_vitals_last24h(stay_id)
    by_item: dict[int, list[dict]] = {}
    for r in rows:
        iid = int(r["itemid"])
        by_item.setdefault(iid, []).append(r)
    out: list[VitalTimeSeries] = []
    for iid in sorted(by_item.keys(), key=lambda x: (by_item[x][0].get("label") or "").lower()):
        rs = by_item[iid]
        rs.sort(key=lambda x: x["charttime"])
        label = rs[0].get("label") or str(iid)
        points = [
            VitalSeriesPoint(
                charttime_iso=_charttime_iso(r["charttime"]),
                valuenum=float(r["valuenum"]),
            )
            for r in rs
        ]
        out.append(VitalTimeSeries(itemid=iid, label=label, points=points))
    return VitalsSeriesResponse(stay_id=stay_id, series=out)
