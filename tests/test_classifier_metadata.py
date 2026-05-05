import unittest

from mipaper.classifier_metadata import resolve_effective_classifier
from mipaper.models import Paper


class ClassifierMetadataTest(unittest.TestCase):
    def test_resolves_single_actual_source(self) -> None:
        papers = [
            Paper(
                paper_id="1",
                title="A",
                authors=[],
                abstract="",
                pdf_url="",
                abs_url="",
                detail_url="",
                classification_source="rule",
            )
        ]

        self.assertEqual("rule", resolve_effective_classifier("codex", papers))

    def test_resolves_mixed_actual_sources(self) -> None:
        papers = [
            Paper(
                paper_id="1",
                title="A",
                authors=[],
                abstract="",
                pdf_url="",
                abs_url="",
                detail_url="",
                classification_source="codex",
            ),
            Paper(
                paper_id="2",
                title="B",
                authors=[],
                abstract="",
                pdf_url="",
                abs_url="",
                detail_url="",
                classification_source="rule",
            ),
        ]

        self.assertEqual("codex+rule", resolve_effective_classifier("codex", papers))


if __name__ == "__main__":
    unittest.main()
