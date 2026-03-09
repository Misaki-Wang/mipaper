#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ -f ".env" ]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

mkdir -p "$ROOT_DIR/reports" "$ROOT_DIR/logs"
mkdir -p "$ROOT_DIR/reports/daily" "$ROOT_DIR/reports/conference" "$ROOT_DIR/reports/hf-daily" "$ROOT_DIR/reports/debug"

TIMEZONE=${COOL_PAPER_TIMEZONE:-Asia/Shanghai}
WEEKDAY=$(TZ="$TIMEZONE" date +%u)
if [ "$WEEKDAY" -ge 6 ]; then
  echo "Skipping weekend run in timezone $TIMEZONE."
  exit 0
fi

CATEGORIES=${COOL_PAPER_CATEGORIES:-"cs.AI cs.CL cs.CV"}
for CATEGORY in $CATEGORIES; do
  python3 "$ROOT_DIR/scripts/generate_daily_report.py" \
    --category "$CATEGORY" \
    --date previous_business_day \
    --timezone "$TIMEZONE" \
    --output-dir "$ROOT_DIR/reports/daily" \
    --notify "${COOL_PAPER_NOTIFY:-none}" \
    "$@"
done

python3 "$ROOT_DIR/scripts/generate_hf_daily_report.py" \
  --date yesterday \
  --timezone "$TIMEZONE"

python3 "$ROOT_DIR/scripts/build_site_data.py"
