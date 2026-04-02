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

from mipaper.fetcher import (
    build_ruanyf_magazine_docs_url,
    build_ruanyf_magazine_issue_html_url,
    build_ruanyf_magazine_issue_raw_url,
    extract_latest_ruanyf_magazine_issue_number,
    fetch_feed_html,
)
from mipaper.paths import MAGAZINE_REPORTS_DIR, magazine_report_dir
from mipaper.magazine_reporting import (
    build_magazine_json_payload,
    parse_magazine_issue_markdown,
    render_markdown_magazine_report,
    write_magazine_outputs,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a synced Magazine report from ruanyf/weekly.")
    parser.add_argument("--date", default="today", help="YYYY-MM-DD, today, or yesterday")
    parser.add_argument("--timezone", default="Asia/Shanghai", help="timezone for relative dates")
    parser.add_argument("--issue-number", type=int, help="specific issue number to sync")
    parser.add_argument("--docs-html-path", help="optional local docs HTML snapshot for discovering the latest issue")
    parser.add_argument("--markdown-path", help="optional local Markdown snapshot, skips network fetch")
    parser.add_argument("--output-dir", default=str(MAGAZINE_REPORTS_DIR.relative_to(ROOT_DIR)))
    return parser.parse_args()


def resolve_sync_date(raw_value: str, timezone_name: str) -> str:
    now = datetime.now(ZoneInfo(timezone_name))
    if raw_value == "today":
        return now.date().isoformat()
    if raw_value == "yesterday":
        return (now.date() - timedelta(days=1)).isoformat()
    datetime.strptime(raw_value, "%Y-%m-%d")
    return raw_value


def resolve_issue_number(args: argparse.Namespace) -> int:
    if args.issue_number:
        return args.issue_number

    if args.docs_html_path:
        docs_html = Path(args.docs_html_path).read_text(encoding="utf-8")
    else:
        docs_html = fetch_feed_html(build_ruanyf_magazine_docs_url())

    issue_number = extract_latest_ruanyf_magazine_issue_number(docs_html)
    if issue_number is None:
        raise RuntimeError("Unable to resolve the latest Magazine issue number from the ruanyf/weekly docs page.")
    return issue_number


def main() -> int:
    args = parse_args()
    sync_date = resolve_sync_date(args.date, args.timezone)
    issue_number = resolve_issue_number(args)
    source_url = build_ruanyf_magazine_issue_html_url(issue_number)
    raw_url = build_ruanyf_magazine_issue_raw_url(issue_number)

    if args.markdown_path:
        markdown_text = Path(args.markdown_path).read_text(encoding="utf-8")
    else:
        markdown_text = fetch_feed_html(raw_url)

    issue = parse_magazine_issue_markdown(
        markdown_text,
        sync_date=sync_date,
        issue_number=issue_number,
        source_url=source_url,
        raw_url=raw_url,
    )
    markdown_report = render_markdown_magazine_report(issue)
    payload = build_magazine_json_payload(issue)

    base_output_dir = Path(args.output_dir)
    default_output_dir = MAGAZINE_REPORTS_DIR.relative_to(ROOT_DIR)
    output_dir = magazine_report_dir(issue.issue_slug) if not base_output_dir.is_absolute() and base_output_dir == default_output_dir else base_output_dir / issue.issue_slug
    base_name = f"magazine-{issue.issue_slug}"
    markdown_path, json_path = write_magazine_outputs(output_dir, base_name, markdown_report, payload)

    print(f"Generated magazine report for issue {issue.issue_number}:")
    print(f"- Markdown: {markdown_path}")
    print(f"- JSON: {json_path}")
    print(f"- Source: {source_url}")
    print(f"- Sections: {len(issue.sections)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
