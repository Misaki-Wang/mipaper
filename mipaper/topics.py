from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Tuple

from mipaper.models import Paper


@dataclass(frozen=True)
class TopicDefinition:
    key: str
    label: str
    priority: int
    patterns: Sequence[Tuple[str, int]]
    required_groups: Sequence[Sequence[str]] = ()


GENERATIVE_CUES: Tuple[str, ...] = (
    r"\bgenerative\b",
    r"\bgeneration\b",
    r"\bdiffusion\b",
    r"\bautoregressive\b",
    r"\bflow matching\b",
    r"\bscore matching\b",
    r"\bscore-based\b",
    r"\blatent\b",
    r"\bvariational\b",
    r"\bvae\b",
    r"\bgan(s)?\b",
    r"\benergy-based\b",
    r"\bworld models?\b",
    r"\bdreaming\b",
    r"\bsynthesis\b",
    r"\bediting\b",
)

GENERATIVE_MODEL_REQUIRED_CUES: Tuple[str, ...] = (
    r"\bgenerative\b",
    r"\bdiffusion\b",
    r"\bautoregressive\b",
    r"\bflow matching\b",
    r"\bscore matching\b",
    r"\bscore-based\b",
    r"\blatent\b",
    r"\bvariational\b",
    r"\bvae\b",
    r"\bgan(s)?\b",
    r"\benergy-based\b",
    r"\bworld models?\b",
    r"\bsynthesis\b",
    r"\bediting\b",
    r"\bimage generation\b",
    r"\bvideo generation\b",
    r"\baudio generation\b",
    r"\bspeech generation\b",
    r"\b3d generation\b",
)

THEORY_CUES: Tuple[str, ...] = (
    r"\btheor(y|etical)\b",
    r"\bfoundation(s|al)?\b",
    r"\bfundamental\b",
    r"\bunderstanding\b",
    r"\banalysis\b",
    r"\banatomy\b",
    r"\btheorem\b",
    r"\bguarantee(s)?\b",
    r"\bconvergence\b",
    r"\bidentifiability\b",
    r"\bgeneralization\b",
    r"\boptimization\b",
    r"\binductive\b",
    r"\bmechanistic\b",
    r"\bprincipled\b",
)

THEORY_REQUIRED_CUES: Tuple[str, ...] = (
    r"\btheor(y|etical)\b",
    r"\bfoundation(s|al)?\b",
    r"\bfundamental\b",
    r"\btheorem\b",
    r"\bguarantee(s)?\b",
    r"\bconvergence\b",
    r"\bidentifiability\b",
    r"\bgeneralization\b",
    r"\bmechanistic\b",
    r"\bprincipled\b",
)

MULTIMODAL_CUES: Tuple[str, ...] = (
    r"\bmultimodal\b",
    r"\bmulti-modal\b",
    r"\bvision-language\b",
    r"\bvisual-language\b",
    r"\bcross-modal\b",
    r"\baudio-visual\b",
    r"\btext-driven\b",
    r"\btext-conditioned\b",
    r"\blanguage-conditioned\b",
    r"\baction-conditioned\b",
    r"\btext-to-image\b",
    r"\btext-to-video\b",
    r"\bimage-to-text\b",
    r"\bimage-to-video\b",
    r"\bspeech-to-text\b",
    r"\bimage\b",
    r"\bvideo\b",
    r"\baudio\b",
    r"\bspeech\b",
    r"\b3d\b",
    r"\bvlm\b",
    r"\bvla\b",
)

MULTIMODAL_REQUIRED_CUES: Tuple[str, ...] = (
    r"\bmultimodal\b",
    r"\bmulti-modal\b",
    r"\bvision-language\b",
    r"\bvisual-language\b",
    r"\bcross-modal\b",
    r"\baudio-visual\b",
    r"\btext-driven\b",
    r"\btext-conditioned\b",
    r"\blanguage-conditioned\b",
    r"\baction-conditioned\b",
    r"\btext-to-image\b",
    r"\btext-to-video\b",
    r"\bimage-to-text\b",
    r"\bimage-to-video\b",
    r"\bspeech-to-text\b",
    r"\bvlm\b",
    r"\bvla\b",
    r"\bvision-language-action\b",
)

