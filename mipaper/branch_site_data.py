from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, List

from mipaper.site_contract import validate_branch_catalog_manifest


@dataclass(frozen=True)
class BranchManifestResult:
    manifest_path: Path
    manifest: dict


def load_reports(
    reports_dir: Path,
    sort_key: Callable[[dict], object],
    report_validator: Callable[[dict], None] | None = None,
) -> List[dict]:
    reports = []
    for path in sorted(reports_dir.rglob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        report_validator and report_validator(payload)
        payload["source_path"] = path
        reports.append(payload)

    reports.sort(key=sort_key, reverse=True)
    return reports


def copy_file_if_changed(source_path: Path, destination_path: Path) -> None:
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    if destination_path.exists():
        source_size = source_path.stat().st_size
        destination_size = destination_path.stat().st_size
        if source_size == destination_size and source_path.read_bytes() == destination_path.read_bytes():
            return
    shutil.copyfile(source_path, destination_path)


def write_json_if_changed(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing_text = path.read_text(encoding="utf-8") if path.exists() else ""
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    if existing_text == serialized:
        return

    preserved_payload = preserve_generated_at_if_unchanged(existing_text, payload)
    serialized = json.dumps(preserved_payload, ensure_ascii=False, indent=2)
    if existing_text == serialized:
        return
    path.write_text(serialized, encoding="utf-8")


def preserve_generated_at_if_unchanged(existing_text: str, payload: dict) -> dict:
    if not existing_text:
        return payload
    if "generated_at" not in payload:
        return payload

    try:
        existing_payload = json.loads(existing_text)
    except json.JSONDecodeError:
        return payload

    if not isinstance(existing_payload, dict):
        return payload

    existing_generated_at = existing_payload.get("generated_at")
    if not isinstance(existing_generated_at, str) or not existing_generated_at.strip():
        return payload

    candidate_payload = dict(payload)
    candidate_payload["generated_at"] = existing_generated_at
    if candidate_payload == existing_payload:
        return candidate_payload
    return payload


def remove_stale_json(directory: Path, expected_relative_paths: set[Path]) -> None:
    if not directory.exists():
        return

    for path in directory.rglob("*.json"):
        if path.relative_to(directory) not in expected_relative_paths:
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
    report_validator: Callable[[dict], None] | None = None,
    manifest_validator: Callable[[dict], None] | None = None,
) -> BranchManifestResult:
    reports = load_reports(reports_dir, report_sort_key, report_validator)
    branch_output_dir = site_data_root / branch_key
    report_output_dir = branch_output_dir / "reports"
    report_output_dir.mkdir(parents=True, exist_ok=True)

    manifest_reports = []
    expected_paths: set[Path] = set()
    for report in reports:
        source_path = report["source_path"]
        relative_path = source_path.relative_to(reports_dir)
        destination = report_output_dir / relative_path
        expected_paths.add(relative_path)
        copy_file_if_changed(source_path, destination)

        entry = {
            "branch_key": branch_key,
            "branch_label": branch_label,
            "data_path": f"data/{branch_key}/reports/{relative_path.as_posix()}",
            **report_entry_builder(report),
        }
        manifest_reports.append(entry)

    remove_stale_json(report_output_dir, expected_paths)

    manifest = {
        "branch_key": branch_key,
        "branch_label": branch_label,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "reports_count": len(manifest_reports),
        "default_report_path": manifest_reports[0]["data_path"] if manifest_reports else "",
        "reports": manifest_reports,
    }
    if manifest_validator:
        manifest_validator(manifest)

    manifest_path = branch_output_dir / "manifest.json"
    write_json_if_changed(manifest_path, manifest)
    return BranchManifestResult(manifest_path=manifest_path, manifest=manifest)


def build_branch_catalog(site_data_root: Path, branch_manifests: Iterable[dict]) -> BranchManifestResult:
    catalog_dir = site_data_root / "branches"
    catalog_dir.mkdir(parents=True, exist_ok=True)

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
    validate_branch_catalog_manifest(catalog)

    catalog_path = catalog_dir / "manifest.json"
    write_json_if_changed(catalog_path, catalog)
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
        report.get("sync_date"),
        report.get("category"),
        report.get("venue"),
        report.get("venue_series"),
        report.get("venue_year"),
        report.get("issue_title"),
        report.get("excerpt"),
    ]
    values.extend(extract_nested_text(report.get("focus_topics")))
    values.extend(extract_nested_text(report.get("top_topics")))
    values.extend(extract_nested_text(report.get("subject_distribution")))
    values.extend(extract_nested_text(report.get("top_submitters")))
    values.extend(extract_nested_text(report.get("headings")))
    return " ".join(str(value).strip() for value in values if value)


def extract_nested_text(items: object) -> List[str]:
    if not isinstance(items, list):
        return []

    extracted = []
    for item in items:
        if isinstance(item, dict):
            for key in ("topic_label", "subject_label", "language", "submitted_by", "label", "name", "title"):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    extracted.append(value.strip())
        elif isinstance(item, str) and item.strip():
            extracted.append(item.strip())
    return extracted
