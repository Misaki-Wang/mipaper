from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

REPORTS_DIR = ROOT_DIR / "reports"
DAILY_REPORTS_DIR = REPORTS_DIR / "daily"
CONFERENCE_REPORTS_DIR = REPORTS_DIR / "conference"
HF_DAILY_REPORTS_DIR = REPORTS_DIR / "hf-daily"
DEBUG_REPORTS_DIR = REPORTS_DIR / "debug"
CODEX_TEST_REPORTS_DIR = DEBUG_REPORTS_DIR / "codex-test"

SAMPLES_DIR = ROOT_DIR / "samples"
DAILY_SAMPLES_DIR = SAMPLES_DIR / "daily"
CONFERENCE_SAMPLES_DIR = SAMPLES_DIR / "conference"
HF_DAILY_SAMPLES_DIR = SAMPLES_DIR / "hf-daily"

SITE_DIR = ROOT_DIR / "site"
SITE_DATA_DIR = SITE_DIR / "data"
DAILY_SITE_DATA_DIR = SITE_DATA_DIR / "daily"
CONFERENCE_SITE_DATA_DIR = SITE_DATA_DIR / "conference"
HF_DAILY_SITE_DATA_DIR = SITE_DATA_DIR / "hf-daily"
