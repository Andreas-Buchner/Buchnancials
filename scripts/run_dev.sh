#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d ".venv" ]; then
  uv venv
fi

uv sync --extra dev
exec uv run uvicorn app.main:app --reload

