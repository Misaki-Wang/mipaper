from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List

from cool_paper.models import TrendingRepo


def group_repos_by_language(repos: Iterable[TrendingRepo]) -> Dict[str, List[TrendingRepo]]:
    grouped: Dict[str, List[TrendingRepo]] = defaultdict(list)
    for repo in repos:
        grouped[repo.language or "Unknown"].append(repo)
    return dict(grouped)


def language_distribution(repos: Iterable[TrendingRepo]) -> List[dict]:
    items = list(repos)
    counts = Counter(repo.language or "Unknown" for repo in items)
    total = len(items)
    return [
        {
            "language": language,
            "count": count,
            "share": (count / total * 100) if total else 0,
        }
        for language, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def top_repositories(repos: Iterable[TrendingRepo], limit: int = 8) -> List[TrendingRepo]:
    return sorted(
        repos,
        key=lambda repo: (repo.stars_this_week or -1, repo.stars or -1, repo.full_name.lower()),
        reverse=True,
    )[:limit]


def render_markdown_trending_report(
    *,
    snapshot_date: str,
    source_url: str,
    repos: List[TrendingRepo],
    since: str = "weekly",
) -> str:
    distribution = language_distribution(repos)
    grouped = group_repos_by_language(repos)
    lines: List[str] = []
    lines.append(f"# GitHub Trending Report ({snapshot_date})")
    lines.append("")
    lines.append(f"- Source: {source_url}")
    lines.append(f"- Window: {since}")
    lines.append(f"- Total Repositories: {len(repos)}")
    lines.append("")
    lines.append("## Language Distribution")
    lines.append("")
    for item in distribution:
        lines.append(f"- {item['language']}: {item['count']} repositories ({item['share']:.2f}%)")
    lines.append("")
    lines.append("## Top Repositories")
    lines.append("")
    for repo in top_repositories(repos):
        meta = []
        if repo.language:
            meta.append(f"Language: {repo.language}")
        if repo.stars_this_week is not None:
            meta.append(f"Stars This Week: {repo.stars_this_week}")
        if repo.stars is not None:
            meta.append(f"Stars: {repo.stars}")
        if repo.forks is not None:
            meta.append(f"Forks: {repo.forks}")
        lines.append(f"- [{repo.full_name}]({repo.repo_url})")
        if repo.description:
            lines.append(f"  - {repo.description}")
        if meta:
            lines.append(f"  - {' | '.join(meta)}")
        if repo.built_by:
            lines.append(f"  - Built by: {', '.join(repo.built_by)}")
    lines.append("")

    for item in distribution:
        language = item["language"]
        language_repos = sorted(
            grouped[language],
            key=lambda repo: (repo.stars_this_week or -1, repo.stars or -1, repo.full_name.lower()),
            reverse=True,
        )
        lines.append(f"## {language} ({len(language_repos)} repositories)")
        lines.append("")
        for repo in language_repos:
            lines.append(f"- [{repo.full_name}]({repo.repo_url})")
            if repo.description:
                lines.append(f"  - {repo.description}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def build_trending_json_payload(
    *,
    snapshot_date: str,
    source_url: str,
    repos: List[TrendingRepo],
    since: str = "weekly",
) -> dict:
    distribution = language_distribution(repos)
    grouped = group_repos_by_language(repos)
    languages = []
    for item in distribution:
        language = item["language"]
        languages.append(
            {
                **item,
                "repositories": [asdict(repo) for repo in grouped[language]],
            }
        )

    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "report_kind": "trending",
        "snapshot_date": snapshot_date,
        "source_url": source_url,
        "since": since,
        "total_repositories": len(repos),
        "language_distribution": distribution,
        "top_repositories": [asdict(repo) for repo in top_repositories(repos)],
        "languages": languages,
        "repositories": [asdict(repo) for repo in repos],
    }


def write_trending_outputs(output_dir: Path, base_name: str, markdown_text: str, payload: dict) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_path = output_dir / f"{base_name}.md"
    json_path = output_dir / f"{base_name}.json"
    markdown_path.write_text(markdown_text, encoding="utf-8")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return markdown_path, json_path
