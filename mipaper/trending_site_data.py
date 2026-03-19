from __future__ import annotations

from pathlib import Path

from mipaper.branch_site_data import BranchManifestResult, build_branch_manifest
from mipaper.site_contract import validate_trending_manifest, validate_trending_report_payload


def build_trending_site_manifest(reports_dir: Path, site_data_dir: Path) -> BranchManifestResult:
    return build_branch_manifest(
        reports_dir=reports_dir,
        site_data_root=site_data_dir.parent,
        branch_key="trending",
        branch_label="Trending",
        report_sort_key=lambda item: item.get("snapshot_date", ""),
        report_validator=validate_trending_report_payload,
        manifest_validator=validate_trending_manifest,
        report_entry_builder=lambda report: {
            "slug": report["source_path"].stem,
            "snapshot_date": report["snapshot_date"],
            "since": report.get("since", "weekly"),
            "total_repositories": report["total_repositories"],
            "generated_at": report["generated_at"],
            "source_url": report["source_url"],
            "top_languages": report.get("language_distribution", [])[:5],
            "top_repositories": report.get("top_repositories", [])[:5],
        },
    )
