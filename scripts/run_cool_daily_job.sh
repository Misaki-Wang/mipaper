#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

export PYTHONUNBUFFERED=1

python3 "$ROOT_DIR/scripts/run_scheduled_job.py" --job cool_daily "$@"
