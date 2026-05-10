"""
Demo overlay: mark a fixed slice of the alive ICU cohort as high NEWS for roster / ward visuals.

Uses the same cohort filters as list_icu_stays (deaths excluded). Override with DEMO_HIGH_NEWS_STAY_IDS.
"""

from __future__ import annotations

import os
import time

from backend.schemas import NewsParameterScore, NewsScoreResponse
from backend.services.discharge_events_store import get_discharged_stay_ids
from backend.services.icu_scan_limit import ICU_STAY_SCAN_LIMIT
from backend.services.mimic import list_icu_stays

_TTL_SEC = 15.0
_CACHE: tuple[float, frozenset[int]] | None = None


def _parse_env_ids() -> set[int] | None:
    raw = (os.getenv("DEMO_HIGH_NEWS_STAY_IDS") or "").strip()
    if not raw:
        return None
    out: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part:
            out.add(int(part))
    return out


def _pick_high_news_ids(sorted_ids: list[int], k: int, env: set[int] | None) -> set[int]:
    if not sorted_ids:
        return set()
    k = max(1, min(k, len(sorted_ids)))
    if env:
        picked: list[int] = []
        for sid in sorted_ids:
            if sid in env and sid not in picked:
                picked.append(sid)
            if len(picked) >= k:
                break
        if len(picked) < k:
            for sid in reversed(sorted_ids):
                if sid not in picked:
                    picked.append(sid)
                if len(picked) >= k:
                    break
        return set(picked[:k])
    return set(sorted_ids[-k:])


def get_high_news_demo_ids() -> frozenset[int]:
    """Stay IDs that receive a synthetic high NEWS overlay (cached briefly)."""
    global _CACHE
    now = time.monotonic()
    if _CACHE and (now - _CACHE[0]) < _TTL_SEC:
        return _CACHE[1]

    discharged = get_discharged_stay_ids()
    rows = list_icu_stays(ICU_STAY_SCAN_LIMIT)
    ids = sorted({int(r["stay_id"]) for r in rows if int(r["stay_id"]) not in discharged})
    k = max(1, min(30, int(os.getenv("DEMO_HIGH_NEWS_COUNT", "5"))))
    env = _parse_env_ids()
    chosen = _pick_high_news_ids(ids, k, env)
    fs = frozenset(chosen)
    _CACHE = (now, fs)
    return fs


def synthetic_demo_high_news(stay_id: int) -> NewsScoreResponse:
    """
    NEWS aggregate ≥7 (high band). Values are illustrative for demo UX only.
    """
    params = [
        NewsParameterScore(
            name="respiratory_rate",
            label="Respiratory rate",
            points=3,
            value_display="28 breaths/min",
            subscale_note=None,
        ),
        NewsParameterScore(
            name="spo2",
            label="SpO₂ (Scale 1)",
            points=3,
            value_display="90%",
            subscale_note="Demo overlay — verify oxygen delivery clinically.",
        ),
        NewsParameterScore(
            name="temperature",
            label="Temperature",
            points=2,
            value_display="38.6 °C",
            subscale_note=None,
        ),
        NewsParameterScore(
            name="systolic_bp",
            label="Systolic BP",
            points=3,
            value_display="88 mmHg",
            subscale_note=None,
        ),
        NewsParameterScore(
            name="pulse",
            label="Pulse",
            points=1,
            value_display="112 bpm",
            subscale_note=None,
        ),
        NewsParameterScore(
            name="consciousness",
            label="Consciousness (ACVPU)",
            points=0,
            value_display="Alert (assumed)",
            subscale_note=None,
        ),
    ]
    total = sum(p.points for p in params)
    limitations = [
        "Demo overlay: elevated NEWS aggregate for cohort illustration — not derived from live chart extraction "
        f"for stay {stay_id}.",
        "NEWS2 thresholds follow UK RCP aggregate scoring (low 0–4, medium 5–6, high ≥7).",
    ]
    return NewsScoreResponse(
        stay_id=stay_id,
        total_score=total,
        clinical_risk_band="high",
        parameters=params,
        evidence=["Synthetic demo aggregate for PatientScope presentation."],
        limitations=limitations,
        scale_note="Demo high NEWS overlay (Scale 1 SpO₂).",
    )
