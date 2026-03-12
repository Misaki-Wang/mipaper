import json
import tempfile
import unittest
from pathlib import Path

from mipaper.conference_site_data import build_conference_site_manifest


class ConferenceSiteDataTest(unittest.TestCase):
    def test_build_conference_site_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            reports_dir = root / "reports" / "conference"
            site_data_dir = root / "site" / "data" / "conference"
            reports_dir.mkdir(parents=True)

            for venue in ("CVPR.2025", "CVPR.2024", "ICLR.2026"):
                report_path = reports_dir / venue / f"{venue}.json"
                report_path.parent.mkdir(parents=True, exist_ok=True)
                report_path.write_text(
                    json.dumps(
                        {
                            "venue": venue,
                            "venue_series": venue.split(".", 1)[0],
                            "venue_year": venue.split(".", 1)[1],
                            "total_papers": 10,
                            "declared_total": 12,
                            "capture_ratio": 83.33,
                            "is_complete": False,
                            "classifier": "rule",
                            "generated_at": "2026-03-09T00:00:00Z",
                            "source_url": f"https://papers.cool/venue/{venue}",
                            "subject_distribution": [{"subject_label": "Oral", "count": 10, "share": 100.0}],
                            "topic_distribution": [{"topic_label": "Other AI", "count": 10, "share": 100.0}],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )

            manifest_path = build_conference_site_manifest(reports_dir, site_data_dir)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(3, manifest["reports_count"])
            self.assertEqual("data/conference/reports/ICLR.2026/ICLR.2026.json", manifest["default_report_path"])
            self.assertEqual("ICLR.2026", manifest["reports"][0]["venue"])
            self.assertEqual(12, manifest["reports"][0]["declared_total"])
            self.assertEqual(83.33, manifest["reports"][0]["capture_ratio"])
            self.assertFalse(manifest["reports"][0]["is_complete"])


if __name__ == "__main__":
    unittest.main()
