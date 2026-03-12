from __future__ import annotations

import json
import re
from html import unescape
from html.parser import HTMLParser
from typing import Callable, Dict, List
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

from cool_paper.models import HFDailyPaper, Paper, TrendingRepo

PAPERS_COOL_ROOT = "https://papers.cool"
HUGGING_FACE_ROOT = "https://huggingface.co"
GITHUB_ROOT = "https://github.com"
ARXIV_CATEGORY_PATH = "/arxiv/{category}"
VENUE_PATH = "/venue/{venue}"
HF_DAILY_PATH = "/papers/date/{date_value}"
GITHUB_TRENDING_PATH = "/trending"
DEFAULT_SHOW = 1000
USER_AGENT = "cool-paper-bot/1.0"
VENUE_TOTAL_PATTERN = re.compile(r"Total:\s*([0-9][0-9,]*)")
MAX_VENUE_FETCH_ATTEMPTS = 6
ARXIV_ID_PATTERN = re.compile(r"^\d{4}\.\d{4,5}(?:v\d+)?$")
TRENDING_ARTICLE_PATTERN = re.compile(r'<article[^>]*class="Box-row"[^>]*>(.*?)</article>', re.S)


def arxiv_abs_to_pdf(abs_url: str) -> str:
    return abs_url.replace("/abs/", "/pdf/", 1) if "/abs/" in abs_url else abs_url


def build_feed_url(category: str, date_value: str, show: int = DEFAULT_SHOW) -> str:
    query = urlencode({"date": date_value, "show": str(show)})
    return f"{PAPERS_COOL_ROOT}{ARXIV_CATEGORY_PATH.format(category=category)}?{query}"


def build_hf_daily_url(date_value: str) -> str:
    return f"{HUGGING_FACE_ROOT}{HF_DAILY_PATH.format(date_value=date_value)}"


def build_github_trending_url(since: str = "weekly", spoken_language_code: str = "") -> str:
    query = urlencode({"since": since, "spoken_language_code": spoken_language_code})
    return f"{GITHUB_ROOT}{GITHUB_TRENDING_PATH}?{query}"


def build_venue_url(venue: str, group: str = "", show: int = DEFAULT_SHOW) -> str:
    query_payload = {"show": str(show)}
    if group:
        query_payload["group"] = group
    query = urlencode(query_payload)
    base = f"{PAPERS_COOL_ROOT}{VENUE_PATH.format(venue=venue)}"
    return f"{base}?{query}"


def extract_total_papers(html_text: str) -> int | None:
    match = VENUE_TOTAL_PATTERN.search(html_text)
    if not match:
        return None
    return int(match.group(1).replace(",", ""))


def fetch_feed_html(url: str, timeout: int = 30) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def fetch_complete_venue_snapshot(
    venue: str,
    group: str = "",
    *,
    initial_show: int = DEFAULT_SHOW,
    fetcher: Callable[[str], str] = fetch_feed_html,
    max_attempts: int = MAX_VENUE_FETCH_ATTEMPTS,
) -> tuple[str, str, int | None, int]:
    show = max(1, initial_show)
    last_paper_count = -1

    for _ in range(max_attempts):
        source_url = build_venue_url(venue, group=group, show=show)
        html_text = fetcher(source_url)
        papers = parse_feed_html(html_text)
        paper_count = len(papers)
        total_papers = extract_total_papers(html_text)

        if total_papers is None or paper_count >= total_papers:
            return html_text, source_url, total_papers, show

        next_show = max(show * 2, total_papers)
        if next_show <= show or paper_count <= last_paper_count:
            return html_text, source_url, total_papers, show

        last_paper_count = paper_count
        show = next_show

    return html_text, source_url, total_papers, show


class PapersCoolHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.papers: List[Paper] = []
        self.current_paper: Paper | None = None
        self.current_depth = 0
        self.in_title_header = False
        self.capture_title_text = False
        self.title_chunks: List[str] = []
        self.in_authors_block = False
        self.capture_author_text = False
        self.author_chunks: List[str] = []
        self.in_subjects_block = False
        self.capture_subject_text = False
        self.subject_chunks: List[str] = []
        self.current_subject_href = ""
        self.in_summary_block = False
        self.summary_chunks: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple[str, str | None]]) -> None:
        attr_map = self._attr_map(attrs)
        classes = set(attr_map.get("class", "").split())

        if tag == "div" and {"panel", "paper"}.issubset(classes):
            paper_id = attr_map.get("id", "").strip()
            self.current_paper = Paper(
                paper_id=paper_id,
                title="",
                abs_url="",
                pdf_url="",
                detail_url="",
            )
            self.current_depth = 1
            self.in_title_header = False
            self.capture_title_text = False
            self.title_chunks = []
            self.in_authors_block = False
            self.capture_author_text = False
            self.author_chunks = []
            self.in_subjects_block = False
            self.capture_subject_text = False
            self.subject_chunks = []
            self.current_subject_href = ""
            self.in_summary_block = False
            self.summary_chunks = []
            return

        if self.current_paper is None:
            return

        if tag == "div":
            self.current_depth += 1
            return

        if tag == "h2" and "title" in classes:
            self.in_title_header = True
            return

        if tag == "p" and "authors" in classes:
            self.in_authors_block = True
            return

        if tag == "p" and "summary" in classes:
            self.in_summary_block = True
            self.summary_chunks = []
            return

        if tag == "p" and "subjects" in classes:
            self.in_subjects_block = True
            return

        if tag == "a" and self.in_authors_block and "author" in classes:
            self.capture_author_text = True
            self.author_chunks = []
            return

        if tag == "a" and self.in_subjects_block:
            self.capture_subject_text = True
            self.subject_chunks = []
            self.current_subject_href = attr_map.get("href", "")
            return

        if tag != "a" or not self.in_title_header:
            return

        href = attr_map.get("href", "")
        if href.startswith("https://arxiv.org/abs/") and not self.current_paper.abs_url:
            self.current_paper.abs_url = href
            self.current_paper.pdf_url = arxiv_abs_to_pdf(href)
            return

        if "title-pdf" in classes and not self.current_paper.pdf_url:
            pdf_url = attr_map.get("data", "") or href
            if pdf_url:
                self.current_paper.pdf_url = urljoin(PAPERS_COOL_ROOT, pdf_url)
            return

        if "title-link" in classes:
            self.current_paper.detail_url = urljoin(PAPERS_COOL_ROOT, href)
            self.capture_title_text = True
            self.title_chunks = []

    def handle_endtag(self, tag: str) -> None:
        if self.current_paper is None:
            return

        if tag == "a" and self.capture_title_text:
            normalized_title = normalize_spaces("".join(self.title_chunks))
            self.current_paper.title = normalized_title
            self.capture_title_text = False
            self.title_chunks = []
            return

        if tag == "a" and self.capture_author_text:
            author_name = normalize_spaces("".join(self.author_chunks))
            if author_name:
                self.current_paper.authors.append(author_name)
            self.capture_author_text = False
            self.author_chunks = []
            return

        if tag == "a" and self.capture_subject_text:
            subject_name = normalize_subject_label("".join(self.subject_chunks), self.current_subject_href)
            if subject_name:
                self.current_paper.subjects.append(subject_name)
            self.capture_subject_text = False
            self.subject_chunks = []
            self.current_subject_href = ""
            return

        if tag == "h2" and self.in_title_header:
            self.in_title_header = False
            return

        if tag == "p" and self.in_authors_block:
            self.in_authors_block = False
            return

        if tag == "p" and self.in_subjects_block:
            self.in_subjects_block = False
            return

        if tag == "p" and self.in_summary_block:
            self.current_paper.abstract = normalize_spaces("".join(self.summary_chunks))
            self.in_summary_block = False
            self.summary_chunks = []
            return

        if tag == "div":
            self.current_depth -= 1
            if self.current_depth == 0:
                if self.current_paper.title and (
                    self.current_paper.abs_url or self.current_paper.pdf_url or self.current_paper.detail_url
                ):
                    self.papers.append(self.current_paper)
                self.current_paper = None

    def handle_data(self, data: str) -> None:
        if self.capture_title_text:
            self.title_chunks.append(data)
            return
        if self.capture_author_text:
            self.author_chunks.append(data)
            return
        if self.capture_subject_text:
            self.subject_chunks.append(data)
            return
        if self.in_summary_block:
            self.summary_chunks.append(data)

    @staticmethod
    def _attr_map(attrs: List[tuple[str, str | None]]) -> Dict[str, str]:
        return {key: value or "" for key, value in attrs}


class HFDailyPropsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.raw_props = ""

    def handle_starttag(self, tag: str, attrs: List[tuple[str, str | None]]) -> None:
        if tag != "div" or self.raw_props:
            return
        attr_map = {key: value or "" for key, value in attrs}
        if attr_map.get("data-target") == "DailyPapers":
            self.raw_props = attr_map.get("data-props", "")


def parse_feed_html(html_text: str) -> List[Paper]:
    parser = PapersCoolHTMLParser()
    parser.feed(html_text)
    parser.close()
    return parser.papers


def parse_hf_daily_html(html_text: str, report_date: str) -> List[HFDailyPaper]:
    props = extract_hf_daily_props(html_text)
    records = props.get("dailyPapers", [])
    papers: List[HFDailyPaper] = []
    for item in records:
        paper_payload = item.get("paper", item)
        paper_id = normalize_spaces(str(paper_payload.get("id", "")))
        title = normalize_spaces(paper_payload.get("title", ""))
        if not paper_id or not title:
            continue
        papers.append(
            HFDailyPaper(
                report_date=report_date,
                paper_id=paper_id,
                title=title,
                authors=extract_hf_authors(paper_payload.get("authors", [])),
                abstract=normalize_spaces(paper_payload.get("summary", "") or paper_payload.get("abstract", "")),
                hf_url=urljoin(HUGGING_FACE_ROOT, f"/papers/{paper_id}"),
                arxiv_url=build_hf_arxiv_abs_url(paper_id),
                arxiv_pdf_url=build_hf_arxiv_pdf_url(paper_id),
                github_url=extract_first_string(
                    item,
                    paper_payload,
                    keys=("githubUrl", "github_url", "repoUrl", "repositoryUrl"),
                ),
                submitted_by=extract_submitted_by(item, paper_payload),
                submitted_at=normalize_spaces(
                    extract_first_string(item, paper_payload, keys=("submittedOnDailyAt", "submitted_at"))
                ),
                upvotes=extract_first_int(item, paper_payload, keys=("upvotes", "numUpvotes", "paperUpvotes", "votes")),
                comments=extract_first_int(
                    item,
                    paper_payload,
                    keys=("comments", "numComments", "commentCount", "discussionCount"),
                ),
            )
        )
    return papers


def parse_github_trending_html(html_text: str, snapshot_date: str) -> List[TrendingRepo]:
    repos: List[TrendingRepo] = []
    for article_html in TRENDING_ARTICLE_PATTERN.findall(html_text):
        repo_match = re.search(r'<h2[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', article_html, re.S)
        if not repo_match:
            continue

        repo_path = normalize_spaces(repo_match.group(1))
        full_name = normalize_repo_name(strip_html(repo_match.group(2)))
        if not repo_path or not full_name or "/" not in full_name:
            continue

        owner, name = full_name.split("/", 1)
        description_match = re.search(r'<p(?:\s[^>]*)?>(.*?)</p>', article_html, re.S)
        language_match = re.search(r'itemprop="programmingLanguage"[^>]*>(.*?)</span>', article_html, re.S)
        weekly_match = re.search(r'([\d,]+)\s+stars?\s+this\s+week', strip_html(article_html), re.I)
        stars = extract_count_from_path(article_html, f"{repo_path}/stargazers")
        forks = extract_count_from_path(article_html, f"{repo_path}/forks")
        built_by = re.findall(r'<img[^>]*alt="@([^"]+)"', article_html)

        repos.append(
            TrendingRepo(
                snapshot_date=snapshot_date,
                repo_id=full_name.lower(),
                owner=owner,
                name=name,
                full_name=full_name,
                repo_url=urljoin(GITHUB_ROOT, repo_path),
                description=normalize_spaces(strip_html(description_match.group(1))) if description_match else "",
                language=normalize_spaces(strip_html(language_match.group(1))) if language_match else "",
                stars=stars,
                forks=forks,
                stars_this_week=parse_count(weekly_match.group(1)) if weekly_match else None,
                built_by=[normalize_spaces(item) for item in built_by if normalize_spaces(item)],
            )
        )
    return repos


