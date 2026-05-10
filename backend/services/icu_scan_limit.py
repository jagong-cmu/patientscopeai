"""Shared limit for how many ICU stays (los ≥ 1) we scan from MIMIC for roster, ward, and alerts."""

import os

# Default pulls a larger alive cohort (deaths excluded in SQL); cap avoids accidental huge scans on full MIMIC.
_ICU_STAY_SCAN_LIMIT = int(os.getenv("ICU_STAY_SCAN_LIMIT", "320"))

ICU_STAY_SCAN_LIMIT = max(1, min(800, _ICU_STAY_SCAN_LIMIT))