AGENT_CUES: Tuple[str, ...] = (
    r"\bagents?\b",
    r"\bagentic\b",
    r"\bassistant\b",
    r"\bplanning\b",
    r"\bplanner\b",
    r"\btool[- ]using\b",
    r"\btool use\b",
    r"\bweb tasks?\b",
    r"\bworkflow\b",
    r"\bautonomous\b",
    r"\bvision-language-action\b",
    r"\bembodied\b",
    r"\brobot(ic|ics)?\b",
    r"\bmanipulation\b",
    r"\bnavigation\b",
)


TOPICS: Sequence[TopicDefinition] = (
    TopicDefinition(
        key="generative_foundations",
        label="Generative Foundations",
        priority=1,
        patterns=(
            (r"\bgenerative\b", 5),
            (r"\bgeneration\b", 4),
            (r"\bdiffusion\b", 5),
            (r"\bautoregressive\b", 4),
            (r"\bflow matching\b", 5),
            (r"\bscore matching\b", 5),
            (r"\bscore-based\b", 4),
            (r"\blatent\b", 4),
            (r"\bvariational\b", 4),
            (r"\benergy-based\b", 4),
            (r"\bworld models?\b", 4),
            (r"\btheor(y|etical)\b", 5),
            (r"\bfoundation(s|al)?\b", 5),
            (r"\bfundamental\b", 4),
            (r"\bunderstanding\b", 4),
            (r"\banalysis\b", 4),
            (r"\banatomy\b", 4),
            (r"\btheorem\b", 4),
            (r"\bguarantee(s)?\b", 4),
            (r"\bconvergence\b", 4),
            (r"\bidentifiability\b", 4),
            (r"\bgeneralization\b", 4),
            (r"\boptimization\b", 3),
            (r"\binductive\b", 3),
            (r"\bmechanistic\b", 3),
        ),
        required_groups=(GENERATIVE_MODEL_REQUIRED_CUES, THEORY_REQUIRED_CUES),
    ),
    TopicDefinition(
        key="multimodal_generative",
        label="Multimodal Generative Modeling",
        priority=2,
        patterns=(
            (r"\bmultimodal\b", 5),
            (r"\bmulti-modal\b", 5),
            (r"\bvision-language\b", 4),
            (r"\bcross-modal\b", 4),
            (r"\btext-driven\b", 4),
            (r"\btext-conditioned\b", 4),
            (r"\blanguage-conditioned\b", 4),
            (r"\baction-conditioned\b", 4),
            (r"\bimage\b", 3),
            (r"\bvideo\b", 4),
            (r"\baudio\b", 4),
            (r"\bspeech\b", 4),
            (r"\b3d\b", 3),
            (r"\bdiffusion\b", 5),
            (r"\bgenerative\b", 5),
            (r"\bgeneration\b", 4),
            (r"\bsynthesis\b", 4),
            (r"\bediting\b", 4),
            (r"\bautoregressive\b", 4),
            (r"\bdecoder\b", 3),
            (r"\btokenizer\b", 3),
        ),
        required_groups=(MULTIMODAL_REQUIRED_CUES, GENERATIVE_MODEL_REQUIRED_CUES),
    ),
    TopicDefinition(
        key="multimodal_agents",
        label="Multimodal Agents",
        priority=3,
        patterns=(
            (r"\bmultimodal\b", 5),
            (r"\bmulti-modal\b", 5),
            (r"\bvision-language\b", 4),
            (r"\bvisual-language\b", 4),
            (r"\btext-driven\b", 3),
            (r"\btext-conditioned\b", 3),
            (r"\blanguage-conditioned\b", 4),
            (r"\baction-conditioned\b", 4),
            (r"\bvlm\b", 4),
            (r"\bvla\b", 5),
            (r"\bvision-language-action\b", 6),
            (r"\bagents?\b", 5),
            (r"\bagentic\b", 5),
            (r"\bassistant\b", 4),
            (r"\bplanning\b", 4),
            (r"\bplanner\b", 4),
            (r"\btool[- ]using\b", 4),
            (r"\bautonomous\b", 4),
            (r"\bembodied\b", 4),
            (r"\brobot(ic|ics)?\b", 4),
            (r"\bmanipulation\b", 4),
            (r"\bnavigation\b", 4),
        ),
        required_groups=(MULTIMODAL_REQUIRED_CUES, AGENT_CUES),
    ),
    TopicDefinition(
        key="agents_planning",
        label="Agents and Planning",
        priority=4,
        patterns=(
            (r"\bmulti-agent\b", 5),
            (r"\bagents?\b", 4),
            (r"\bagentic\b", 4),
            (r"\bplanning\b", 4),
            (r"\bplanner\b", 4),
            (r"\bworkflow\b", 3),
            (r"\bweb tasks?\b", 4),
            (r"\btool[- ]using\b", 4),
            (r"\bassistant\b", 3),
            (r"\bautonomous\b", 3),
        ),
    ),
    TopicDefinition(
        key="robotics_embodied",
        label="Robotics and Embodied AI",
        priority=5,
        patterns=(
            (r"\brobot(ic|ics)?\b", 5),
            (r"\bmicrorobotic\b", 5),
            (r"\bembodied\b", 4),
            (r"\bnavigation\b", 4),
            (r"\bmanipulation\b", 4),
            (r"\bgrasp(ing)?\b", 4),
            (r"\blocomo", 3),
            (r"\bcontrol\b", 3),
            (r"\bdrone\b", 4),
        ),
    ),
    TopicDefinition(
        key="multimodal_vision",
        label="Multimodal Understanding and Vision",
        priority=6,
        patterns=(
            (r"\bmultimodal\b", 5),
            (r"\bmulti-modal\b", 5),
            (r"\bvision\b", 4),
            (r"\bvisual\b", 4),
            (r"\bimage\b", 4),
            (r"\bvideo\b", 4),
            (r"\baudio\b", 4),
            (r"\bspeech\b", 4),
            (r"\bvlm\b", 5),
            (r"\bdiffusion\b", 4),
            (r"\b3d\b", 3),
        ),
    ),
    TopicDefinition(
        key="retrieval_knowledge",
        label="Retrieval, Knowledge, and RAG",
        priority=7,
        patterns=(
            (r"\bretrieval\b", 5),
            (r"\brag\b", 5),
            (r"\bknowledge\b", 4),
            (r"\bmemory\b", 4),
            (r"\bsearch\b", 4),
            (r"\bgraph\b", 3),
            (r"\bevidence\b", 3),
            (r"\bgrounding\b", 4),
        ),
    ),
    TopicDefinition(
        key="datasets_benchmarks",
        label="Datasets and Benchmarks",
        priority=8,
        patterns=(
            (r"\bdataset(s)?\b", 5),
            (r"\bbenchmark(s)?\b", 5),
            (r"\bcorpus\b", 4),
            (r"\bannotated\b", 4),
            (r"\bannotation\b", 4),
            (r"\bsuite\b", 4),
            (r"\btraces\b", 3),
            (r"\bchallenge\b", 3),
        ),
    ),
    TopicDefinition(
        key="reasoning_alignment_eval",
        label="Reasoning, Alignment, and Evaluation",
        priority=9,
        patterns=(
            (r"\breasoning\b", 5),
            (r"\balignment\b", 5),
            (r"\bsafety\b", 5),
            (r"\bevaluation\b", 4),
            (r"\bjudge(s)?\b", 5),
            (r"\bbias\b", 5),
            (r"\bfairness\b", 4),
            (r"\bprivacy\b", 4),
            (r"\bmisalignment\b", 5),
            (r"\btrust\b", 4),
            (r"\bcredibility\b", 4),
            (r"\bdebiasing\b", 4),
            (r"\bprovably\b", 4),
            (r"\bcalibrated\b", 4),
            (r"\bhallucination\b", 4),
            (r"\bprobe(s)?\b", 3),
        ),
    ),
    TopicDefinition(
        key="domain_applications",
        label="Domain Applications",
        priority=10,
        patterns=(
            (r"\bmedical\b", 5),
            (r"\bclinical\b", 5),
            (r"\bdiagnosis\b", 5),
            (r"\bhepatology\b", 5),
            (r"\bdrug\b", 4),
            (r"\bbiology\b", 4),
            (r"\bprotein\b", 4),
            (r"\bmath", 4),
            (r"\bchess\b", 4),
            (r"\bhardware\b", 4),
            (r"\bai\+hw\b", 4),
            (r"\bmri\b", 4),
            (r"\becg\b", 4),
            (r"\baviation\b", 4),
            (r"\bretail\b", 4),
            (r"\bmaritime\b", 4),
            (r"\bbrain\b", 4),
            (r"\bpatient\b", 4),
            (r"\bdental\b", 4),
            (r"\bjustice\b", 4),
            (r"\bcourt(s)?\b", 4),
        ),
    ),
    TopicDefinition(
        key="learning_theory",
        label="Learning, Optimization, and Theory",
        priority=11,
        patterns=(
            (r"\blearning\b", 4),
            (r"\btraining\b", 4),
            (r"\boptimization\b", 4),
            (r"\btheory\b", 4),
            (r"\btheorem\b", 4),
            (r"\bgeneralization\b", 4),
            (r"\bsparse\b", 4),
            (r"\bactivation(s)?\b", 4),
            (r"\battention\b", 4),
            (r"\banatomy\b", 3),
            (r"\barchitecture\b", 3),
            (r"\bkriging\b", 5),
            (r"\bcurriculum\b", 3),
            (r"\binterpretable\b", 3),
            (r"\brepresentation(s)?\b", 3),
            (r"\bunsupervised\b", 3),
            (r"\bclustering\b", 3),
            (r"\bcausal\b", 3),
            (r"\bfine-tuning\b", 3),
            (r"\bmixture\b", 3),
            (r"\bneural networks?\b", 3),
        ),
    ),
    TopicDefinition(
        key="llm_language",
        label="LLMs and Language",
        priority=12,
        patterns=(
            (r"\b\w*llms?\w*\b", 5),
            (r"\blanguage models?\b", 5),
            (r"\btransformer(s)?\b", 4),
            (r"\btoken(s)?\b", 4),
            (r"\bprompt(ing)?\b", 4),
            (r"\bdialogue\b", 4),
            (r"\bchat\b", 4),
            (r"\btext\b", 3),
            (r"\bcoding\b", 4),
            (r"\bcode\b", 4),
            (r"\blanguage\b", 3),
            (r"\bcommon ground\b", 3),
        ),
    ),
)

