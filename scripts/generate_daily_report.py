#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from mipaper.codex_classifier import classify_with_claude, classify_with_codex
from mipaper.fetcher import DEFAULT_SHOW, build_feed_url, fetch_feed_html, parse_feed_html
from mipaper.notifiers import EmailNotifier
from mipaper.paths import DAILY_REPORTS_DIR, daily_report_dir
from mipaper.reporting import build_json_payload, render_markdown_report, write_outputs
from mipaper.topics import assign_topics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a daily topic report from papers.cool.")
    parser.add_argument("--category", default="cs.AI", help="arXiv category path segment, default: cs.AI")
    parser.add_argument(
        "--date",
        default="yesterday",
        help="YYYY-MM-DD, today, yesterday, or previous_business_day",
    )
    parser.add_argument("--show", type=int, default=DEFAULT_SHOW, help="papers.cool show parameter")
    parser.add_argument("--timezone", default="Asia/Shanghai", help="timezone for relative dates")
    parser.add_argument("--html-path", help="optional local HTML snapshot, skips network fetch")
    parser.add_argument("--paper-limit", type=int, help="optional limit for number of parsed papers")
    parser.add_argument("--classifier", choices=("rule", "codex", "claude"), default="rule", help="paper title classifier")
    parser.add_argument("--codex-model", help="optional model override for codex exec")
    parser.add_argument("--claude-model", help="optional model override for claude exec")
    parser.add_argument(
        "--codex-timeout-seconds",
        type=int,
        default=1800,
        help="timeout for codex exec when --classifier=codex",
    )
    parser.add_argument(
        "--llm-fallback",
        choices=("none", "claude"),
        default="none",
        help="optional fallback when codex is rate-limited or unavailable",
    )
    parser.add_argument("--output-dir", default=str(DAILY_REPORTS_DIR.relative_to(ROOT_DIR)), help="directory for markdown/json output")
    parser.add_argument("--notify", choices=("none", "email"), default="none", help="optional delivery channel")
    return parser.parse_args()


def previous_business_day(current_date: date) -> date:
    candidate = current_date - timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate -= timedelta(days=1)
    return candidate


def resolve_report_date(raw_value: str, timezone_name: str, now: datetime | None = None) -> str:
    now = now or datetime.now(ZoneInfo(timezone_name))
    if raw_value == "today":
        return now.date().isoformat()
    if raw_value == "yesterday":
        return (now.date() - timedelta(days=1)).isoformat()
    if raw_value == "previous_business_day":
        return previous_business_day(now.date()).isoformat()
    datetime.strptime(raw_value, "%Y-%m-%d")
    return raw_value


def main() -> int:
    args = parse_args()
    report_date = resolve_report_date(args.date, args.timezone)
    base_output_dir = Path(args.output_dir)
    default_output_dir = DAILY_REPORTS_DIR.relative_to(ROOT_DIR)
    if not base_output_dir.is_absolute() and base_output_dir == default_output_dir:
        output_dir = daily_report_dir(report_date)
    else:
        output_dir = base_output_dir / report_date
    source_url = build_feed_url(args.category, report_date, show=args.show)
    if args.html_path:
        html_text = Path(args.html_path).read_text(encoding="utf-8")
    else:
        html_text = fetch_feed_html(source_url)
    papers = parse_feed_html(html_text)
    if args.paper_limit is not None:
        papers = papers[: args.paper_limit]
    if args.classifier == "codex":
        papers = classify_with_codex(
            papers,
            model=args.codex_model,
            timeout_seconds=args.codex_timeout_seconds,
            fallback_provider=None if args.llm_fallback == "none" else args.llm_fallback,
            claude_model=args.claude_model,
        )
    elif args.classifier == "claude":
        papers = classify_with_claude(
            papers,
            model=args.claude_model,
            timeout_seconds=args.codex_timeout_seconds,
        )
    else:
        papers = assign_topics(papers)

    markdown_text = render_markdown_report(
        category=args.category,
        report_date=report_date,
        source_url=source_url,
        papers=papers,
        classifier_name=args.classifier,
    )
    payload = build_json_payload(
        category=args.category,
        report_date=report_date,
        source_url=source_url,
        papers=papers,
        classifier_name=args.classifier,
    )
    base_name = f"{args.category}-{report_date}"
    markdown_path, json_path = write_outputs(output_dir, base_name, markdown_text, payload)

    print(f"Generated report for {report_date}:")
    print(f"- Markdown: {markdown_path}")
    print(f"- JSON: {json_path}")
    print(f"- Papers: {len(papers)}")
    print(f"- Classifier: {args.classifier}")

    if args.notify == "email":
        subject = f"[Cool Paper] {args.category} {report_date} Daily Paper Classification Report"
        EmailNotifier().send(subject=subject, body=markdown_text)
        print("- Notification: email sent")
    else:
        print("- Notification: skipped")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
