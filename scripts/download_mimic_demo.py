#!/usr/bin/env python3
"""Download PhysioNet MIMIC-IV demo files using SHA256SUMS manifest (no wget required)."""

from __future__ import annotations

import argparse
import hashlib
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _ssl_context() -> ssl.SSLContext:
    """Use certifi CA bundle when present (fixes macOS python.org SSL verify failures)."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path, *, ssl_ctx: ssl.SSLContext) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".partial")
    try:
        with urllib.request.urlopen(url, context=ssl_ctx) as resp, tmp.open("wb") as out:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        tmp.replace(dest)
    except Exception:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="2.2", help="PhysioNet demo version directory")
    parser.add_argument(
        "--dest",
        type=Path,
        required=True,
        help="Destination root (creates <dest>/<version>/hosp|icu|...)",
    )
    parser.add_argument("--force", action="store_true", help="Re-download even if hash matches")
    args = parser.parse_args()

    base = f"https://physionet.org/files/mimic-iv-demo/{args.version}"
    sums_url = f"{base}/SHA256SUMS.txt"
    root = args.dest / args.version
    ssl_ctx = _ssl_context()

    print(f"Fetching manifest {sums_url}")
    try:
        with urllib.request.urlopen(sums_url, context=ssl_ctx) as resp:
            manifest = resp.read().decode("utf-8")
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        print(f"Failed to download manifest: {e}", file=sys.stderr)
        return 1

    entries: list[tuple[str, str]] = []
    for line in manifest.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            continue
        digest, rel = parts
        # Skip root-level tiny files already covered; keep all for completeness
        entries.append((digest, rel))

    total = len(entries)
    for i, (expected_digest, rel) in enumerate(entries, start=1):
        url = f"{base}/{rel.replace(chr(92), '/')}"
        dest = root / rel
        if dest.exists() and not args.force:
            try:
                if sha256_file(dest).lower() == expected_digest.lower():
                    print(f"[{i}/{total}] OK (cached) {rel}")
                    continue
            except OSError:
                pass
        print(f"[{i}/{total}] Downloading {rel} …")
        download(url, dest, ssl_ctx=ssl_ctx)
        actual = sha256_file(dest).lower()
        if actual != expected_digest.lower():
            print(f"SHA256 mismatch for {rel}: expected {expected_digest}, got {actual}", file=sys.stderr)
            return 1

    print(f"Demo data ready under {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
