from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import List


def build_conference_site_manifest(reports_dir: Path, site_data_dir: Path) -> Path:
    reports = load_conference_reports(reports_dir)
    report_output_dir = site_data_dir / "reports"
    report_output_dir.mkdir(parents=True, exist_ok=True)
    clear_generated_json(report_output_dir)

    manifest_reports = []
    for report in reports:
        source_path = report["source_path"]
        destination = report_output_dir / source_path.name
        shutil.copyfile(source_path, destination)
        manifest_reports.append(
            {
                "slug": source_path.stem,
                "venue": report["venue"],
                "venue_series": report["venue_series"],
                "venue_year": report["venue_year"],
                "total_papers": report["total_papers"],
                "declared_total": report.get("declared_total"),
                "capture_ratio": report.get("capture_ratio"),
                "is_complete": report.get("is_complete"),
                "classifier": report["classifier"],
                "generated_at": report["generated_at"],
                "source_url": report["source_url"],
                "subject_distribution": report["subject_distribution"][:8],
                "top_topics": report["topic_distribution"][:5],
                "data_path": f"data/conference/reports/{source_path.name}",
            }
        )

    manifest = {
        "reports_count": len(manifest_reports),
        "default_report_path": manifest_reports[0]["data_path"] if manifest_reports else "",
        "reports": manifest_reports,
    }

    manifest_path = site_data_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path


def load_conference_reports(reports_dir: Path) -> List[dict]:
    reports = []
    for path in sorted(reports_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["source_path"] = path
        reports.append(payload)

    reports.sort(key=lambda item: (safe_int(item.get("venue_year")), item.get("venue_series", ""), item.get("venue", "")), reverse=True)
    return reports


def safe_int(value: str | int | None) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def clear_generated_json(directory: Path) -> None:
    for path in directory.glob("*.json"):
        path.unlink()
