import json
import tempfile
import unittest
from pathlib import Path

from mipaper.trending_site_data import build_trending_site_manifest


class TrendingSiteDataTest(unittest.TestCase):
    def test_build_trending_site_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            reports_dir = root / "reports" / "trending"
            site_data_dir = root / "site" / "data" / "trending"
            reports_dir.mkdir(parents=True)

            for snapshot_date in ("2026-03-12", "2026-03-05"):
                report_path = reports_dir / snapshot_date / f"trending-{snapshot_date}.json"
                report_path.parent.mkdir(parents=True, exist_ok=True)
                report_path.write_text(
                    json.dumps(
                        {
                            "generated_at": "2026-03-12T00:00:00Z",
                            "report_kind": "trending",
                            "snapshot_date": snapshot_date,
                            "source_url": "https://github.com/trending?since=weekly&spoken_language_code=",
                            "since": "weekly",
                            "total_repositories": 15,
                            "language_distribution": [{"language": "Python", "count": 4, "share": 26.67}],
                            "top_repositories": [{"full_name": "openai/codex"}],
                            "languages": [],
                            "repositories": [],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )

            result = build_trending_site_manifest(reports_dir, site_data_dir)
            manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(2, manifest["reports_count"])
            self.assertEqual("data/trending/reports/2026-03-12/trending-2026-03-12.json", manifest["default_report_path"])
            self.assertEqual("2026-03-12", manifest["reports"][0]["snapshot_date"])
            self.assertEqual("Python", manifest["reports"][0]["top_languages"][0]["language"])


if __name__ == "__main__":
    unittest.main()
