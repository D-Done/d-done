#!/usr/bin/env bash
# post-create.sh — runs once after the devcontainer is created.
# Installs all dependencies for backend and frontend.

set -euo pipefail

echo "========================================"
echo "  D-Done — Setting up dev environment"
echo "========================================"

# ---- Shell niceties (zsh + Oh My Zsh) ----
echo ""
echo ">>> Installing zsh + Oh My Zsh..."
if ! command -v zsh >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends zsh git curl procps
  rm -rf /var/lib/apt/lists/*
fi

# Install Oh My Zsh only if not already installed
if [ ! -d "${HOME}/.oh-my-zsh" ]; then
  RUNZSH=no CHSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
else
  echo "    Oh My Zsh already present, skipping clone."
fi

# ---- Backend ----
echo ""
echo ">>> Installing backend dependencies..."
cd /workspace/backend
pip install --no-cache-dir -e ".[dev]"


# ---- Frontend ----
echo ""
echo ">>> Installing frontend dependencies..."
cd /workspace/frontend
npm install

# ---- Verify ----
echo ""
echo ">>> Verifying setup..."

# Check Python imports
python -c "
from app.main import app
print('  Backend imports OK')
" 2>/dev/null && true || echo "  Backend import check skipped (run from /workspace/backend)"

cd /workspace/backend
python -c "
import app.main
print('  Backend imports: OK')
"

cd /workspace/frontend
npx next --version && echo "  Frontend Next.js: OK"

echo ""
echo "========================================"
echo "  Setup complete!"
echo ""
echo "  Start backend:  cd /workspace/backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo "  Start frontend: cd /workspace/frontend && npm run dev"
echo "  Run tests:      cd /workspace/backend && pytest tests/ -v"
echo "========================================"
