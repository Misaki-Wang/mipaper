from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol


class ClassifiedPaper(Protocol):
    classification_source: str


def resolve_effective_classifier(requested_classifier: str, papers: Sequence[ClassifiedPaper]) -> str:
    sources = sorted(
        {
            paper.classification_source
            for paper in papers
            if getattr(paper, "classification_source", "").strip()
        }
    )
    if not sources:
        return requested_classifier
    return "+".join(sources)
