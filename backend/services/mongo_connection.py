"""Shared MongoDB client for Atlas — explicit TLS CA bundle avoids SSL handshake failures on many macOS/Python setups."""
from __future__ import annotations

import os

import certifi
from pymongo import MongoClient

_client: MongoClient | None = None


def get_mongo_client() -> MongoClient | None:
    """
    Return a singleton MongoClient, or None if MONGODB_URI is unset.

    Uses certifi's CA bundle for tlsCAFile so TLS to Atlas succeeds when the
    interpreter's default trust store is incomplete (common with python.org macOS builds).
    """
    global _client
    uri = (os.getenv("MONGODB_URI") or "").strip()
    if not uri:
        return None
    if _client is None:
        _client = MongoClient(
            uri,
            serverSelectionTimeoutMS=8000,
            tlsCAFile=certifi.where(),
        )
    return _client
