"""Shared limit for how many ICU stays (los ≥ 1) we scan from MIMIC for roster, ward, and alerts."""

import os

# MIMIC-IV demo supports ~100 ICU stays with LOS ≥ 1; cap avoids accidental huge scans.
_ICU_STAY_SCAN_LIMIT = int(os.getenv("ICU_STAY_SCAN_LIMIT", "100"))

ICU_STAY_SCAN_LIMIT = max(1, min(500, _ICU_STAY_SCAN_LIMIT))
