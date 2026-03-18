from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Paper:
    paper_id: str
    title: str
    abs_url: str
    pdf_url: str
    detail_url: str
    authors: List[str] = field(default_factory=list)
    subjects: List[str] = field(default_factory=list)
    abstract: str = ""
    topic_key: str = ""
    topic_label: str = ""
    matched_terms: List[str] = field(default_factory=list)
    classification_source: str = "rule"
    classification_confidence: Optional[float] = None


@dataclass
class HFDailyPaper:
    report_date: str
    paper_id: str
    title: str
    authors: List[str] = field(default_factory=list)
    abstract: str = ""
    hf_url: str = ""
    arxiv_url: str = ""
    arxiv_pdf_url: str = ""
    papers_cool_url: str = ""
    github_url: str = ""
    submitted_by: str = ""
    submitted_at: str = ""
    upvotes: Optional[int] = None
    comments: Optional[int] = None
    topic_key: str = ""
    topic_label: str = ""
    matched_terms: List[str] = field(default_factory=list)
    classification_source: str = "rule"
    classification_confidence: Optional[float] = None


@dataclass
class TrendingRepo:
    snapshot_date: str
    repo_id: str
    owner: str
    name: str
    full_name: str
    repo_url: str
    description: str = ""
    language: str = ""
    stars: Optional[int] = None
    forks: Optional[int] = None
    stars_this_week: Optional[int] = None
    built_by: List[str] = field(default_factory=list)
