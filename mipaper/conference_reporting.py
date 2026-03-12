from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List

from mipaper.models import Paper
from mipaper.reporting import render_markdown_details_block, topic_distribution
from mipaper.topics import FOCUS_TOPIC_KEYS, TOPIC_LABELS


def subject_distribution(papers: Iterable[Paper]) -> List[dict]:
    papers_list = list(papers)
    total = len(papers_list)
    counts = Counter(primary_subject(paper) for paper in papers_list)
    distribution = []
    for subject_label, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        distribution.append(
            {
                "subject_label": subject_label,
                "count": count,
                "share": round((count / total) * 100, 2) if total else 0,
            }
        )
    return distribution


def focus_topic_distribution(papers: Iterable[Paper]) -> List[dict]:
    papers_list = list(papers)
    total = len(papers_list)
    counts = Counter(paper.topic_key for paper in papers_list)
    distribution = []
    for topic_key in FOCUS_TOPIC_KEYS:
        count = counts.get(topic_key, 0)
        distribution.append(
            {
                "topic_key": topic_key,
                "topic_label": TOPIC_LABELS[topic_key],
                "count": count,
                "share": round((count / total) * 100, 2) if total else 0,
            }
        )
    return distribution


def primary_subject(paper: Paper) -> str:
    return paper.subjects[0] if paper.subjects else "Unspecified"


def group_papers_by_subject(papers: Iterable[Paper]) -> Dict[str, List[Paper]]:
    grouped: Dict[str, List[Paper]] = defaultdict(list)
    for paper in papers:
        grouped[primary_subject(paper)].append(paper)
    return dict(grouped)


def build_subject_insights(subjects: List[dict], topics: List[dict], total: int) -> List[str]:
    if not total:
        return ["No papers were captured from the current conference page."]

    insights: List[str] = []
    if subjects:
        dominant_subject = subjects[0]
        insights.append(
            f"The largest subject is “{dominant_subject['subject_label']}”, with {dominant_subject['count']} papers, accounting for {dominant_subject['share']:.2f}%。"
        )
    if topics:
        dominant_topic = topics[0]
        insights.append(
            f"By topic, the most active area is “{dominant_topic['topic_label']}”, with {dominant_topic['count']} papers。"
        )
    long_tail_subjects = sum(1 for item in subjects if item["count"] == 1)
    insights.append(f"Subjects with only one paper: {long_tail_subjects} items。")
    return insights


def render_markdown_conference_report(
    *,
    venue: str,
    source_url: str,
    papers: List[Paper],
    classifier_name: str = "rule",
    fetch_metadata: dict | None = None,
) -> str:
    subjects = subject_distribution(papers)
    topics = topic_distribution(papers)
    focus_topics = focus_topic_distribution(papers)
    grouped = group_papers_by_subject(papers)
    insights = build_subject_insights(subjects, topics, len(papers))

    lines: List[str] = []
    lines.append(f"# {venue} Conference Analysis Report")
    lines.append("")
    lines.append(f"- Source: {source_url}")
    lines.append(f"- Classifier: {classifier_name}")
    lines.append(f"- Total Papers: {len(papers)}")
    if fetch_metadata:
        total_declared = fetch_metadata.get("declared_total")
        requested_show = fetch_metadata.get("requested_show")
        is_complete = fetch_metadata.get("is_complete")
        if total_declared is not None:
            lines.append(f"- Declared Total: {total_declared}")
        if requested_show is not None:
            lines.append(f"- Requested show: {requested_show}")
        if is_complete is not None:
            lines.append(f"- Capture Status: {'complete' if is_complete else 'partial'}")
    lines.append("")
    lines.append("## Subject Distribution")
    lines.append("")
    for item in subjects:
        lines.append(f"- {item['subject_label']}: {item['count']} papers ({item['share']:.2f}%)")
    lines.append("")
    lines.append("## Focus Topics")
    lines.append("")
    for item in focus_topics:
        lines.append(f"- {item['topic_label']}: {item['count']} papers ({item['share']:.2f}%)")
    lines.append("")
    lines.append("## Brief Notes")
    lines.append("")
    for insight in insights:
        lines.append(f"- {insight}")
    lines.append("")

    for subject in [item["subject_label"] for item in subjects]:
        subject_papers = grouped[subject]
        subject_topics = topic_distribution(subject_papers)
        topic_summary = subject_topics[0]["topic_label"] if subject_topics else "Other AI"
        lines.append(f"## {subject} ({len(subject_papers)} papers)")
        lines.append("")
        lines.append(f"- Top Topic: {topic_summary}")
        for paper in subject_papers:
            badge = f" [{paper.topic_label}]" if paper.topic_label else ""
            lines.append(f"- [{paper.title}]({paper.pdf_url or paper.detail_url}){badge}")
            if paper.subjects:
                lines.append(f"  - Subject: {', '.join(paper.subjects)}")
            lines.extend(render_markdown_details_block(paper))
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def build_conference_json_payload(
    *,
    venue: str,
    source_url: str,
    papers: List[Paper],
    classifier_name: str = "rule",
    fetch_metadata: dict | None = None,
) -> dict:
    subjects = subject_distribution(papers)
    topics = topic_distribution(papers)
    focus_topics = focus_topic_distribution(papers)
    grouped = group_papers_by_subject(papers)

    subject_sections = []
    for item in subjects:
        label = item["subject_label"]
        subject_sections.append(
            {
                **item,
                "papers": [asdict(paper) for paper in grouped[label]],
                "topic_distribution": topic_distribution(grouped[label]),
            }
        )

    venue_series, _, venue_year = venue.partition(".")
    total_papers = len(papers)
    declared_total = fetch_metadata.get("declared_total") if fetch_metadata else None
    requested_show = fetch_metadata.get("requested_show") if fetch_metadata else None
    capture_ratio = round((total_papers / declared_total) * 100, 2) if declared_total else None
    is_complete = total_papers >= declared_total if declared_total else None
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "report_kind": "conference",
        "venue": venue,
        "venue_series": venue_series,
        "venue_year": venue_year,
        "source_url": source_url,
        "classifier": classifier_name,
        "total_papers": total_papers,
        "declared_total": declared_total,
        "requested_show": requested_show,
        "capture_ratio": capture_ratio,
        "is_complete": is_complete,
        "subject_distribution": subjects,
        "focus_topics": focus_topics,
        "topic_distribution": topics,
        "subjects": subject_sections,
        "papers": [asdict(paper) for paper in papers],
    }


def write_conference_outputs(
    output_dir: Path, base_name: str, markdown_text: str, payload: dict
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_path = output_dir / f"{base_name}.md"
    json_path = output_dir / f"{base_name}.json"
    markdown_path.write_text(markdown_text, encoding="utf-8")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return markdown_path, json_path
