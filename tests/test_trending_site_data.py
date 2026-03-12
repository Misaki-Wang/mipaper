import json
import tempfile
import unittest
from pathlib import Path

from cool_paper.trending_site_data import build_trending_site_manifest


class TrendingSiteDataTest(unittest.TestCase):
    def test_build_trending_site_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            reports_dir = root / "reports" / "trending"
            site_data_dir = root / "site" / "data" / "trending"
            reports_dir.mkdir(parents=True)

            for snapshot_date in ("2026-03-12", "2026-03-05"):
                (reports_dir / f"trending-{snapshot_date}.json").write_text(
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

            manifest_path = build_trending_site_manifest(reports_dir, site_data_dir)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(2, manifest["reports_count"])
            self.assertEqual("data/trending/reports/trending-2026-03-12.json", manifest["default_report_path"])
            self.assertEqual("2026-03-12", manifest["reports"][0]["snapshot_date"])
            self.assertEqual("Python", manifest["reports"][0]["top_languages"][0]["language"])


if __name__ == "__main__":
    unittest.main()