OTHER_TOPIC = TopicDefinition(
    key="other_ai",
    label="Other AI",
    priority=99,
    patterns=(),
)

TOPIC_LABELS: Dict[str, str] = {topic.key: topic.label for topic in TOPICS}
TOPIC_LABELS[OTHER_TOPIC.key] = OTHER_TOPIC.label

FOCUS_TOPIC_KEYS: Tuple[str, ...] = (
    "generative_foundations",
    "multimodal_generative",
    "multimodal_agents",
)


def classify_title(title: str) -> tuple[str, str, List[str]]:
    normalized = title.lower()
    best_score = 0
    best_priority = OTHER_TOPIC.priority
    best_topic = OTHER_TOPIC
    best_terms: List[str] = []

    for topic in TOPICS:
        if not required_groups_match(normalized, topic.required_groups):
            continue
        score = 0
        matched_terms: List[str] = []
        for pattern, weight in topic.patterns:
            if re.search(pattern, normalized):
                score += weight
                matched_terms.append(pattern)
        if score > best_score or (score == best_score and score > 0 and topic.priority < best_priority):
            best_score = score
            best_priority = topic.priority
            best_topic = topic
            best_terms = matched_terms

    return best_topic.key, best_topic.label, best_terms


def assign_topics(papers: Iterable[Paper]) -> List[Paper]:
    assigned: List[Paper] = []
    for paper in papers:
        topic_key, topic_label, matched_terms = classify_title(paper.title)
        paper.topic_key = topic_key
        paper.topic_label = topic_label
        paper.matched_terms = matched_terms
        paper.classification_source = "rule"
        paper.classification_confidence = None
        assigned.append(paper)
    return assigned


def required_groups_match(text: str, required_groups: Sequence[Sequence[str]]) -> bool:
    if not required_groups:
        return True
    return all(any(re.search(pattern, text) for pattern in group) for group in required_groups)
