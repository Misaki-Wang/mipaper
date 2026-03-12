import unittest

from mipaper.models import Paper
from mipaper.reporting import build_json_payload, render_markdown_report


class ReportingTest(unittest.TestCase):
    def test_report_outputs_include_authors_and_abstract(self) -> None:
        papers = [
            Paper(
                paper_id="2603.00001",
                title="Example Paper",
                abs_url="https://arxiv.org/abs/2603.00001",
                pdf_url="https://arxiv.org/pdf/2603.00001",
                detail_url="https://papers.cool/arxiv/2603.00001",
                authors=["Ada Lovelace", "Alan Turing"],
                abstract="An example abstract.",
                topic_key="other_ai",
                topic_label="Other AI",
            )
        ]

        markdown = render_markdown_report(
            category="cs.AI",
            report_date="2026-03-06",
            source_url="https://example.com",
            papers=papers,
        )
        payload = build_json_payload(
            category="cs.AI",
            report_date="2026-03-06",
            source_url="https://example.com",
            papers=papers,
        )

        self.assertIn("Authors: Ada Lovelace, Alan Turing", markdown)
        self.assertIn("<summary>Abstract</summary>", markdown)
        self.assertEqual(["Ada Lovelace", "Alan Turing"], payload["papers"][0]["authors"])
        self.assertEqual("An example abstract.", payload["papers"][0]["abstract"])


if __name__ == "__main__":
    unittest.main()
