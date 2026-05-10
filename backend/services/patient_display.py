"""Deterministic anonymized patient labels for UI (demo / de-identified roster)."""

from __future__ import annotations

import hashlib

_FIRST = (
    "James",
    "Maria",
    "Robert",
    "Linda",
    "Michael",
    "Patricia",
    "David",
    "Barbara",
    "William",
    "Jennifer",
    "Richard",
    "Elizabeth",
    "Joseph",
    "Susan",
    "Thomas",
    "Jessica",
    "Charles",
    "Sarah",
    "Christopher",
    "Karen",
    "Daniel",
    "Nancy",
    "Matthew",
    "Lisa",
    "Anthony",
    "Betty",
    "Mark",
    "Margaret",
    "Donald",
    "Sandra",
    "Steven",
    "Ashley",
    "Andrew",
    "Kimberly",
    "Joshua",
    "Emily",
    "Kenneth",
    "Donna",
    "Kevin",
    "Michelle",
)

_LAST = (
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
    "Hernandez",
    "Lopez",
    "Gonzalez",
    "Wilson",
    "Anderson",
    "Thomas",
    "Taylor",
    "Moore",
    "Jackson",
    "Martin",
    "Lee",
    "Perez",
    "Thompson",
    "White",
    "Harris",
    "Sanchez",
    "Clark",
    "Ramirez",
    "Lewis",
    "Robinson",
    "Walker",
    "Young",
    "Allen",
    "King",
    "Wright",
    "Scott",
    "Torres",
    "Nguyen",
    "Hill",
    "Flores",
    "Green",
    "Adams",
    "Nelson",
    "Baker",
    "Hall",
    "Rivera",
    "Campbell",
    "Mitchell",
    "Carter",
    "Roberts",
)


def patient_id_numeric(subject_id: int) -> str:
    """Five-digit display id derived from MIMIC subject_id (no PHI)."""
    return f"{int(subject_id) % 10000:05d}"


def synthetic_patient_name(subject_id: int) -> str:
    """Stable synthetic full name from subject_id (same id → same name everywhere)."""
    h = hashlib.sha256(str(int(subject_id)).encode()).hexdigest()
    fi = int(h[0:8], 16) % len(_FIRST)
    li = int(h[8:16], 16) % len(_LAST)
    return f"{_FIRST[fi]} {_LAST[li]}"
