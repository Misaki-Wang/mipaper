#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

if [ -f "$ROOT_DIR/.dev.vars" ]; then
  set -a
  . "$ROOT_DIR/.dev.vars"
  set +a
fi

python3 "$ROOT_DIR/scripts/run_scheduled_job.py" --job magazine "$@"
