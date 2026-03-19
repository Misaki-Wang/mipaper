from __future__ import annotations

from pathlib import Path

from mipaper.branch_site_data import BranchManifestResult, build_branch_manifest


def build_conference_site_manifest(reports_dir: Path, site_data_dir: Path) -> BranchManifestResult:
    return build_branch_manifest(
        reports_dir=reports_dir,
        site_data_root=site_data_dir,
        branch_key="conference",
        branch_label="Conference",
        report_sort_key=lambda item: (
            safe_int(item.get("venue_year")),
            item.get("venue_series", ""),
            item.get("venue", ""),
        ),
        report_entry_builder=lambda report: {
            "slug": report["source_path"].stem,
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
        },
    )


def safe_int(value: str | int | None) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0
