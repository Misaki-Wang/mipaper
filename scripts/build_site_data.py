#!/usr/bin/env python3
from __future__ import annotations

import sys

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from mipaper.conference_site_data import build_conference_site_manifest
from mipaper.branch_site_data import build_branch_catalog
from mipaper.hf_site_data import build_hf_site_manifest
from mipaper.paths import (
    CONFERENCE_REPORTS_DIR,
    CONFERENCE_SITE_DATA_DIR,
    DAILY_REPORTS_DIR,
    DAILY_SITE_DATA_DIR,
    HF_DAILY_REPORTS_DIR,
    HF_DAILY_SITE_DATA_DIR,
    TRENDING_REPORTS_DIR,
    TRENDING_SITE_DATA_DIR,
)
from mipaper.site_data import build_site_manifest
from mipaper.trending_site_data import build_trending_site_manifest


def main() -> int:
    daily_result = build_site_manifest(
        reports_dir=DAILY_REPORTS_DIR,
        site_data_dir=DAILY_SITE_DATA_DIR.parent,
    )
    conference_result = build_conference_site_manifest(
        reports_dir=CONFERENCE_REPORTS_DIR,
        site_data_dir=CONFERENCE_SITE_DATA_DIR.parent,
    )
    hf_result = build_hf_site_manifest(
        reports_dir=HF_DAILY_REPORTS_DIR,
        site_data_dir=HF_DAILY_SITE_DATA_DIR.parent,
    )
    trending_result = build_trending_site_manifest(
        reports_dir=TRENDING_REPORTS_DIR,
        site_data_dir=TRENDING_SITE_DATA_DIR,
    )
    catalog_result = build_branch_catalog(
        site_data_root=DAILY_SITE_DATA_DIR.parent,
        branch_manifests=(
            daily_result.manifest,
            hf_result.manifest,
            conference_result.manifest,
        ),
    )
    print(f"Built site data: {daily_result.manifest_path}")
    print(f"Built conference site data: {conference_result.manifest_path}")
    print(f"Built HF daily site data: {hf_result.manifest_path}")
    print(f"Built trending site data: {trending_result.manifest_path}")
    print(f"Built branch catalog: {catalog_result.manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
