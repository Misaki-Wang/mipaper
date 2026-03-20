import json
import unittest
from unittest import mock

from mipaper.codex_classifier import (
    ClaudeClassificationError,
    CodexClassificationError,
    build_output_schema,
    classify_with_claude,
    classify_with_codex,
    should_fallback_to_claude,
    validate_assignments,
)
from mipaper.models import Paper


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

    def test_should_fallback_to_claude_on_rate_limit_markers(self) -> None:
        self.assertTrue(should_fallback_to_claude("codex exec failed: 429 rate limit exceeded"))
        self.assertTrue(should_fallback_to_claude("usage limit reached for this account"))
        self.assertFalse(should_fallback_to_claude("network timeout"))

    @mock.patch("mipaper.codex_classifier.run_claude_exec")
    def test_classify_with_claude_uses_structured_output(self, mocked_run_claude_exec: mock.Mock) -> None:
        papers = [
            Paper(paper_id="1", title="A", abs_url="https://a", pdf_url="https://a.pdf", detail_url="https://b"),
        ]
        mocked_run_claude_exec.return_value = {
            "papers": [
                {"paper_id": "1", "topic_key": "multimodal_agents", "confidence": 0.87},
            ]
        }

        classified = classify_with_claude(papers)

        self.assertEqual("claude", classified[0].classification_source)
        self.assertEqual("multimodal_agents", classified[0].topic_key)
        self.assertEqual(0.87, classified[0].classification_confidence)

    @mock.patch("mipaper.codex_classifier.classify_with_claude")
    @mock.patch("mipaper.codex_classifier.run_codex_exec")
    def test_classify_with_codex_falls_back_to_claude_on_rate_limit(
        self,
        mocked_run_codex_exec: mock.Mock,
        mocked_classify_with_claude: mock.Mock,
    ) -> None:
        papers = [
            Paper(paper_id="1", title="A", abs_url="https://a", pdf_url="https://a.pdf", detail_url="https://b"),
        ]
        mocked_run_codex_exec.side_effect = CodexClassificationError("codex exec failed: 429 rate limit exceeded")
        mocked_classify_with_claude.return_value = list(papers)

        result = classify_with_codex(papers, fallback_provider="claude")

        self.assertEqual(papers, result)
        mocked_classify_with_claude.assert_called_once()

    @mock.patch("mipaper.codex_classifier.run_codex_exec")
    def test_classify_with_codex_falls_back_to_rules_on_failure_when_allowed(self, mocked_run_codex_exec: mock.Mock) -> None:
        paper = Paper(paper_id="1", title="Robot planning with tools", abs_url="https://a", pdf_url="https://a.pdf", detail_url="https://b")
        mocked_run_codex_exec.side_effect = CodexClassificationError("codex exec timed out after 600 seconds")

        result = classify_with_codex([paper], fallback_to_rules=True)

        self.assertEqual(1, len(result))
        self.assertEqual("rule", result[0].classification_source)
        self.assertTrue(result[0].topic_key)

    @mock.patch("mipaper.codex_classifier.run_claude_exec")
    def test_classify_with_claude_falls_back_to_rules_on_failure_when_allowed(self, mocked_run_claude_exec: mock.Mock) -> None:
        paper = Paper(paper_id="1", title="Video generation benchmark", abs_url="https://a", pdf_url="https://a.pdf", detail_url="https://b")
        mocked_run_claude_exec.side_effect = ClaudeClassificationError("claude exec timed out after 600 seconds")

        result = classify_with_claude([paper], fallback_to_rules=True)

        self.assertEqual(1, len(result))
        self.assertEqual("rule", result[0].classification_source)
        self.assertTrue(result[0].topic_key)

    @mock.patch("mipaper.codex_classifier.run_codex_exec")
    def test_classify_with_codex_batches_large_inputs(self, mocked_run_codex_exec: mock.Mock) -> None:
        papers = [
            Paper(paper_id=str(index), title=f"Paper {index}", abs_url="https://a", pdf_url="https://a.pdf", detail_url="https://b")
            for index in range(205)
        ]

        def fake_run_codex_exec(batch, *, model=None, timeout_seconds=600):
            return json.dumps(
                {
                    "papers": [
                        {"paper_id": paper.paper_id, "topic_key": "other_ai", "confidence": 0.55}
                        for paper in batch
                    ]
                }
            )

        mocked_run_codex_exec.side_effect = fake_run_codex_exec

        result = classify_with_codex(papers)

        self.assertEqual(6, mocked_run_codex_exec.call_count)
        batch_sizes = [len(call.args[0]) for call in mocked_run_codex_exec.call_args_list]
        self.assertEqual([40, 40, 40, 40, 40, 5], batch_sizes)
        self.assertTrue(all(paper.classification_source == "codex" for paper in result))


if __name__ == "__main__":
    unittest.main()
