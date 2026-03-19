from __future__ import annotations

from pathlib import Path

from mipaper.branch_site_data import BranchManifestResult, build_branch_manifest, write_json_if_changed


PREFERRED_CATEGORY_ORDER = ["cs.AI", "cs.CL", "cs.CV"]


def build_site_manifest(reports_dir: Path, site_data_dir: Path) -> BranchManifestResult:
    result = build_branch_manifest(
        reports_dir=reports_dir,
        site_data_root=site_data_dir,
        branch_key="daily",
        branch_label="Cool Daily",
        report_sort_key=lambda item: (
            item.get("report_date", ""),
            -category_sort_key(item.get("category", "")),
        ),
        report_entry_builder=lambda report: {
            "slug": report["source_path"].stem,
            "report_date": report["report_date"],
            "category": report["category"],
            "total_papers": report["total_papers"],
            "classifier": report["classifier"],
            "generated_at": report["generated_at"],
            "source_url": report["source_url"],
            "focus_topics": report["focus_topics"],
            "top_topics": report["topic_distribution"][:5],
        },
    )

    latest_by_category = []
    seen_categories = set()
    for report in result.manifest["reports"]:
        if report["category"] in seen_categories:
            continue
        seen_categories.add(report["category"])
        latest_by_category.append(report)

    latest_by_category.sort(key=lambda item: category_sort_key(item["category"]))
    result.manifest["category_order"] = PREFERRED_CATEGORY_ORDER
    result.manifest["latest_by_category"] = latest_by_category
    result.manifest["default_report_path"] = latest_by_category[0]["data_path"] if latest_by_category else (
        result.manifest["reports"][0]["data_path"] if result.manifest["reports"] else ""
    )
    write_json_if_changed(result.manifest_path, result.manifest)
    return result


def category_sort_key(category: str) -> int:
    try:
        return PREFERRED_CATEGORY_ORDER.index(category)
    except ValueError:
        return len(PREFERRED_CATEGORY_ORDER)
