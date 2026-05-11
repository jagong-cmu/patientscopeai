#!/usr/bin/env bash
# Run ON the Vultr VM (SSH session). Collects read-only diagnostics; masks secrets.
set -euo pipefail

echo "========== HOST / USER / TIME =========="
hostname
date -u
whoami
uname -a || true

echo ""
echo "========== LISTENING PORTS (8000, 5432, 80, 443) =========="
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>/dev/null | grep -E ':8000|:5432|:80 |:443 ' || ss -tlnp 2>/dev/null | head -30
elif command -v netstat >/dev/null 2>&1; then
  netstat -tlnp 2>/dev/null | grep -E ':8000|:5432|:80 |:443 ' || netstat -tlnp 2>/dev/null | head -30
else
  echo "ss/netstat not found"
fi

echo ""
echo "========== LOCAL API (uvicorn typical) =========="
for path in /health /api/status /docs; do
  echo "--- GET http://127.0.0.1:8000${path} ---"
  curl -sS -m 5 -w "\nHTTP_CODE:%{http_code}\n" "http://127.0.0.1:8000${path}" 2>&1 | head -20 || echo "FAILED"
done

echo ""
echo "========== DOCKER (if used) =========="
if command -v docker >/dev/null 2>&1; then
  docker ps -a 2>&1 | head -25
else
  echo "docker not installed or not in PATH"
fi

echo ""
echo "========== SYSTEMD (common unit name guesses) =========="
for u in patientscope fastapi uvicorn gunicorn nginx; do
  if systemctl list-unit-files "${u}.service" 2>/dev/null | grep -q "${u}.service"; then
    echo "--- systemctl status ${u} ---"
    systemctl status "${u}" --no-pager -l 2>&1 | head -35 || true
  fi
done
if systemctl is-active nginx 2>/dev/null; then
  echo "--- nginx -t ---"
  sudo nginx -t 2>&1 || nginx -t 2>&1 || true
fi

echo ""
echo "========== NGINX ERROR LOG (last 40 lines) =========="
for f in /var/log/nginx/error.log /usr/local/var/log/nginx/error.log; do
  if [[ -r "$f" ]]; then
    echo "--- $f ---"
    tail -n 40 "$f" 2>&1
    break
  fi
done
[[ ! -r /var/log/nginx/error.log ]] && [[ ! -r /usr/local/var/log/nginx/error.log ]] && echo "(no readable nginx error.log)"

echo ""
echo "========== ENV HINTS (no secret values) =========="
# Typical PatientScope / Postgres
for v in DATABASE_URL POSTGRES_HOST POSTGRES_PORT POSTGRES_DB MONGODB_URI; do
  if [[ -n "${!v:-}" ]]; then
    echo "${v}=***set***"
  else
    echo "${v}=(unset)"
  fi
done

echo ""
echo "========== POSTGRES REACHABILITY (if client exists) =========="
if command -v pg_isready >/dev/null 2>&1; then
  H="${POSTGRES_HOST:-127.0.0.1}"
  P="${POSTGRES_PORT:-5432}"
  pg_isready -h "$H" -p "$P" 2>&1 || true
else
  echo "pg_isready not installed (optional)"
fi

echo ""
echo "========== UFW (if installed) =========="
if command -v ufw >/dev/null 2>&1; then
  sudo ufw status verbose 2>&1 | head -30 || ufw status 2>&1 | head -30 || true
else
  echo "ufw not found"
fi

echo ""
echo "========== RECENT JOURNAL (nginx + ssh, last 30 lines each) =========="
if command -v journalctl >/dev/null 2>&1; then
  journalctl -u nginx -n 30 --no-pager 2>&1 | tail -35 || true
else
  echo "journalctl not available"
fi

echo ""
echo "========== DONE =========="
echo "Copy everything above into your support thread (redact any IPs if needed)."
