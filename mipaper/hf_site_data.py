from __future__ import annotations

from pathlib import Path

from mipaper.branch_site_data import BranchManifestResult, build_branch_manifest


def build_hf_site_manifest(reports_dir: Path, site_data_dir: Path) -> BranchManifestResult:
    return build_branch_manifest(
        reports_dir=reports_dir,
        site_data_root=site_data_dir,
        branch_key="hf-daily",
        branch_label="HF Daily",
        report_sort_key=lambda item: item.get("report_date", ""),
        report_entry_builder=lambda report: {
            "slug": report["source_path"].stem,
            "report_date": report["report_date"],
            "total_papers": report["total_papers"],
            "classifier": report["classifier"],
            "generated_at": report["generated_at"],
            "source_url": report["source_url"],
            "focus_topics": report["focus_topics"],
            "top_topics": report["topic_distribution"][:5],
            "top_submitters": report.get("top_submitters", [])[:5],
        },
    )
