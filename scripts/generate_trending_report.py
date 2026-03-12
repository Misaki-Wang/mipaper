#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from cool_paper.fetcher import build_github_trending_url, fetch_feed_html, parse_github_trending_html
from cool_paper.paths import TRENDING_REPORTS_DIR
from cool_paper.trending_reporting import (
    build_trending_json_payload,
    render_markdown_trending_report,
    write_trending_outputs,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a GitHub Trending report.")
    parser.add_argument("--date", default="today", help="YYYY-MM-DD, today, or yesterday")
    parser.add_argument("--timezone", default="Asia/Shanghai", help="timezone for relative dates")
    parser.add_argument("--since", default="weekly", choices=("daily", "weekly", "monthly"))
    parser.add_argument("--spoken-language-code", default="", help="optional GitHub spoken language code")
    parser.add_argument("--html-path", help="optional local HTML snapshot, skips network fetch")
    parser.add_argument("--output-dir", default=str(TRENDING_REPORTS_DIR.relative_to(ROOT_DIR)))
    return parser.parse_args()


def resolve_snapshot_date(raw_value: str, timezone_name: str) -> str:
    now = datetime.now(ZoneInfo(timezone_name))
    if raw_value == "today":
        return now.date().isoformat()
    if raw_value == "yesterday":
        return (now.date() - timedelta(days=1)).isoformat()
    datetime.strptime(raw_value, "%Y-%m-%d")
    return raw_value


def main() -> int:
    args = parse_args()
    snapshot_date = resolve_snapshot_date(args.date, args.timezone)
    source_url = build_github_trending_url(args.since, args.spoken_language_code)

    if args.html_path:
        html_text = Path(args.html_path).read_text(encoding="utf-8")
    else:
        html_text = fetch_feed_html(source_url)

    repos = parse_github_trending_html(html_text, snapshot_date)
    markdown_text = render_markdown_trending_report(
        snapshot_date=snapshot_date,
        source_url=source_url,
        repos=repos,
        since=args.since,
    )
    payload = build_trending_json_payload(
        snapshot_date=snapshot_date,
        source_url=source_url,
        repos=repos,
        since=args.since,
    )

    base_name = f"trending-{snapshot_date}"
    markdown_path, json_path = write_trending_outputs(Path(args.output_dir), base_name, markdown_text, payload)
    print(f"Generated trending report for {snapshot_date}:")
    print(f"- Markdown: {markdown_path}")
    print(f"- JSON: {json_path}")
    print(f"- Repositories: {len(repos)}")
    print(f"- Window: {args.since}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
