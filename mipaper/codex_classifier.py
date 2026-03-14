from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, TypeVar

from mipaper.topics import OTHER_TOPIC, TOPICS, TOPIC_LABELS, assign_topics

T = TypeVar("T")

TOPIC_DESCRIPTIONS: Dict[str, str] = {
    "generative_foundations": "only for titles clearly about generative-model families such as diffusion, autoregressive, flow, latent-variable, or world models, with theory, mechanisms, guarantees, or foundations",
    "multimodal_generative": "multimodal generative modeling such as text/image/video/audio/3D generation or editing",
    "multimodal_agents": "multimodal intelligent agents, VLA systems, language-conditioned robotics, or multimodal planning with explicit action, control, or agentic behavior",
    "agents_planning": "general agents, multi-agent systems, tool use, workflows, and planning",
    "robotics_embodied": "robotics, embodied AI, navigation, control, and manipulation",
    "multimodal_vision": "multimodal understanding, vision, speech, video, and visual reasoning",
    "retrieval_knowledge": "retrieval, RAG, search, memory, and knowledge-intensive systems",
    "datasets_benchmarks": "datasets, benchmarks, corpora, and evaluation suites",
    "reasoning_alignment_eval": "reasoning, alignment, safety, judges, bias, privacy, and evaluation",
    "domain_applications": "medical, scientific, legal, industrial, or domain-specific applications",
    "learning_theory": "learning algorithms, optimization, generalization, representations, and ML theory outside generative-model foundations",
    "llm_language": "LLMs, language modeling, prompting, text/code generation, and dialogue",
    "other_ai": "use only when no other topic fits better",
}


class CodexClassificationError(RuntimeError):
    pass


class ClaudeClassificationError(RuntimeError):
    pass


def classify_with_codex(
    papers: Sequence[T],
    *,
    model: Optional[str] = None,
    timeout_seconds: int = 600,
    fallback_to_rules: bool = True,
    fallback_provider: Optional[str] = None,
    claude_model: Optional[str] = None,
) -> List[T]:
    if not papers:
        return list(papers)

    try:
        raw_response = run_codex_exec(
            papers,
            model=model,
            timeout_seconds=timeout_seconds,
        )
    except CodexClassificationError as exc:
        if fallback_provider == "claude" and should_fallback_to_claude(str(exc)):
            return classify_with_claude(
                papers,
                model=claude_model,
                timeout_seconds=timeout_seconds,
                fallback_to_rules=fallback_to_rules,
            )
        raise
    try:
        payload = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise CodexClassificationError(f"Failed to parse Codex JSON output: {exc}") from exc

    assignments = validate_assignments(payload, papers)
    papers_by_id = {paper.paper_id: paper for paper in papers}

    for paper_id, assignment in assignments.items():
        paper = papers_by_id[paper_id]
        paper.topic_key = assignment["topic_key"]
        paper.topic_label = TOPIC_LABELS[assignment["topic_key"]]
        paper.matched_terms = []
        paper.classification_source = "codex"
        paper.classification_confidence = assignment["confidence"]

    missing_ids = [paper.paper_id for paper in papers if paper.paper_id not in assignments]
    if missing_ids:
        if not fallback_to_rules:
            missing_str = ", ".join(missing_ids[:10])
            raise CodexClassificationError(f"Codex returned incomplete assignments. Missing: {missing_str}")

        fallback_papers = [papers_by_id[paper_id] for paper_id in missing_ids]
        assign_topics(fallback_papers)

    return list(papers)


def classify_with_claude(
    papers: Sequence[T],
    *,
    model: Optional[str] = None,
    timeout_seconds: int = 600,
    fallback_to_rules: bool = True,
) -> List[T]:
    if not papers:
        return list(papers)

    # Batch processing for large conferences
    BATCH_SIZE = 100
    if len(papers) > BATCH_SIZE:
        print(f"Processing {len(papers)} papers in batches of {BATCH_SIZE}...")
        all_papers = list(papers)
        for i in range(0, len(all_papers), BATCH_SIZE):
            batch = all_papers[i:i + BATCH_SIZE]
            print(f"Batch {i//BATCH_SIZE + 1}/{(len(all_papers) + BATCH_SIZE - 1)//BATCH_SIZE}: {len(batch)} papers")
            classify_with_claude(batch, model=model, timeout_seconds=timeout_seconds, fallback_to_rules=fallback_to_rules)
        return all_papers

    # Dynamic timeout: 2 seconds per paper, minimum 600s
    dynamic_timeout = max(timeout_seconds, len(papers) * 2)
    payload = run_claude_exec(
        papers,
        model=model,
        timeout_seconds=dynamic_timeout,
    )
    assignments = validate_assignments(payload, papers)
    papers_by_id = {paper.paper_id: paper for paper in papers}

    for paper_id, assignment in assignments.items():
        paper = papers_by_id[paper_id]
        paper.topic_key = assignment["topic_key"]
        paper.topic_label = TOPIC_LABELS[assignment["topic_key"]]
        paper.matched_terms = []
        paper.classification_source = "claude"
        paper.classification_confidence = assignment["confidence"]

    missing_ids = [paper.paper_id for paper in papers if paper.paper_id not in assignments]
    if missing_ids:
        if not fallback_to_rules:
            missing_str = ", ".join(missing_ids[:10])
            raise ClaudeClassificationError(f"Claude returned incomplete assignments. Missing: {missing_str}")

        fallback_papers = [papers_by_id[paper_id] for paper_id in missing_ids]
        assign_topics(fallback_papers)

    return list(papers)


