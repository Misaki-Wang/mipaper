from __future__ import annotations


def validate_daily_report_payload(report: dict) -> None:
    _require_branch_report_payload(report, required_keys=("report_date", "category", "total_papers"))
    _require_list(report, "focus_topics")
    _require_list(report, "topic_distribution")
    _require_list(report, "papers")


def validate_hf_report_payload(report: dict) -> None:
    _require_branch_report_payload(report, required_keys=("report_date", "total_papers"))
    _require_list(report, "focus_topics")
    _require_list(report, "topic_distribution")
    _require_list(report, "top_submitters")
    _require_list(report, "papers")


def validate_conference_report_payload(report: dict) -> None:
    _require_branch_report_payload(report, required_keys=("venue", "venue_series", "venue_year", "total_papers"))
    _require_list(report, "subject_distribution")
    _require_list(report, "topic_distribution")
    _require_list(report, "papers")
    _require_bool(report, "is_complete")


def validate_trending_report_payload(report: dict) -> None:
    _require_object("trending report payload", report)
    _require_string(report, "snapshot_date")
    _require_string(report, "generated_at")
    _require_string(report, "source_url")
    _require_number(report, "total_repositories")
    _require_list(report, "language_distribution")
    _require_list(report, "top_repositories")
    _require_list(report, "repositories")


def validate_daily_manifest(manifest: dict) -> None:
    _validate_branch_manifest(
        manifest,
        branch_key="daily",
        branch_label="Cool Daily",
        required_report_keys=(
            "slug",
            "report_date",
            "category",
            "total_papers",
            "classifier",
            "generated_at",
            "source_url",
            "focus_topics",
            "top_topics",
        ),
    )
    _require_list(manifest, "category_order")
    _require_list(manifest, "latest_by_category")


def validate_hf_manifest(manifest: dict) -> None:
    _validate_branch_manifest(
        manifest,
        branch_key="hf-daily",
        branch_label="HF Daily",
        required_report_keys=(
            "slug",
            "report_date",
            "total_papers",
            "classifier",
            "generated_at",
            "source_url",
            "focus_topics",
            "top_topics",
            "top_submitters",
        ),
    )


def validate_conference_manifest(manifest: dict) -> None:
    _validate_branch_manifest(
        manifest,
        branch_key="conference",
        branch_label="Conference",
        required_report_keys=(
            "slug",
            "venue",
            "venue_series",
            "venue_year",
            "total_papers",
            "classifier",
            "generated_at",
            "source_url",
            "subject_distribution",
            "top_topics",
        ),
    )


def validate_trending_manifest(manifest: dict) -> None:
    _validate_branch_manifest(
        manifest,
        branch_key="trending",
        branch_label="Trending",
        required_report_keys=(
            "slug",
            "snapshot_date",
            "since",
            "total_repositories",
            "generated_at",
            "source_url",
            "top_languages",
            "top_repositories",
        ),
    )


def validate_branch_catalog_manifest(manifest: dict) -> None:
    _require_object("branch catalog manifest", manifest)
    _require_string(manifest, "generated_at")
    _require_number(manifest, "reports_count")
    branches = _require_list(manifest, "branches")
    reports = _require_list(manifest, "reports")
    if manifest["reports_count"] != len(reports):
        raise ValueError(f"branch catalog reports_count mismatch: expected {len(reports)}, got {manifest['reports_count']}")

    for branch in branches:
        _require_object("branch catalog branch", branch)
        _require_string(branch, "branch_key")
        _require_string(branch, "branch_label")
        _require_string(branch, "default_report_path", allow_empty=True)
        _require_string(branch, "manifest_path")
        _require_number(branch, "reports_count")

    for report in reports:
        _require_object("branch catalog report", report)
        _require_string(report, "branch_key")
        _require_string(report, "branch_label")
        _require_string(report, "data_path")
        _require_string(report, "search_text")


def _validate_branch_manifest(manifest: dict, *, branch_key: str, branch_label: str, required_report_keys: tuple[str, ...]) -> None:
    _require_object(f"{branch_label} manifest", manifest)
    _require_string(manifest, "branch_key", expected=branch_key)
    _require_string(manifest, "branch_label", expected=branch_label)
    _require_string(manifest, "generated_at")
    _require_number(manifest, "reports_count")
    _require_string(manifest, "default_report_path", allow_empty=True)
    reports = _require_list(manifest, "reports")
    if manifest["reports_count"] != len(reports):
        raise ValueError(f"{branch_label} manifest reports_count mismatch: expected {len(reports)}, got {manifest['reports_count']}")

    for report in reports:
        _require_object(f"{branch_label} manifest report", report)
        _require_string(report, "branch_key", expected=branch_key)
        _require_string(report, "branch_label", expected=branch_label)
        _require_string(report, "data_path")
        for key in required_report_keys:
            if key in {"total_papers", "total_repositories"}:
                _require_number(report, key)
            elif key in {"focus_topics", "top_topics", "top_submitters", "subject_distribution", "top_languages", "top_repositories"}:
                _require_list(report, key)
            else:
                _require_string(report, key)


def _require_branch_report_payload(report: dict, *, required_keys: tuple[str, ...]) -> None:
    _require_object("branch report payload", report)
    _require_string(report, "generated_at")
    _require_string(report, "source_url")
    _require_string(report, "classifier")
    for key in required_keys:
        if key == "total_papers":
            _require_number(report, key)
        else:
            _require_string(report, key)


def _require_object(label: str, value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _require_list(payload: dict, key: str) -> list:
    value = payload.get(key)
    if not isinstance(value, list):
        raise ValueError(f"{key} must be a list")
    return value


def _require_string(payload: dict, key: str, *, allow_empty: bool = False, expected: str | None = None) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        raise ValueError(f"{key} must be a string")
    if not allow_empty and not value.strip():
        raise ValueError(f"{key} must not be empty")
    if expected is not None and value != expected:
        raise ValueError(f"{key} must be {expected!r}, got {value!r}")
    return value


def _require_number(payload: dict, key: str) -> int | float:
    value = payload.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{key} must be a number")
    return value


def _require_bool(payload: dict, key: str) -> bool:
    value = payload.get(key)
    if not isinstance(value, bool):
        raise ValueError(f"{key} must be a boolean")
    return value
