from __future__ import annotations

import unittest

from mipaper.site_contract import validate_branch_catalog_manifest, validate_trending_manifest


class SiteContractTest(unittest.TestCase):
    def test_validate_trending_manifest_requires_branch_metadata(self) -> None:
        with self.assertRaisesRegex(ValueError, "branch_key must be a string"):
            validate_trending_manifest(
                {
                    "generated_at": "2026-03-20T00:00:00Z",
                    "reports_count": 0,
                    "default_report_path": "",
                    "reports": [],
                }
            )

    def test_validate_branch_catalog_manifest_rejects_count_drift(self) -> None:
        with self.assertRaisesRegex(ValueError, "reports_count mismatch"):
            validate_branch_catalog_manifest(
                {
                    "generated_at": "2026-03-20T00:00:00Z",
                    "reports_count": 2,
                    "branches": [],
                    "reports": [
                        {
                            "branch_key": "daily",
                            "branch_label": "Cool Daily",
                            "data_path": "data/daily/reports/2026-03-19/cs.AI.json",
                            "search_text": "daily cool",
                        }
                    ],
                }
            )


if __name__ == "__main__":
    unittest.main()
