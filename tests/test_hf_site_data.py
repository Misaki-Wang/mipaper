import json
import tempfile
import unittest
from pathlib import Path

from mipaper.hf_site_data import build_hf_site_manifest


class HFSiteDataTest(unittest.TestCase):
    def test_build_hf_site_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            reports_dir = root / "reports" / "hf-daily"
            site_data_dir = root / "site" / "data" / "hf-daily"
            reports_dir.mkdir(parents=True)

            for report_date in ("2026-03-09", "2026-03-08"):
                report_path = reports_dir / report_date / f"hf-daily-{report_date}.json"
                report_path.parent.mkdir(parents=True, exist_ok=True)
                report_path.write_text(
                    json.dumps(
                        {
                            "generated_at": "2026-03-10T00:00:00Z",
                            "report_kind": "hf_daily",
                            "report_date": report_date,
                            "source_url": f"https://huggingface.co/papers/date/{report_date}",
                            "classifier": "rule",
                            "total_papers": 10,
                            "focus_topics": [{"topic_key": "a", "topic_label": "A", "count": 1, "share": 10.0}],
                            "topic_distribution": [{"topic_label": "A", "count": 5, "share": 50.0}],
                            "top_submitters": [{"submitted_by": "taesiri", "count": 2}],
                            "topics": [],
                            "papers": [],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )

            manifest_path = build_hf_site_manifest(reports_dir, site_data_dir)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(2, manifest["reports_count"])
            self.assertEqual("data/hf-daily/reports/2026-03-09/hf-daily-2026-03-09.json", manifest["default_report_path"])
            self.assertEqual("2026-03-09", manifest["reports"][0]["report_date"])
            self.assertEqual("taesiri", manifest["reports"][0]["top_submitters"][0]["submitted_by"])


if __name__ == "__main__":
    unittest.main()