def extract_hf_daily_props(html_text: str) -> dict:
    parser = HFDailyPropsParser()
    parser.feed(html_text)
    parser.close()
    if not parser.raw_props:
        return {}
    return json.loads(unescape(parser.raw_props))


def extract_hf_authors(authors_payload: list) -> List[str]:
    authors: List[str] = []
    for author in authors_payload:
        if isinstance(author, dict):
            name = normalize_spaces(author.get("name", ""))
            if name:
                authors.append(name)
        elif isinstance(author, str):
            name = normalize_spaces(author)
            if name:
                authors.append(name)
    return authors


def build_hf_arxiv_abs_url(paper_id: str) -> str:
    return f"https://arxiv.org/abs/{paper_id}" if ARXIV_ID_PATTERN.fullmatch(paper_id) else ""


def build_hf_arxiv_pdf_url(paper_id: str) -> str:
    return f"https://arxiv.org/pdf/{paper_id}" if ARXIV_ID_PATTERN.fullmatch(paper_id) else ""


def extract_first_string(*payloads: dict, keys: tuple[str, ...]) -> str:
    for payload in payloads:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return normalize_spaces(value)
    return ""


def extract_first_int(*payloads: dict, keys: tuple[str, ...]) -> int | None:
    for payload in payloads:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, bool):
                continue
            if isinstance(value, int):
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)
    return None


def extract_submitted_by(item: dict, paper_payload: dict) -> str:
    for payload in (item, paper_payload):
        submitted = payload.get("submittedOnDailyBy")
        if isinstance(submitted, dict):
            name = normalize_spaces(
                submitted.get("fullname", "") or submitted.get("user", "") or submitted.get("name", "")
            )
            if name:
                return name
    return ""


def normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def strip_html(text: str) -> str:
    return normalize_spaces(unescape(re.sub(r"<[^>]+>", " ", text)))


def normalize_repo_name(text: str) -> str:
    return re.sub(r"\s*/\s*", "/", normalize_spaces(text))


def parse_count(raw_value: str) -> int | None:
    normalized = raw_value.replace(",", "").strip()
    return int(normalized) if normalized.isdigit() else None


def extract_count_from_path(fragment: str, href: str) -> int | None:
    pattern = re.compile(rf'<a[^>]*href="{re.escape(href)}"[^>]*>(.*?)</a>', re.S)
    match = pattern.search(fragment)
    if not match:
        return None
    text = strip_html(match.group(1))
    count_match = re.search(r"([\d,]+)", text)
    return parse_count(count_match.group(1)) if count_match else None


def normalize_subject_label(text: str, href: str = "") -> str:
    normalized = normalize_spaces(text)
    if href:
        parsed = urlparse(href)
        group_values = parse_qs(parsed.query).get("group", [])
        if group_values:
            return normalize_spaces(group_values[0])
    if " - " in normalized:
        return normalized.split(" - ", 1)[1].strip()
    if re.fullmatch(r"[A-Za-z0-9_-]+\.\d{4}", normalized):
        return "Accept"
    return normalized
