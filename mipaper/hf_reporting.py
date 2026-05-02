from __future__ import annotations

import json
import re
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


def one_sentence_summary(paper: HFDailyPaper, max_length: int = 220) -> str:
    abstract = normalize_inline_text(paper.abstract)
    if abstract:
        first_sentence = split_first_sentence(abstract)
        return truncate_sentence(first_sentence, max_length=max_length)

    topic_label = paper.topic_label or "AI research"
    return f"This paper contributes to {topic_label} through the problem framed in its title."


def build_hf_daily_digest(distribution: List[dict], papers: List[HFDailyPaper]) -> dict:
    if not papers:
        return {
            "main_hotspots": ["No Hugging Face daily papers were captured for this date."],
            "trend_summary": "No trend can be inferred without captured papers.",
            "category_summaries": [],
            "top_papers": [],
        }

    top_topics = distribution[:3]
    main_hotspots = []
    for item in top_topics:
        topic_papers = [paper for paper in papers if paper.topic_label == item["topic_label"]]
        lead_paper = top_upvoted_papers(topic_papers, limit=1)
        lead_clause = f"; representative paper: {lead_paper[0].title}" if lead_paper else ""
        main_hotspots.append(
            f"{item['topic_label']}: {item['count']} papers ({item['share']:.2f}%){lead_clause}."
        )

    grouped = group_hf_papers_by_topic(papers)
    category_summaries = []
    for item in distribution:
        topic_papers = grouped.get(item["topic_label"], [])
        category_summaries.append(
            {
                "topic_label": item["topic_label"],
                "count": item["count"],
                "share": item["share"],
                "summary": build_category_summary(item, topic_papers),
            }
        )

    return {
        "main_hotspots": main_hotspots,
        "trend_summary": build_hf_trend_summary(distribution, papers),
        "category_summaries": category_summaries,
        "top_papers": [paper_digest_item(paper) for paper in top_upvoted_papers(papers, limit=5)],
    }


def build_hf_trend_summary(distribution: List[dict], papers: List[HFDailyPaper]) -> str:
    top_labels = [item["topic_label"] for item in distribution[:3]]
    if not top_labels:
        return "Today's HF Daily set is too sparse to infer a dominant trend."

    trend_clauses: List[str] = []
    if any("Multimodal" in label for label in top_labels):
        trend_clauses.append("multimodal work is moving from isolated perception toward generation, agents, and action")
    if any("Agent" in label or "Planning" in label for label in top_labels):
        trend_clauses.append("agent papers emphasize tool use, planning, and deployable workflows")
    if any("Generative" in label for label in top_labels):
        trend_clauses.append("generative-model papers continue to focus on scaling, controllability, and foundation-model mechanics")
    if any("Robotics" in label or "Embodied" in label for label in top_labels):
        trend_clauses.append("embodied-AI work is increasingly tied to vision-language-action models and real-world control")

    if not trend_clauses:
        trend_clauses.append("attention is spread across application adaptation, evaluation, and model reliability")

    upvoted = [paper for paper in papers if paper.upvotes is not None]
    vote_clause = ""
    if upvoted:
        top_paper = max(upvoted, key=lambda paper: (paper.upvotes or 0, paper.title))
        vote_clause = f" The strongest visible attention is on “{top_paper.title}” ({top_paper.upvotes} upvotes)."

    if len(trend_clauses) == 1:
        trend_text = f"this suggests that {trend_clauses[0]}"
    else:
        trend_text = f"this suggests several parallel trends: {'; '.join(trend_clauses)}"

    return f"Today's dominant clusters are {' / '.join(top_labels)}; {trend_text}.{vote_clause}"


def build_category_summary(item: dict, papers: List[HFDailyPaper]) -> str:
    if not papers:
        return f"{item['topic_label']} has no visible papers after filtering."

    lead_paper = top_upvoted_papers(papers, limit=1)[0]
    return (
        f"{item['topic_label']} contributes {item['count']} papers ({item['share']:.2f}%), "
        f"led by “{lead_paper.title}” with {format_upvote_count(lead_paper)}."
    )


