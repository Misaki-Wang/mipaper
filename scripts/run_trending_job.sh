#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

python3 "$ROOT_DIR/scripts/run_scheduled_job.py" --job trending "$@"
