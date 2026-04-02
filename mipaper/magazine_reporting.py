from __future__ import annotations

import json
import re
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from mipaper.branch_site_data import write_json_if_changed
from mipaper.models import MagazineIssue, MagazineIssueSection

MARKDOWN_IMAGE_PATTERN = re.compile(r"!\[[^\]]*\]\((https?://[^)\s]+)\)")


def render_markdown_magazine_report(issue: MagazineIssue) -> str:
    return build_magazine_markdown(issue)


def build_magazine_markdown(issue: MagazineIssue) -> str:
    parts = [f"# {issue.issue_title}", ""]
    if issue.lead_markdown:
        parts.append(issue.lead_markdown.strip())
        parts.append("")
    for section in issue.sections:
        parts.append(f"## {section.title}")
        parts.append("")
        if section.markdown:
            parts.append(section.markdown.strip())
            parts.append("")
    return "\n".join(part for part in parts if part is not None).strip() + "\n"


def build_magazine_json_payload(issue: MagazineIssue) -> dict:
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "report_kind": "magazine",
        "sync_date": issue.sync_date,
        "issue_number": issue.issue_number,
        "issue_slug": issue.issue_slug,
        "issue_title": issue.issue_title,
        "source_url": issue.source_url,
        "raw_url": issue.raw_url,
        "cover_image_url": issue.cover_image_url,
        "excerpt": issue.excerpt,
        "lead_markdown": issue.lead_markdown,
        "sections_count": len(issue.sections),
        "headings": [
            {
                "title": section.title,
                "slug": section.slug,
                "level": 2,
            }
            for section in issue.sections
        ],
        "sections": [asdict(section) for section in issue.sections],
    }


def write_magazine_outputs(output_dir: Path, base_name: str, markdown_text: str, payload: dict) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_path = output_dir / f"{base_name}.md"
    json_path = output_dir / f"{base_name}.json"

    if markdown_path.exists():
        existing_markdown = markdown_path.read_text(encoding="utf-8")
        if existing_markdown != markdown_text:
            markdown_path.write_text(markdown_text, encoding="utf-8")
    else:
        markdown_path.write_text(markdown_text, encoding="utf-8")

    write_json_if_changed(json_path, payload)
    return markdown_path, json_path


def parse_magazine_issue_markdown(
    markdown_text: str,
    *,
    sync_date: str,
    issue_number: int,
    source_url: str,
    raw_url: str,
) -> MagazineIssue:
    normalized = markdown_text.replace("\r\n", "\n").strip()
    lines = normalized.split("\n")
    first_heading = next((line for line in lines if line.startswith("# ")), "")
    issue_title = first_heading[2:].strip() if first_heading else f"科技爱好者周刊（第 {issue_number} 期）"

    content_lines = list(lines)
    if first_heading:
        first_heading_index = content_lines.index(first_heading)
        content_lines = content_lines[first_heading_index + 1 :]
    body_markdown = "\n".join(content_lines).strip()

    lead_markdown, sections = split_magazine_sections(body_markdown)
    return MagazineIssue(
        sync_date=sync_date,
        issue_number=issue_number,
        issue_slug=f"issue-{issue_number}",
        issue_title=issue_title,
        source_url=source_url,
        raw_url=raw_url,
        cover_image_url=extract_cover_image_url(body_markdown),
        excerpt=extract_excerpt(lead_markdown),
        lead_markdown=lead_markdown,
        sections=sections,
    )


def split_magazine_sections(body_markdown: str) -> tuple[str, list[MagazineIssueSection]]:
    if not body_markdown.strip():
        return "", []

    lines = body_markdown.split("\n")
    lead_lines: list[str] = []
    sections: list[MagazineIssueSection] = []
    current_title = ""
    current_lines: list[str] = []

    def flush_section() -> None:
        nonlocal current_title, current_lines
        if not current_title:
            return
        section_index = len(sections) + 1
        section_markdown = "\n".join(current_lines).strip()
        sections.append(
            MagazineIssueSection(
                title=current_title,
                slug=f"magazine-section-{section_index}",
                markdown=section_markdown,
                excerpt=extract_excerpt(section_markdown),
            )
        )
        current_title = ""
        current_lines = []

    for line in lines:
        match = re.match(r"^##\s+(.+?)\s*$", line)
        if match:
            flush_section()
            current_title = match.group(1).strip()
            continue
        if current_title:
            current_lines.append(line)
        else:
            lead_lines.append(line)

    flush_section()
    return "\n".join(lead_lines).strip(), sections


def extract_cover_image_url(markdown_text: str) -> str:
    match = MARKDOWN_IMAGE_PATTERN.search(markdown_text)
    return match.group(1) if match else ""


def extract_excerpt(markdown_text: str) -> str:
    if not markdown_text.strip():
        return ""

    paragraphs: list[str] = []
    for block in re.split(r"\n{2,}", markdown_text):
        normalized = " ".join(line.strip() for line in block.splitlines()).strip()
        if not normalized or normalized.startswith("![](") or normalized.startswith("!["):
            continue
        normalized = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", normalized).strip()
        normalized = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", normalized)
        normalized = re.sub(r"[*_`#>~]", "", normalized).strip()
        if not normalized:
            continue
        paragraphs.append(normalized)
        if len(paragraphs) >= 2:
            break
    return "\n\n".join(paragraphs).strip()
