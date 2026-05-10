import time

from fastapi import APIRouter

from backend.services.mimic import ping_database_ms

router = APIRouter()


@router.get("/status")
def patientscope_status():
    """
    Lightweight connectivity check for the PatientScope UI (API + database latency).
    """
    t0 = time.perf_counter()
    db_ok, db_ms = ping_database_ms()
    overhead_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "service": "PatientScope",
        "api_ok": True,
        "database_ok": db_ok,
        "database_ms": round(db_ms, 1),
        "total_ms": round(overhead_ms, 1),
    }
