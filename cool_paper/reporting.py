from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List

from cool_paper.models import Paper
from cool_paper.topics import FOCUS_TOPIC_KEYS, TOPIC_LABELS


def group_papers_by_topic(papers: Iterable[Paper]) -> Dict[str, List[Paper]]:
    grouped: Dict[str, List[Paper]] = defaultdict(list)
    for paper in papers:
        grouped[paper.topic_label].append(paper)
    return dict(grouped)


def topic_distribution(papers: Iterable[Paper]) -> List[dict]:
    papers_list = list(papers)
    total = len(papers_list)
    counts = Counter(paper.topic_label for paper in papers_list)
    distribution = []
    for topic_label, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        distribution.append(
            {
                "topic_label": topic_label,
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


def build_insights(distribution: List[dict], total: int) -> List[str]:
    if not distribution or not total:
        return ["当天没有抓到任何 paper。"]

    insights: List[str] = []
    top_topic = distribution[0]
    insights.append(
        f"当天数量最多的是“{top_topic['topic_label']}”，共 {top_topic['count']} 篇，占 {top_topic['share']:.2f}%。"
    )

    top_three = distribution[:3]
    top_three_share = sum(item["share"] for item in top_three)
    concentration = "分布相对集中" if top_three_share >= 60 else "分布相对分散"
    insights.append(
        f"前 3 个 topic 合计占 {top_three_share:.2f}%，{concentration}。"
    )

    long_tail_topics = sum(1 for item in distribution if item["count"] == 1)
    insights.append(f"仅出现 1 篇的长尾 topic 有 {long_tail_topics} 个。")
    return insights


def format_authors(authors: List[str]) -> str:
    return ", ".join(authors) if authors else "Unknown"


def render_markdown_details_block(paper: Paper) -> List[str]:
    lines: List[str] = []
    if paper.authors:
        lines.append(f"  - Authors: {format_authors(paper.authors)}")
    if paper.abstract:
        lines.append("  - <details>")
        lines.append("    <summary>Abstract</summary>")
        lines.append("")
        lines.append(f"    {paper.abstract}")
        lines.append("    </details>")
    return lines


def render_markdown_report(
    *,
    category: str,
    report_date: str,
    source_url: str,
    papers: List[Paper],
    classifier_name: str = "rule",
) -> str:
    distribution = topic_distribution(papers)
    focus_distribution = focus_topic_distribution(papers)
    grouped = group_papers_by_topic(papers)
    insights = build_insights(distribution, len(papers))

    lines: List[str] = []
    lines.append(f"# {category} 每日论文分类报告 ({report_date})")
    lines.append("")
    lines.append(f"- 数据来源: {source_url}")
    lines.append("- 分类方式: 基于标题关键词的启发式 topic 分类")
    lines.append(f"- 分类器: {classifier_name}")
    lines.append(f"- 论文总数: {len(papers)}")
    lines.append("")
    lines.append("## 重点关注 Topic")
    lines.append("")
    for item in focus_distribution:
        lines.append(f"- {item['topic_label']}: {item['count']} 篇 ({item['share']:.2f}%)")
    lines.append("")
    lines.append("## Topic 占比分析")
    lines.append("")
    for item in distribution:
        lines.append(f"- {item['topic_label']}: {item['count']} 篇 ({item['share']:.2f}%)")
    lines.append("")
    lines.append("### 简析")
    lines.append("")
    for insight in insights:
        lines.append(f"- {insight}")
    lines.append("")

    topic_order = [item["topic_label"] for item in distribution]
    for topic_label in topic_order:
        topic_papers = grouped[topic_label]
        share = (len(topic_papers) / len(papers)) * 100 if papers else 0
        lines.append(f"## {topic_label} ({len(topic_papers)} 篇, {share:.2f}%)")
        lines.append("")
        for paper in topic_papers:
            lines.append(f"- [{paper.title}]({paper.pdf_url or paper.abs_url})")
            lines.extend(render_markdown_details_block(paper))
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def build_json_payload(
    *,
    category: str,
    report_date: str,
    source_url: str,
    papers: List[Paper],
    classifier_name: str = "rule",
) -> dict:
    distribution = topic_distribution(papers)
    focus_distribution = focus_topic_distribution(papers)
    grouped = group_papers_by_topic(papers)
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
        "category": category,
        "report_date": report_date,
        "source_url": source_url,
        "classifier": classifier_name,
        "total_papers": len(papers),
        "focus_topics": focus_distribution,
        "topic_distribution": distribution,
        "topics": topics,
        "papers": [asdict(paper) for paper in papers],
    }


def write_outputs(output_dir: Path, base_name: str, markdown_text: str, payload: dict) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_path = output_dir / f"{base_name}.md"
    json_path = output_dir / f"{base_name}.json"
    markdown_path.write_text(markdown_text, encoding="utf-8")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return markdown_path, json_path
