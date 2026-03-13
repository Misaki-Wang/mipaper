#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from mipaper.paths import conference_report_dir


def parse_links(path: Path) -> list[dict]:
    links = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("http"):
            # Parse URL: https://papers.cool/venue/CVPR.2025?show=30000
            parts = line.split("/venue/")[-1].split("?")[0].split()
            venue = parts[0]
            group = ""
            classifier = "codex"
        else:
            parts = line.split()
            venue = parts[0]
            group = parts[1] if len(parts) > 1 and parts[1] not in ("rule", "codex", "claude") else ""
            classifier = parts[-1] if parts[-1] in ("rule", "codex", "claude") else "codex"

        links.append({"venue": venue, "group": group, "classifier": classifier})
    return links


def is_crawled(venue: str, group: str) -> bool:
    report_dir = conference_report_dir(venue)
    base_name = venue if not group else f"{venue}-{group}"
    return (report_dir / f"{base_name}.json").exists()


def main() -> int:
    link_file = ROOT_DIR / "conference_links.txt"
    if not link_file.exists():
        print(f"Link file not found: {link_file}")
        return 1

    links = parse_links(link_file)
    for item in links:
        venue, group, classifier = item["venue"], item["group"], item["classifier"]
        if is_crawled(venue, group):
            print(f"Skip {venue} {group or '(all)'} - already crawled")
            continue

        print(f"Crawling {venue} {group or '(all)'} with {classifier}...")
        cmd = [
            sys.executable,
            str(ROOT_DIR / "scripts/generate_conference_report.py"),
            "--venue", venue,
            "--classifier", classifier,
            "--llm-fallback", "claude",
        ]
        if group:
            cmd.extend(["--group", group])

        result = subprocess.run(cmd)
        if result.returncode != 0:
            print(f"Failed to crawl {venue} {group}")
            return 1

    print("All conferences crawled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
