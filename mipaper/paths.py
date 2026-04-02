from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

REPORTS_DIR = ROOT_DIR / "reports"
DAILY_REPORTS_DIR = REPORTS_DIR / "daily"
CONFERENCE_REPORTS_DIR = REPORTS_DIR / "conference"
HF_DAILY_REPORTS_DIR = REPORTS_DIR / "hf-daily"
TRENDING_REPORTS_DIR = REPORTS_DIR / "trending"
MAGAZINE_REPORTS_DIR = REPORTS_DIR / "magazine"
STATE_DIR = ROOT_DIR / "state"
SCHEDULE_STATE_PATH = STATE_DIR / "scheduled_jobs.json"

SAMPLES_DIR = ROOT_DIR / "samples"
DAILY_SAMPLES_DIR = SAMPLES_DIR / "daily"
CONFERENCE_SAMPLES_DIR = SAMPLES_DIR / "conference"
HF_DAILY_SAMPLES_DIR = SAMPLES_DIR / "hf-daily"
TRENDING_SAMPLES_DIR = SAMPLES_DIR / "trending"
MAGAZINE_SAMPLES_DIR = SAMPLES_DIR / "magazine"

SITE_DIR = ROOT_DIR / "site"
SITE_DATA_DIR = SITE_DIR / "data"
DAILY_SITE_DATA_DIR = SITE_DATA_DIR / "daily"
CONFERENCE_SITE_DATA_DIR = SITE_DATA_DIR / "conference"
HF_DAILY_SITE_DATA_DIR = SITE_DATA_DIR / "hf-daily"
TRENDING_SITE_DATA_DIR = SITE_DATA_DIR / "trending"
MAGAZINE_SITE_DATA_DIR = SITE_DATA_DIR / "magazine"


def daily_report_dir(report_date: str) -> Path:
    return DAILY_REPORTS_DIR / report_date


def hf_daily_report_dir(report_date: str) -> Path:
    return HF_DAILY_REPORTS_DIR / report_date


def trending_report_dir(snapshot_date: str) -> Path:
    return TRENDING_REPORTS_DIR / snapshot_date


def magazine_report_dir(issue_slug: str) -> Path:
    return MAGAZINE_REPORTS_DIR / issue_slug


def conference_report_dir(venue: str) -> Path:
    return CONFERENCE_REPORTS_DIR / venue
