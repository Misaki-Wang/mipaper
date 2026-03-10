import unittest

from cool_paper.conference_reporting import build_conference_json_payload, render_markdown_conference_report
from cool_paper.models import Paper


class ConferenceReportingTest(unittest.TestCase):
    def test_conference_report_outputs_include_subjects(self) -> None:
        papers = [
            Paper(
                paper_id="a",
                title="Conference Paper",
                abs_url="",
                pdf_url="https://openreview.net/pdf?id=a",
                detail_url="https://papers.cool/venue/a",
                authors=["Ada Lovelace"],
                subjects=["Oral"],
                abstract="A conference abstract.",
                topic_key="multimodal_generative",
                topic_label="Multimodal Generative Modeling",
            )
        ]

        markdown = render_markdown_conference_report(
            venue="ICLR.2026",
            source_url="https://papers.cool/venue/ICLR.2026",
            papers=papers,
            fetch_metadata={"declared_total": 10, "requested_show": 10, "is_complete": False},
        )
        payload = build_conference_json_payload(
            venue="ICLR.2026",
            source_url="https://papers.cool/venue/ICLR.2026",
            papers=papers,
            fetch_metadata={"declared_total": 10, "requested_show": 10, "is_complete": False},
        )

        self.assertIn("## Subject Distribution", markdown)
        self.assertIn("Oral: 1 papers (100.00%)", markdown)
        self.assertIn("Capture Status: partial", markdown)
        self.assertEqual("conference", payload["report_kind"])
        self.assertEqual("ICLR", payload["venue_series"])
        self.assertEqual("2026", payload["venue_year"])
        self.assertEqual(10, payload["declared_total"])
        self.assertEqual(10.0, payload["capture_ratio"])
        self.assertFalse(payload["is_complete"])
        self.assertEqual(["Oral"], payload["papers"][0]["subjects"])


if __name__ == "__main__":
    unittest.main()
