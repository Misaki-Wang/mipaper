import unittest

from cool_paper.hf_reporting import build_hf_json_payload, render_markdown_hf_report
from cool_paper.models import HFDailyPaper


class HFDailyReportingTest(unittest.TestCase):
    def test_hf_report_outputs_include_submitter_and_links(self) -> None:
        papers = [
            HFDailyPaper(
                report_date="2026-03-09",
                paper_id="2603.01234",
                title="Test HF Paper",
                authors=["Ada Lovelace"],
                abstract="A compact summary.",
                hf_url="https://huggingface.co/papers/2603.01234",
                arxiv_url="https://arxiv.org/abs/2603.01234",
                arxiv_pdf_url="https://arxiv.org/pdf/2603.01234",
                submitted_by="taesiri",
                upvotes=42,
                topic_key="multimodal_generative",
                topic_label="Multimodal Generative Modeling",
            )
        ]

        markdown = render_markdown_hf_report(
            report_date="2026-03-09",
            source_url="https://huggingface.co/papers/date/2026-03-09",
            papers=papers,
        )
        payload = build_hf_json_payload(
            report_date="2026-03-09",
            source_url="https://huggingface.co/papers/date/2026-03-09",
            papers=papers,
        )

        self.assertIn("## Top Submitters", markdown)
        self.assertIn("taesiri: 1 papers", markdown)
        self.assertIn("Upvotes: 42", markdown)
        self.assertEqual("hf_daily", payload["report_kind"])
        self.assertEqual("2026-03-09", payload["report_date"])
        self.assertEqual("taesiri", payload["top_submitters"][0]["submitted_by"])
        self.assertEqual("https://huggingface.co/papers/2603.01234", payload["papers"][0]["hf_url"])


if __name__ == "__main__":
    unittest.main()
