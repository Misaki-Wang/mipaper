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

from cool_paper.codex_classifier import classify_with_codex
from cool_paper.fetcher import build_hf_daily_url, fetch_feed_html, parse_hf_daily_html
from cool_paper.hf_reporting import build_hf_json_payload, render_markdown_hf_report, write_hf_outputs
from cool_paper.paths import HF_DAILY_REPORTS_DIR
from cool_paper.topics import assign_topics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a Hugging Face daily papers report.")
    parser.add_argument("--date", default="yesterday", help="YYYY-MM-DD, today, or yesterday")
    parser.add_argument("--timezone", default="Asia/Shanghai", help="timezone for relative dates")
    parser.add_argument("--html-path", help="optional local HTML snapshot, skips network fetch")
    parser.add_argument("--classifier", choices=("rule", "codex"), default="rule", help="paper title classifier")
    parser.add_argument("--codex-model", help="optional model override for codex exec")
    parser.add_argument(
        "--codex-timeout-seconds",
        type=int,
        default=600,
        help="timeout for codex exec when --classifier=codex",
    )
    parser.add_argument("--output-dir", default=str(HF_DAILY_REPORTS_DIR.relative_to(ROOT_DIR)), help="directory for markdown/json output")
    return parser.parse_args()


def resolve_report_date(raw_value: str, timezone_name: str) -> str:
    now = datetime.now(ZoneInfo(timezone_name))
    if raw_value == "today":
        return now.date().isoformat()
    if raw_value == "yesterday":
        return (now.date() - timedelta(days=1)).isoformat()
    datetime.strptime(raw_value, "%Y-%m-%d")
    return raw_value


def main() -> int:
    args = parse_args()
    report_date = resolve_report_date(args.date, args.timezone)
    source_url = build_hf_daily_url(report_date)

    if args.html_path:
        html_text = Path(args.html_path).read_text(encoding="utf-8")
    else:
        html_text = fetch_feed_html(source_url)

    papers = parse_hf_daily_html(html_text, report_date)
    if args.classifier == "codex":
        papers = classify_with_codex(
            papers,
            model=args.codex_model,
            timeout_seconds=args.codex_timeout_seconds,
        )
    else:
        papers = assign_topics(papers)
    markdown_text = render_markdown_hf_report(
        report_date=report_date,
        source_url=source_url,
        papers=papers,
        classifier_name=args.classifier,
    )
    payload = build_hf_json_payload(
        report_date=report_date,
        source_url=source_url,
        papers=papers,
        classifier_name=args.classifier,
    )

    base_name = f"hf-daily-{report_date}"
    markdown_path, json_path = write_hf_outputs(Path(args.output_dir), base_name, markdown_text, payload)
    print(f"Generated HF daily report for {report_date}:")
    print(f"- Markdown: {markdown_path}")
    print(f"- JSON: {json_path}")
    print(f"- Papers: {len(papers)}")
    print(f"- Classifier: {args.classifier}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
