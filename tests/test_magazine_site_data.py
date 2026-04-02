import json
import tempfile
import unittest
from pathlib import Path

from mipaper.magazine_site_data import build_magazine_site_manifest


class MagazineSiteDataTest(unittest.TestCase):
    def test_build_magazine_site_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            reports_dir = root / "reports" / "magazine"
            site_data_dir = root / "site" / "data" / "magazine"
            reports_dir.mkdir(parents=True)

            for issue_number in (390, 389):
                report_path = reports_dir / f"issue-{issue_number}" / f"magazine-issue-{issue_number}.json"
                report_path.parent.mkdir(parents=True, exist_ok=True)
                report_path.write_text(
                    json.dumps(
                        {
                            "generated_at": "2026-04-02T00:00:00Z",
                            "report_kind": "magazine",
                            "sync_date": "2026-04-02",
                            "issue_number": issue_number,
                            "issue_slug": f"issue-{issue_number}",
                            "issue_title": f"科技爱好者周刊（第 {issue_number} 期）",
                            "source_url": f"https://github.com/ruanyf/weekly/blob/master/docs/issue-{issue_number}.md",
                            "raw_url": f"https://raw.githubusercontent.com/ruanyf/weekly/master/docs/issue-{issue_number}.md",
                            "cover_image_url": "https://cdn.example.com/cover.webp",
                            "excerpt": "同步摘要",
                            "lead_markdown": "导语",
                            "sections_count": 2,
                            "headings": [{"title": "封面图", "slug": "magazine-section-1", "level": 2}],
                            "sections": [{"title": "封面图", "slug": "magazine-section-1", "markdown": "内容", "excerpt": "内容"}],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )

            result = build_magazine_site_manifest(reports_dir, site_data_dir)
            manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(2, manifest["reports_count"])
            self.assertEqual("data/magazine/reports/issue-390/magazine-issue-390.json", manifest["default_report_path"])
            self.assertEqual(390, manifest["reports"][0]["issue_number"])
            self.assertEqual("同步摘要", manifest["reports"][0]["excerpt"])


if __name__ == "__main__":
    unittest.main()
