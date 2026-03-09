#!/usr/bin/env python3
from __future__ import annotations

import sys

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from cool_paper.conference_site_data import build_conference_site_manifest
from cool_paper.hf_site_data import build_hf_site_manifest
from cool_paper.paths import (
    CONFERENCE_REPORTS_DIR,
    CONFERENCE_SITE_DATA_DIR,
    DAILY_REPORTS_DIR,
    DAILY_SITE_DATA_DIR,
    HF_DAILY_REPORTS_DIR,
    HF_DAILY_SITE_DATA_DIR,
)
from cool_paper.site_data import build_site_manifest


def main() -> int:
    manifest_path = build_site_manifest(
        reports_dir=DAILY_REPORTS_DIR,
        site_data_dir=DAILY_SITE_DATA_DIR,
    )
    conference_manifest_path = build_conference_site_manifest(
        reports_dir=CONFERENCE_REPORTS_DIR,
        site_data_dir=CONFERENCE_SITE_DATA_DIR,
    )
    hf_manifest_path = build_hf_site_manifest(
        reports_dir=HF_DAILY_REPORTS_DIR,
        site_data_dir=HF_DAILY_SITE_DATA_DIR,
    )
    print(f"Built site data: {manifest_path}")
    print(f"Built conference site data: {conference_manifest_path}")
    print(f"Built HF daily site data: {hf_manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
