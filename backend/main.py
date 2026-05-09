from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from backend.routes import patient, readiness, risk, narrative, audit, stays, trajectories

load_dotenv()

app = FastAPI(
    title="PatientScope API",
    description="ICU discharge readiness assessment — transparent, multi-definition, bias-aware",
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
app.include_router(readiness.router, prefix="/api/readiness", tags=["readiness"])
app.include_router(risk.router,      prefix="/api/risk",      tags=["risk"])
app.include_router(narrative.router, prefix="/api/narrative", tags=["narrative"])
app.include_router(audit.router,     prefix="/api/audit",     tags=["audit"])
app.include_router(stays.router,    prefix="/api/stays",    tags=["stays"])
app.include_router(trajectories.router, prefix="/api/trajectories", tags=["trajectories"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "PatientScope", "docs": "/docs"}
