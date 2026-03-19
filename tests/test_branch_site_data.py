import json
import tempfile
import unittest
from pathlib import Path

from mipaper.branch_site_data import build_branch_catalog


class BranchSiteDataTest(unittest.TestCase):
    def test_build_branch_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            site_data_dir = root / "site" / "data"
            result = build_branch_catalog(
                site_data_root=site_data_dir,
                branch_manifests=[
                    {
                        "branch_key": "daily",
                        "branch_label": "Cool Daily",
                        "reports_count": 1,
                        "default_report_path": "data/daily/reports/2026-03-19/cs.AI-2026-03-19.json",
                        "reports": [
                            {
                                "slug": "cs.AI-2026-03-19",
                                "report_date": "2026-03-19",
                                "category": "cs.AI",
                                "total_papers": 12,
                                "classifier": "rule",
                                "generated_at": "2026-03-19T00:00:00Z",
                                "source_url": "https://example.com/daily",
                                "focus_topics": [{"topic_label": "Generative Foundations"}],
                                "top_topics": [{"topic_label": "Other AI"}],
                                "data_path": "data/daily/reports/2026-03-19/cs.AI-2026-03-19.json",
                            }
                        ],
                    },
                    {
                        "branch_key": "conference",
                        "branch_label": "Conference",
                        "reports_count": 1,
                        "default_report_path": "data/conference/reports/ICLR.2026/ICLR.2026.json",
                        "reports": [
                            {
                                "slug": "ICLR.2026",
                                "venue": "ICLR.2026",
                                "venue_series": "ICLR",
                                "venue_year": "2026",
                                "total_papers": 400,
                                "classifier": "rule",
                                "generated_at": "2026-03-19T00:00:00Z",
                                "source_url": "https://example.com/conference",
                                "subject_distribution": [{"subject_label": "Oral"}],
                                "top_topics": [{"topic_label": "Optimization"}],
                                "data_path": "data/conference/reports/ICLR.2026/ICLR.2026.json",
                            }
                        ],
                    },
                ],
            )

            manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(2, manifest["reports_count"])
            self.assertEqual(["daily", "conference"], [item["branch_key"] for item in manifest["branches"]])
            self.assertIn("Generative Foundations", manifest["reports"][0]["search_text"])
            self.assertIn("Conference", manifest["reports"][1]["search_text"])


if __name__ == "__main__":
    unittest.main()