def paper_digest_item(paper: HFDailyPaper) -> dict:
    return {
        "title": paper.title,
        "upvotes": paper.upvotes,
        "upvote_label": format_upvote_count(paper),
        "topic_label": paper.topic_label,
        "summary": one_sentence_summary(paper),
        "hf_url": paper.hf_url,
        "arxiv_url": paper.arxiv_url,
        "arxiv_pdf_url": paper.arxiv_pdf_url,
        "papers_cool_url": paper.papers_cool_url,
    }


def paper_payload(paper: HFDailyPaper) -> dict:
    payload = asdict(paper)
    payload["one_sentence_summary"] = one_sentence_summary(paper)
    payload["upvote_label"] = format_upvote_count(paper)
    return payload


def format_upvote_count(paper: HFDailyPaper) -> str:
    if paper.upvotes is None:
        return "N/A upvotes"
    if paper.upvotes == 1:
        return "1 upvote"
    return f"{paper.upvotes} upvotes"


def normalize_inline_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def split_first_sentence(value: str) -> str:
    matches = list(re.finditer(r"(?<=[.!?])\s+(?=[A-Z0-9])", value))
    if not matches:
        return value

    sentence = value[: matches[0].start()].strip()
    if len(sentence) >= 48:
        return sentence

    second_end = matches[1].start() if len(matches) > 1 else len(value)
    return value[:second_end].strip()


def truncate_sentence(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    truncated = value[: max_length - 1].rstrip()
    if " " in truncated:
        truncated = truncated.rsplit(" ", 1)[0]
    return f"{truncated}…"


def build_hf_insights(distribution: List[dict], papers: List[HFDailyPaper]) -> List[str]:
    if not papers:
        return ["No Hugging Face daily papers were captured today."]

    digest = build_hf_daily_digest(distribution, papers)
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

    insights.append(digest["trend_summary"])
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
    digest = build_hf_daily_digest(distribution, papers)
    submitters = top_submitters(papers)

    lines: List[str] = []
    lines.append(f"# Hugging Face Daily Papers Report ({report_date})")
    lines.append("")
    lines.append(f"- Source: {source_url}")
    lines.append(f"- Classifier: {classifier_name}")
    lines.append(f"- Total Papers: {len(papers)}")
    lines.append("")
    lines.append("## Today's Hotspots and Trend")
    lines.append("")
    for hotspot in digest["main_hotspots"]:
        lines.append(f"- {hotspot}")
    lines.append(f"- Trend: {digest['trend_summary']}")
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

    lines.append("## Categorized Paper Briefs")
    lines.append("")
    for topic_label in [item["topic_label"] for item in distribution]:
        topic_papers = sorted(
            grouped[topic_label],
            key=lambda paper: (paper.upvotes or -1, paper.comments or -1, paper.title),
            reverse=True,
        )
        lines.append(f"### {topic_label} ({len(topic_papers)} papers)")
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
            summary = one_sentence_summary(paper)
            lines.append(
                f"- [{paper.title}]({paper.hf_url or paper.arxiv_pdf_url or paper.arxiv_url}) "
                f"[Upvote: {paper.upvotes if paper.upvotes is not None else 'N/A'}] {summary}{badge}"
            )
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
                "summary": build_category_summary(item, grouped[label]),
                "papers": [paper_payload(paper) for paper in grouped[label]],
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
        "daily_digest": build_hf_daily_digest(distribution, papers),
        "top_submitters": top_submitters(papers),
        "top_upvoted": [paper_payload(paper) for paper in top_upvoted_papers(papers)],
        "topics": topics,
        "papers": [paper_payload(paper) for paper in papers],
    }


def write_hf_outputs(output_dir: Path, base_name: str, markdown_text: str, payload: dict) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_path = output_dir / f"{base_name}.md"
    json_path = output_dir / f"{base_name}.json"
    markdown_path.write_text(markdown_text, encoding="utf-8")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return markdown_path, json_path
