import unittest

from cool_paper.models import TrendingRepo
from cool_paper.trending_reporting import build_trending_json_payload, render_markdown_trending_report


class TrendingReportingTest(unittest.TestCase):
    def test_trending_report_outputs_include_language_and_repo_stats(self) -> None:
        repos = [
            TrendingRepo(
                snapshot_date="2026-03-12",
                repo_id="openai/codex",
                owner="openai",
                name="codex",
                full_name="openai/codex",
                repo_url="https://github.com/openai/codex",
                description="Terminal coding agent.",
                language="TypeScript",
                stars=12345,
                forks=678,
                stars_this_week=9001,
                built_by=["alice", "bob"],
            )
        ]

        markdown = render_markdown_trending_report(
            snapshot_date="2026-03-12",
            source_url="https://github.com/trending?since=weekly&spoken_language_code=",
            repos=repos,
        )
        payload = build_trending_json_payload(
            snapshot_date="2026-03-12",
            source_url="https://github.com/trending?since=weekly&spoken_language_code=",
            repos=repos,
        )

        self.assertIn("## Language Distribution", markdown)
        self.assertIn("TypeScript: 1 repositories (100.00%)", markdown)
        self.assertIn("Stars This Week: 9001", markdown)
        self.assertEqual("trending", payload["report_kind"])
        self.assertEqual("2026-03-12", payload["snapshot_date"])
        self.assertEqual("openai/codex", payload["repositories"][0]["full_name"])


if __name__ == "__main__":
    unittest.main()