def run_codex_exec(
    papers: Sequence[Any],
    *,
    model: Optional[str],
    timeout_seconds: int,
) -> str:
    prompt = build_prompt(papers)
    schema = build_output_schema()

    with tempfile.TemporaryDirectory(prefix="cool-paper-codex-") as temp_dir:
        temp_path = Path(temp_dir)
        schema_path = temp_path / "schema.json"
        output_path = temp_path / "response.json"
        schema_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")

        command = [
            "codex",
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--color",
            "never",
            "-c",
            'model_reasoning_effort="high"',
            "--output-schema",
            str(schema_path),
            "-o",
            str(output_path),
            "-",
        ]
        if model:
            command[2:2] = ["-m", model]

        try:
            subprocess.run(
                command,
                input=prompt,
                text=True,
                capture_output=True,
                check=True,
                timeout=timeout_seconds,
            )
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip()
            stdout = exc.stdout.strip()
            detail = stderr or stdout or str(exc)
            raise CodexClassificationError(f"codex exec failed: {detail}") from exc
        except subprocess.TimeoutExpired as exc:
            raise CodexClassificationError(f"codex exec timed out after {timeout_seconds} seconds") from exc

        if not output_path.exists():
            raise CodexClassificationError("codex exec finished without producing an output file")

        return output_path.read_text(encoding="utf-8").strip()


def run_claude_exec(
    papers: Sequence[Any],
    *,
    model: Optional[str],
    timeout_seconds: int,
) -> dict:
    prompt = build_prompt(papers)
    schema = build_output_schema()

    if not shutil.which("claude"):
        raise ClaudeClassificationError("claude CLI is not available in PATH")

    command = [
        "claude",
        "-p",
        "--output-format",
        "json",
        "--json-schema",
        json.dumps(schema, ensure_ascii=False),
        "--tools",
        "",
        "--permission-mode",
        "bypassPermissions",
    ]
    if model:
        command.extend(["--model", model])

    try:
        completed = subprocess.run(
            command,
            input=prompt,
            text=True,
            capture_output=True,
            check=True,
            timeout=timeout_seconds,
        )
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip()
        stdout = exc.stdout.strip()
        detail = stderr or stdout or str(exc)
        raise ClaudeClassificationError(f"claude exec failed: {detail}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ClaudeClassificationError(f"claude exec timed out after {timeout_seconds} seconds") from exc

    stdout = completed.stdout.strip()
    if not stdout:
        raise ClaudeClassificationError("claude exec finished without producing output")

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise ClaudeClassificationError(f"Failed to parse Claude JSON output: {exc}") from exc

    structured_output = payload.get("structured_output")
    if not isinstance(structured_output, dict):
        raise ClaudeClassificationError("Claude JSON output missing structured_output object")
    return structured_output


def should_fallback_to_claude(detail: str) -> bool:
    normalized = detail.lower()
    markers = (
        "rate limit",
        "429",
        "quota",
        "usage limit",
        "overloaded",
        "too many requests",
        "unavailable in path",
        "not available in path",
        "timeout",
        "timed out",
    )
    return any(marker in normalized for marker in markers)


def build_prompt(papers: Sequence[Any]) -> str:
    topic_block = []
    for topic in TOPICS:
        topic_block.append(f"- {topic.key}: {topic.label}. {TOPIC_DESCRIPTIONS[topic.key]}")
    topic_block.append(f"- {OTHER_TOPIC.key}: {OTHER_TOPIC.label}. {TOPIC_DESCRIPTIONS[OTHER_TOPIC.key]}")

    paper_block = json.dumps(
        [{"paper_id": paper.paper_id, "title": paper.title} for paper in papers],
        ensure_ascii=False,
        indent=2,
    )

    return f"""You are classifying AI paper titles for a researcher.

Assign exactly one topic_key to each paper.
Prioritize these focus topics when they clearly apply:
- generative_foundations
- multimodal_generative
- multimodal_agents

Topic list:
{chr(10).join(topic_block)}

Rules:
- Use exactly one topic_key from the list above.
- Base the decision on the title only.
- Prefer the most specific topic instead of a broad one.
- Use the three focus topics conservatively.
- Do not use generative_foundations for generic transformer or LLM interpretability unless the title clearly signals a generative-model family.
- Do not use multimodal_agents unless the title clearly implies both multimodal grounding and agentic action/planning/robotics.
- Use other_ai only when none of the listed topics clearly fits.
- Return JSON only and follow the schema exactly.

Papers:
{paper_block}
"""


def build_output_schema() -> dict:
    topic_keys = [topic.key for topic in TOPICS] + [OTHER_TOPIC.key]
    return {
        "type": "object",
        "properties": {
            "papers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "paper_id": {"type": "string"},
                        "topic_key": {"type": "string", "enum": topic_keys},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                    "required": ["paper_id", "topic_key", "confidence"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["papers"],
        "additionalProperties": False,
    }


def validate_assignments(payload: dict, papers: Sequence[Any]) -> Dict[str, dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("papers"), list):
        raise CodexClassificationError("Codex output must be an object with a 'papers' array")

    expected_ids = {paper.paper_id for paper in papers}
    assignments: Dict[str, dict] = {}

    for item in payload["papers"]:
        if not isinstance(item, dict):
            raise CodexClassificationError("Each assignment must be an object")
        paper_id = item.get("paper_id")
        topic_key = item.get("topic_key")
        confidence = item.get("confidence")

        if paper_id not in expected_ids:
            raise CodexClassificationError(f"Unexpected paper_id from Codex: {paper_id}")
        if topic_key not in TOPIC_LABELS:
            raise CodexClassificationError(f"Unexpected topic_key from Codex: {topic_key}")
        if not isinstance(confidence, (int, float)):
            raise CodexClassificationError(f"Invalid confidence for paper_id={paper_id}")

        assignments[paper_id] = {
            "paper_id": paper_id,
            "topic_key": topic_key,
            "confidence": round(float(confidence), 4),
        }

    return assignments
