from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from backend.routes import patient, news, risk, narrative, audit, stays, vitals, ward, watchlist, discharge_events

load_dotenv()

app = FastAPI(
    title="PatientScope API",
    description="ICU clinical decision support — NEWS2, readmission risk, current vitals, narrative",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patient.router,   prefix="/api/patient",   tags=["patient"])
app.include_router(news.router,      prefix="/api/news",      tags=["news"])
app.include_router(risk.router,      prefix="/api/risk",      tags=["risk"])
app.include_router(narrative.router, prefix="/api/narrative", tags=["narrative"])
app.include_router(audit.router,     prefix="/api/audit",     tags=["audit"])
app.include_router(stays.router,    prefix="/api/stays",    tags=["stays"])
app.include_router(ward.router,      prefix="/api/ward",      tags=["ward"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(discharge_events.router, prefix="/api/discharge-events", tags=["discharge-events"])
app.include_router(vitals.router, prefix="/api/vitals", tags=["vitals"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "PatientScope", "docs": "/docs"}
