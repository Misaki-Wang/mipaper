import json
import tempfile
import unittest
from pathlib import Path

from cool_paper.site_data import build_site_manifest


class SiteDataTest(unittest.TestCase):
    def test_build_site_manifest_copies_reports_and_writes_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            reports_dir = root / "reports" / "daily"
            site_data_dir = root / "site" / "data" / "daily"
            reports_dir.mkdir(parents=True)

            def write_report(category: str, total_papers: int) -> None:
                report_path = reports_dir / f"{category}-2026-03-06.json"
                report_path.write_text(
                    json.dumps(
                        {
                            "generated_at": "2026-03-09T10:00:00Z",
                            "category": category,
                            "report_date": "2026-03-06",
                            "source_url": "https://example.com",
                            "classifier": "rule",
                            "total_papers": total_papers,
                            "focus_topics": [{"topic_key": "a", "topic_label": "A", "count": 1, "share": 10.0}],
                            "topic_distribution": [{"topic_label": "A", "count": 5, "share": 50.0}],
                            "topics": [],
                            "papers": [],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )

            write_report("cs.AI", 10)
            write_report("cs.CL", 20)
            write_report("cs.CV", 30)

            older_ai_path = reports_dir / "cs.AI-2026-03-05.json"
            older_ai_path.write_text(
                json.dumps(
                    {
                        "generated_at": "2026-03-09T10:00:00Z",
                        "category": "cs.AI",
                        "report_date": "2026-03-05",
                        "source_url": "https://example.com",
                        "classifier": "rule",
                        "total_papers": 10,
                        "focus_topics": [{"topic_key": "a", "topic_label": "A", "count": 1, "share": 10.0}],
                        "topic_distribution": [{"topic_label": "A", "count": 5, "share": 50.0}],
                        "topics": [],
                        "papers": [],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            manifest_path = build_site_manifest(reports_dir, site_data_dir)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(4, manifest["reports_count"])
            self.assertEqual("data/daily/reports/cs.AI-2026-03-06.json", manifest["default_report_path"])
            self.assertEqual(["cs.AI", "cs.CL", "cs.CV"], manifest["category_order"])
            self.assertEqual(
                ["cs.AI", "cs.CL", "cs.CV"],
                [item["category"] for item in manifest["latest_by_category"]],
            )
            self.assertEqual("2026-03-06", manifest["reports"][0]["report_date"])
            self.assertEqual(
                "data/daily/reports/cs.AI-2026-03-06.json",
                manifest["reports"][0]["data_path"],
            )
            self.assertTrue((site_data_dir / "reports" / "cs.AI-2026-03-06.json").exists())


if __name__ == "__main__":
    unittest.main()
