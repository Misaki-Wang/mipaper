#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

export PYTHONUNBUFFERED=1

if command -v nc >/dev/null 2>&1; then
  if [ "${HTTP_PROXY:-}" = "http://127.0.0.1:7890" ] && ! nc -z 127.0.0.1 7890 >/dev/null 2>&1; then
    unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
  fi
  if [ "${ALL_PROXY:-${all_proxy:-}}" = "socks5://127.0.0.1:7891" ] && ! nc -z 127.0.0.1 7891 >/dev/null 2>&1; then
    unset ALL_PROXY all_proxy
  fi
fi

python3 "$ROOT_DIR/scripts/run_scheduled_job.py" --job cool_daily "$@"
