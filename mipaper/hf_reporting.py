from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List

from mipaper.models import HFDailyPaper
from mipaper.reporting import focus_topic_distribution, topic_distribution


def group_hf_papers_by_topic(papers: Iterable[HFDailyPaper]) -> Dict[str, List[HFDailyPaper]]:
    grouped: Dict[str, List[HFDailyPaper]] = defaultdict(list)
    for paper in papers:
        grouped[paper.topic_label].append(paper)
    return dict(grouped)


def top_submitters(papers: Iterable[HFDailyPaper], limit: int = 6) -> List[dict]:
    counts = Counter(paper.submitted_by for paper in papers if paper.submitted_by)
    return [
        {"submitted_by": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
    ]


def top_upvoted_papers(papers: Iterable[HFDailyPaper], limit: int = 8) -> List[HFDailyPaper]:
    return sorted(
        papers,
        key=lambda paper: (paper.upvotes or -1, paper.comments or -1, paper.title),
        reverse=True,
    )[:limit]


def build_hf_insights(distribution: List[dict], papers: List[HFDailyPaper]) -> List[str]:
    if not papers:
        return ["No Hugging Face daily papers were captured today."]

    insights: List[str] = []
    if distribution:
        lead_topic = distribution[0]
        insights.append(
            f"The top topic today is “{lead_topic['topic_label']}”, with {lead_topic['count']} papers, accounting for {lead_topic['share']:.2f}%。"
        )

    submitters = top_submitters(papers, limit=1)
    if submitters:
        insights.append(f"The most active submitter is {submitters[0]['submitted_by']}， with {submitters[0]['count']} papers。")

    with_upvotes = [paper for paper in papers if paper.upvotes is not None]
    if with_upvotes:
        top_paper = max(with_upvotes, key=lambda paper: (paper.upvotes or 0, paper.title))
        insights.append(f"The highest-voted visible paper is “{top_paper.title}”, currently at {top_paper.upvotes} votes.")
    else:
        insights.append("The page does not reliably expose voting fields, so the report skips vote-based ranking conclusions.")

    return insights


def render_markdown_hf_report(
    *,
    report_date: str,
    source_url: str,
    papers: List[HFDailyPaper],
    classifier_name: str = "rule",
) -> str:
    distribution = topic_distribution(papers)
    focus_distribution = focus_topic_distribution(papers)
    grouped = group_hf_papers_by_topic(papers)
    insights = build_hf_insights(distribution, papers)
    submitters = top_submitters(papers)

    lines: List[str] = []
    lines.append(f"# Hugging Face Daily Papers Report ({report_date})")
    lines.append("")
    lines.append(f"- Source: {source_url}")
    lines.append(f"- Classifier: {classifier_name}")
    lines.append(f"- Total Papers: {len(papers)}")
    lines.append("")
    lines.append("## Focus Topics")
    lines.append("")
    for item in focus_distribution:
        lines.append(f"- {item['topic_label']}: {item['count']} papers ({item['share']:.2f}%)")
    lines.append("")
    lines.append("## Topic Distribution")
    lines.append("")
    for item in distribution:
        lines.append(f"- {item['topic_label']}: {item['count']} papers ({item['share']:.2f}%)")
    lines.append("")
    if submitters:
        lines.append("## Top Submitters")
        lines.append("")
        for item in submitters:
            lines.append(f"- {item['submitted_by']}: {item['count']} papers")
        lines.append("")
    lines.append("## Brief Notes")
    lines.append("")
    for insight in insights:
        lines.append(f"- {insight}")
    lines.append("")

    for topic_label in [item["topic_label"] for item in distribution]:
        topic_papers = sorted(
            grouped[topic_label],
            key=lambda paper: (paper.upvotes or -1, paper.comments or -1, paper.title),
            reverse=True,
        )
        lines.append(f"## {topic_label} ({len(topic_papers)} papers)")
        lines.append("")
        for paper in topic_papers:
            meta = []
            if paper.submitted_by:
                meta.append(f"Submitted by: {paper.submitted_by}")
            if paper.upvotes is not None:
                meta.append(f"Upvotes: {paper.upvotes}")
            if paper.comments is not None:
                meta.append(f"Comments: {paper.comments}")
            links = " / ".join(
                link
                for link in [
                    f"[HF]({paper.hf_url})" if paper.hf_url else "",
                    f"[arXiv]({paper.arxiv_pdf_url or paper.arxiv_url})" if (paper.arxiv_pdf_url or paper.arxiv_url) else "",
                    f"[Cool]({paper.papers_cool_url})" if paper.papers_cool_url else "",
                    f"[GitHub]({paper.github_url})" if paper.github_url else "",
                ]
                if link
            )
            badge = f" [{topic_label}]" if topic_label else ""
            lines.append(f"- [{paper.title}]({paper.hf_url or paper.arxiv_pdf_url or paper.arxiv_url}){badge}")
            if paper.authors:
                lines.append(f"  - Authors: {', '.join(paper.authors)}")
            if meta:
                lines.append(f"  - {' | '.join(meta)}")
            if links:
                lines.append(f"  - Links: {links}")
            if paper.abstract:
                lines.append("  - <details>")
                lines.append("    <summary>Abstract</summary>")
                lines.append("")
                lines.append(f"    {paper.abstract}")
                lines.append("    </details>")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def build_hf_json_payload(
    *,
    report_date: str,
    source_url: str,
    papers: List[HFDailyPaper],
    classifier_name: str = "rule",
) -> dict:
    distribution = topic_distribution(papers)
    focus_distribution = focus_topic_distribution(papers)
    grouped = group_hf_papers_by_topic(papers)

    topics = []
    for item in distribution:
        label = item["topic_label"]
        topics.append(
            {
                **item,
                "papers": [asdict(paper) for paper in grouped[label]],
            }
        )

    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "report_kind": "hf_daily",
        "report_date": report_date,
        "source_url": source_url,
        "classifier": classifier_name,
        "total_papers": len(papers),
        "focus_topics": focus_distribution,
        "topic_distribution": distribution,
        "top_submitters": top_submitters(papers),
        "top_upvoted": [asdict(paper) for paper in top_upvoted_papers(papers)],
        "topics": topics,
        "papers": [asdict(paper) for paper in papers],
    }


def write_hf_outputs(output_dir: Path, base_name: str, markdown_text: str, payload: dict) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_path = output_dir / f"{base_name}.md"
    json_path = output_dir / f"{base_name}.json"
    markdown_path.write_text(markdown_text, encoding="utf-8")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return markdown_path, json_path
