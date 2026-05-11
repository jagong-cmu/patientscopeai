#!/usr/bin/env bash
# Run on Ubuntu Vultr VM after SSH. Clones repo (if missing), venv, installs API deps, prints next steps.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jagong-cmu/DavisHackProject.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/DavisHackProject}"

echo "==> Install system packages (git, python, venv, build tools for sklearn)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git python3 python3-venv python3-pip build-essential curl

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  echo "==> Clone $REPO_URL -> $INSTALL_DIR"
  rm -rf "$INSTALL_DIR" 2>/dev/null || true
  git clone "$REPO_URL" "$INSTALL_DIR"
else
  echo "==> Repo exists at $INSTALL_DIR — pulling latest"
  cd "$INSTALL_DIR" && git pull --ff-only
fi

cd "$INSTALL_DIR"
echo "==> Python venv at $INSTALL_DIR/.venv"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip wheel -q
pip install -r requirements-api.txt

echo ""
echo "========== NEXT STEPS (you do these manually) =========="
echo "1) Create .env in $INSTALL_DIR (copy from .env.example on your laptop or repo):"
echo "     DATABASE_URL=postgresql+psycopg://USER:PASS@HOST:5432/DBNAME"
echo "     MONGODB_URI=...   # optional"
echo "     ANTHROPIC_API_KEY=...   # optional, for narrative"
echo ""
echo "2) Smoke test (loads .env via uvicorn cwd):"
echo "     cd $INSTALL_DIR && source .venv/bin/activate"
echo "     set -a && source .env && set +a"
echo "     uvicorn backend.main:app --host 0.0.0.0 --port 8000"
echo ""
echo "3) From your laptop: curl http://YOUR_VULTR_IP:8000/health"
echo "     Open port 8000 in Vultr firewall + ufw if needed."
echo ""
echo "4) Production: put nginx TLS in front and bind uvicorn to 127.0.0.1:8000 + systemd unit."
echo "========== done =========="
