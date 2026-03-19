from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import List

from mipaper.branch_site_data import BranchManifestResult


def build_trending_site_manifest(reports_dir: Path, site_data_dir: Path) -> BranchManifestResult:
    reports = load_trending_reports(reports_dir)
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
                "snapshot_date": report["snapshot_date"],
                "since": report.get("since", "weekly"),
                "total_repositories": report["total_repositories"],
                "generated_at": report["generated_at"],
                "source_url": report["source_url"],
                "top_languages": report.get("language_distribution", [])[:5],
                "top_repositories": report.get("top_repositories", [])[:5],
                "data_path": f"data/trending/reports/{relative_path.as_posix()}",
            }
        )

    manifest = {
        "reports_count": len(manifest_reports),
        "default_report_path": manifest_reports[0]["data_path"] if manifest_reports else "",
        "reports": manifest_reports,
    }

    site_data_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = site_data_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return BranchManifestResult(manifest_path=manifest_path, manifest=manifest)


def load_trending_reports(reports_dir: Path) -> List[dict]:
    reports = []
    for path in sorted(reports_dir.rglob("*.json"), reverse=True):
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["source_path"] = path
        reports.append(payload)
    reports.sort(key=lambda item: item.get("snapshot_date", ""), reverse=True)
    return reports


def clear_generated_json(directory: Path) -> None:
    for path in directory.rglob("*.json"):
        path.unlink()
    for path in sorted(directory.rglob("*"), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()
