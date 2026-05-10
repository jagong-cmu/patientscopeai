"""Split ICU cohort into occupied beds vs overflow pending queue (same ordering as MIMIC scan)."""

from __future__ import annotations

import os


def ward_bed_capacity() -> int:
    return max(1, int(os.getenv("WARD_BED_CAPACITY", "100")))


def sort_stays_by_id(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: int(r["stay_id"]))


def split_in_unit_vs_pending(rows: list[dict], capacity: int | None = None) -> tuple[list[dict], list[dict]]:
    """
    First `capacity` stays (by stay_id) are treated as physically in-unit; remainder await a bed.
    """
    cap = ward_bed_capacity() if capacity is None else max(1, capacity)
    ordered = sort_stays_by_id(rows)
    return ordered[:cap], ordered[cap:]
