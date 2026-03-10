#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

python3 "$ROOT_DIR/scripts/run_scheduled_job.py" --job hf_daily "$@"
