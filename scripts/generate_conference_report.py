#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from cool_paper.codex_classifier import classify_with_codex
from cool_paper.conference_reporting import (
    build_conference_json_payload,
    render_markdown_conference_report,
    write_conference_outputs,
)
from cool_paper.fetcher import build_venue_url, extract_total_papers, fetch_complete_venue_snapshot, parse_feed_html
from cool_paper.paths import CONFERENCE_REPORTS_DIR
from cool_paper.topics import assign_topics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a conference analysis report from papers.cool venue pages.")
    parser.add_argument("--venue", required=True, help="venue slug, e.g. CVPR.2025 or ICLR.2026")
    parser.add_argument("--group", default="", help="optional papers.cool Subject group filter, e.g. Oral")
    parser.add_argument("--html-path", help="optional local HTML snapshot, skips network fetch")
    parser.add_argument(
        "--classifier",
        choices=("rule", "codex"),
        default="rule",
        help="classification backend for topic tagging",
    )
    parser.add_argument(
        "--output-dir",
        default=str(CONFERENCE_REPORTS_DIR.relative_to(ROOT_DIR)),
        help="directory for markdown/json output",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_url = build_venue_url(args.venue, group=args.group)
    requested_show = None
    declared_total = None

    if args.html_path:
        html_text = Path(args.html_path).read_text(encoding="utf-8")
        declared_total = extract_total_papers(html_text)
    else:
        html_text, source_url, declared_total, requested_show = fetch_complete_venue_snapshot(
            args.venue,
            group=args.group,
        )

    papers = parse_feed_html(html_text)
    if args.classifier == "codex":
        papers = classify_with_codex(papers)
    else:
        papers = assign_topics(papers)

    fetch_metadata = {
        "declared_total": declared_total,
        "requested_show": requested_show,
        "is_complete": len(papers) >= declared_total if declared_total else None,
    }

    markdown_text = render_markdown_conference_report(
        venue=args.venue,
        source_url=source_url,
        papers=papers,
        classifier_name=args.classifier,
        fetch_metadata=fetch_metadata,
    )
    payload = build_conference_json_payload(
        venue=args.venue,
        source_url=source_url,
        papers=papers,
        classifier_name=args.classifier,
        fetch_metadata=fetch_metadata,
    )

    base_name = args.venue if not args.group else f"{args.venue}-{args.group}"
    markdown_path, json_path = write_conference_outputs(Path(args.output_dir), base_name, markdown_text, payload)
    print(f"Generated conference report for {args.venue}:")
    print(f"- Markdown: {markdown_path}")
    print(f"- JSON: {json_path}")
    print(f"- Papers: {len(papers)}")
    if declared_total is not None:
        print(f"- Venue total: {declared_total}")
    if requested_show is not None:
        print(f"- Requested show: {requested_show}")
    print(f"- Classifier: {args.classifier}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
