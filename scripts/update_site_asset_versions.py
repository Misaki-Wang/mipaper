#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from mipaper.asset_versions import update_site_asset_versions
from mipaper.paths import SITE_DIR


def main() -> int:
    result = update_site_asset_versions(SITE_DIR)
    if result.updated_files:
        for path in result.updated_files:
            print(f"Updated asset versions in {path}")
    else:
        print("Asset versions already up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
