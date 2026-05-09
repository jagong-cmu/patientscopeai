#!/usr/bin/env python3
"""Sanity checks for Phase 0 (env file, imports, optional Postgres ping)."""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        action="store_true",
        help="Ping Postgres with DATABASE_URL (requires Docker DB running)",
    )
    args = parser.parse_args()

    errors: list[str] = []
    warnings: list[str] = []

    env_path = ROOT / ".env"
    if not env_path.is_file():
        errors.append(f"Missing {env_path} — copy .env.example and configure.")

    required = [
        "psycopg",
        "sqlalchemy",
        "dotenv",
        "anthropic",
        "fastapi",
        "certifi",
    ]
    for mod in required:
        if not _has_module(mod):
            errors.append(
                f"Python module '{mod}' not importable — activate .venv and pip install -r python/requirements.txt"
            )

    if not errors:
        from dotenv import load_dotenv

        load_dotenv(env_path)
        import os

        url = (os.environ.get("DATABASE_URL") or "").strip()
        if not url:
            errors.append("DATABASE_URL is empty in .env")
        elif url.startswith("postgresql+psycopg://") and not _has_module("psycopg"):
            errors.append("DATABASE_URL uses psycopg driver but psycopg is not installed")

        if args.db and url and not errors:
            try:
                from sqlalchemy import create_engine, text

                engine = create_engine(url)
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
            except Exception as exc:
                errors.append(
                    f"Postgres ping failed: {exc!s} — "
                    "is Postgres up? If `docker compose exec postgres psql -U mimic` works but this fails, "
                    "your DATABASE_URL port may hit a different server than Docker (try host port 5433 per docker-compose.yml)."
                )

    if errors:
        print("Phase 0 verification FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("Phase 0 verification OK:")
    print(f"  - .env present at {env_path}")
    print("  - Core Python deps importable")
    if args.db:
        print("  - DATABASE_URL accepts connections (SELECT 1)")
    else:
        print("  - Skipped DB ping (re-run with --db when Postgres is up)")
    if warnings:
        for w in warnings:
            print(f"  WARNING: {w}")
    print("\nDeferred (not required for Phase 0 closure):")
    print("  - Anthropic live API + credits (python scripts/hello_claude.py)")
    print("  - MongoDB Atlas / Vultr when you need them")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
