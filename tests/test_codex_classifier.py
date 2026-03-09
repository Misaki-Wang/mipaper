import json
import unittest

from cool_paper.codex_classifier import build_output_schema, validate_assignments
from cool_paper.models import Paper


class CodexClassifierTest(unittest.TestCase):
    def test_schema_enumerates_known_topics(self) -> None:
        schema = build_output_schema()
        topic_keys = schema["properties"]["papers"]["items"]["properties"]["topic_key"]["enum"]
        self.assertIn("multimodal_agents", topic_keys)
        self.assertIn("other_ai", topic_keys)

    def test_validate_assignments_accepts_valid_payload(self) -> None:
        papers = [
            Paper(paper_id="1", title="A", abs_url="https://a", pdf_url="https://a.pdf", detail_url="https://b"),
            Paper(paper_id="2", title="B", abs_url="https://a", pdf_url="https://a.pdf", detail_url="https://b"),
        ]
        payload = json.loads(
            """
            {
              "papers": [
                {"paper_id": "1", "topic_key": "multimodal_agents", "confidence": 0.91},
                {"paper_id": "2", "topic_key": "other_ai", "confidence": 0.52}
              ]
            }
            """
        )

        assignments = validate_assignments(payload, papers)
        self.assertEqual("multimodal_agents", assignments["1"]["topic_key"])
        self.assertEqual(0.52, assignments["2"]["confidence"])


if __name__ == "__main__":
    unittest.main()
