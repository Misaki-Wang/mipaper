from __future__ import annotations

from pathlib import Path

from mipaper.branch_site_data import BranchManifestResult, build_branch_manifest
from mipaper.site_contract import validate_magazine_manifest, validate_magazine_report_payload


def build_magazine_site_manifest(reports_dir: Path, site_data_dir: Path) -> BranchManifestResult:
    return build_branch_manifest(
        reports_dir=reports_dir,
        site_data_root=site_data_dir.parent,
        branch_key="magazine",
        branch_label="Magazine",
        report_sort_key=lambda item: item.get("issue_number", 0),
        report_validator=validate_magazine_report_payload,
        manifest_validator=validate_magazine_manifest,
        report_entry_builder=lambda report: {
            "slug": report["issue_slug"],
            "issue_number": report["issue_number"],
            "issue_title": report["issue_title"],
            "sync_date": report["sync_date"],
            "sections_count": report["sections_count"],
            "generated_at": report["generated_at"],
            "source_url": report["source_url"],
            "cover_image_url": report.get("cover_image_url", ""),
            "excerpt": report.get("excerpt", ""),
            "headings": report.get("headings", [])[:6],
        },
    )
