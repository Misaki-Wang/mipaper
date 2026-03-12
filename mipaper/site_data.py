from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List

PREFERRED_CATEGORY_ORDER = ["cs.AI", "cs.CL", "cs.CV"]


def build_site_manifest(reports_dir: Path, site_data_dir: Path) -> Path:
    reports = load_reports(reports_dir)
    report_output_dir = site_data_dir / "reports"
    report_output_dir.mkdir(parents=True, exist_ok=True)

    clear_generated_json(report_output_dir)

    manifest_reports = []
    for report in reports:
        source_path = report["source_path"]
        relative_path = source_path.relative_to(reports_dir)
        destination = report_output_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, destination)
        manifest_reports.append(
            {
                "slug": source_path.stem,
                "report_date": report["report_date"],
                "category": report["category"],
                "total_papers": report["total_papers"],
                "classifier": report["classifier"],
                "generated_at": report["generated_at"],
                "source_url": report["source_url"],
                "focus_topics": report["focus_topics"],
                "top_topics": report["topic_distribution"][:5],
                "data_path": f"data/daily/reports/{relative_path.as_posix()}",
            }
        )

    latest_by_category = []
    seen_categories = set()
    for report in manifest_reports:
        if report["category"] in seen_categories:
            continue
        seen_categories.add(report["category"])
        latest_by_category.append(report)

    latest_by_category.sort(key=lambda item: category_sort_key(item["category"]))
    default_report_path = latest_by_category[0]["data_path"] if latest_by_category else (
        manifest_reports[0]["data_path"] if manifest_reports else ""
    )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "reports_count": len(manifest_reports),
        "category_order": PREFERRED_CATEGORY_ORDER,
        "default_report_path": default_report_path,
        "latest_by_category": latest_by_category,
        "reports": manifest_reports,
    }

    manifest_path = site_data_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path


def load_reports(reports_dir: Path) -> List[dict]:
    reports = []
    for path in sorted(reports_dir.rglob("*.json"), reverse=True):
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["source_path"] = path
        reports.append(payload)

    reports.sort(
        key=lambda item: (item["report_date"], -category_sort_key(item["category"])),
        reverse=True,
    )
    return reports


def clear_generated_json(directory: Path) -> None:
    for path in directory.rglob("*.json"):
        path.unlink()
    for path in sorted(directory.rglob("*"), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()


def category_sort_key(category: str) -> int:
    try:
        return PREFERRED_CATEGORY_ORDER.index(category)
    except ValueError:
        return len(PREFERRED_CATEGORY_ORDER)
