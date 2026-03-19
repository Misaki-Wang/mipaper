from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, List


@dataclass(frozen=True)
class BranchManifestResult:
    manifest_path: Path
    manifest: dict


def load_reports(reports_dir: Path, sort_key: Callable[[dict], object]) -> List[dict]:
    reports = []
    for path in sorted(reports_dir.rglob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["source_path"] = path
        reports.append(payload)

    reports.sort(key=sort_key, reverse=True)
    return reports


def clear_generated_json(directory: Path) -> None:
    for path in directory.rglob("*.json"):
        path.unlink()
    for path in sorted(directory.rglob("*"), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()


def build_branch_manifest(
    *,
    reports_dir: Path,
    site_data_root: Path,
    branch_key: str,
    branch_label: str,
    report_sort_key: Callable[[dict], object],
    report_entry_builder: Callable[[dict], dict],
) -> BranchManifestResult:
    reports = load_reports(reports_dir, report_sort_key)
    branch_output_dir = site_data_root / branch_key
    report_output_dir = branch_output_dir / "reports"
    report_output_dir.mkdir(parents=True, exist_ok=True)
    clear_generated_json(report_output_dir)

    manifest_reports = []
    for report in reports:
        source_path = report["source_path"]
        relative_path = source_path.relative_to(reports_dir)
        destination = report_output_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, destination)

        entry = {
            "branch_key": branch_key,
            "branch_label": branch_label,
            "data_path": f"data/{branch_key}/reports/{relative_path.as_posix()}",
            **report_entry_builder(report),
        }
        manifest_reports.append(entry)

    manifest = {
        "branch_key": branch_key,
        "branch_label": branch_label,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "reports_count": len(manifest_reports),
        "default_report_path": manifest_reports[0]["data_path"] if manifest_reports else "",
        "reports": manifest_reports,
    }

    manifest_path = branch_output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return BranchManifestResult(manifest_path=manifest_path, manifest=manifest)


def build_branch_catalog(site_data_root: Path, branch_manifests: Iterable[dict]) -> BranchManifestResult:
    catalog_dir = site_data_root / "branches"
    catalog_dir.mkdir(parents=True, exist_ok=True)
    clear_generated_json(catalog_dir)

    branches = []
    reports = []
    for manifest in branch_manifests:
        branch_key = str(manifest.get("branch_key") or "").strip()
        branch_label = str(manifest.get("branch_label") or branch_key).strip()
        branches.append(
            {
                "branch_key": branch_key,
                "branch_label": branch_label,
                "reports_count": manifest.get("reports_count", 0),
                "default_report_path": manifest.get("default_report_path", ""),
                "manifest_path": f"data/{branch_key}/manifest.json" if branch_key else "",
            }
        )
        for report in manifest.get("reports", []):
            reports.append(
                {
                    "branch_key": branch_key,
                    "branch_label": branch_label,
                    "search_text": build_search_text(report, branch_key, branch_label),
                    **report,
                }
            )

    catalog = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "reports_count": len(reports),
        "branches": branches,
        "reports": reports,
    }

    catalog_path = catalog_dir / "manifest.json"
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    return BranchManifestResult(manifest_path=catalog_path, manifest=catalog)


def build_search_text(report: dict, branch_key: str, branch_label: str) -> str:
    values = [
        branch_key,
        branch_label,
        report.get("slug"),
        report.get("data_path"),
        report.get("source_url"),
        report.get("classifier"),
        report.get("report_date"),
        report.get("snapshot_date"),
        report.get("category"),
        report.get("venue"),
        report.get("venue_series"),
        report.get("venue_year"),
    ]
    values.extend(extract_nested_text(report.get("focus_topics")))
    values.extend(extract_nested_text(report.get("top_topics")))
    values.extend(extract_nested_text(report.get("subject_distribution")))
    values.extend(extract_nested_text(report.get("top_submitters")))
    return " ".join(str(value).strip() for value in values if value)


def extract_nested_text(items: object) -> List[str]:
    if not isinstance(items, list):
        return []

    extracted = []
    for item in items:
        if isinstance(item, dict):
            for key in ("topic_label", "subject_label", "language", "submitted_by", "label", "name"):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    extracted.append(value.strip())
        elif isinstance(item, str) and item.strip():
            extracted.append(item.strip())
    return extracted
