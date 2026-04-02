#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from mipaper.notifiers import EmailNotifier
from mipaper.paths import SCHEDULE_STATE_PATH
from mipaper.paths import DAILY_REPORTS_DIR
from mipaper.scheduler import (
    cool_daily_backfill_dates,
    hf_daily_backfill_dates,
    load_schedule_state,
    magazine_backfill_dates,
    local_now,
    save_schedule_state,
    summarize_date_window,
    trending_backfill_dates,
)

GENERATED_PATHS = [
    "reports/daily",
    "reports/hf-daily",
    "reports/trending",
    "reports/magazine",
    "site/data",
]

JOB_PAGE_CONFIG = {
    "cool_daily": {
        "label": "Cool Daily",
        "path": "cool-daily.html",
    },
    "hf_daily": {
        "label": "HF Daily",
        "path": "hf-daily.html",
    },
    "trending": {
        "label": "Trending",
        "path": "trending.html",
    },
    "magazine": {
        "label": "Magazine",
        "path": "magazine.html",
    },
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run scheduled Cool Daily / HF Daily / Trending / Magazine jobs.")
    parser.add_argument(
        "--job",
        choices=("cool_daily", "hf_daily", "trending", "magazine"),
        required=True,
        help="scheduled job kind",
    )
    parser.add_argument("--timezone", default=os.environ.get("COOL_PAPER_TIMEZONE", "Asia/Shanghai"))
    parser.add_argument("--skip-push", action="store_true", help="generate reports but skip git commit/push")
    parser.add_argument("--git-remote", default=os.environ.get("COOL_PAPER_GIT_REMOTE", "origin"))
    parser.add_argument("--git-branch", default=os.environ.get("COOL_PAPER_GIT_BRANCH", ""))
    parser.add_argument(
        "--state-path",
        default=os.environ.get("COOL_PAPER_STATE_PATH", str(SCHEDULE_STATE_PATH.relative_to(ROOT_DIR))),
        help="path to the persistent schedule state file",
    )
    parser.add_argument(
        "--start-date",
        default=os.environ.get("COOL_PAPER_SCHEDULE_START_DATE", "2026-03-02"),
        help="earliest business date to backfill",
    )
    parser.add_argument(
        "--now",
        help="optional ISO datetime override for tests, for example 2026-03-10T21:00:00+08:00",
    )
    return parser.parse_args()


def run_command(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT_DIR, check=True)


def ensure_llm_available(binary_name: str) -> None:
    if shutil.which(binary_name):
        return
    raise RuntimeError(f"Scheduled classification requested, but `{binary_name}` is not available in PATH.")


def env_flag(name: str, default: bool) -> bool:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() not in {"0", "false", "no", "off"}


def build_classifier_args(prefix: str) -> list[str]:
    classifier = os.environ.get(f"{prefix}_CLASSIFIER", "codex")
    args = ["--classifier", classifier]
    if classifier == "rule":
        return args

    if classifier == "codex":
        ensure_llm_available("codex")
    elif classifier == "claude":
        ensure_llm_available("claude")

    model = os.environ.get("COOL_PAPER_CODEX_MODEL", "").strip()
    timeout = os.environ.get("COOL_PAPER_CODEX_TIMEOUT_SECONDS", "").strip()
    claude_model = os.environ.get("COOL_PAPER_CLAUDE_MODEL", "").strip()
    fallback = os.environ.get(f"{prefix}_LLM_FALLBACK", "claude").strip()

    if model:
        args.extend(["--codex-model", model])
    if timeout:
        args.extend(["--codex-timeout-seconds", timeout])
    if claude_model:
        args.extend(["--claude-model", claude_model])
    if classifier == "codex" and fallback:
        args.extend(["--llm-fallback", fallback])
    allow_rule_fallback = env_flag(
        f"{prefix}_ALLOW_RULE_FALLBACK",
        env_flag("COOL_PAPER_ALLOW_RULE_FALLBACK", True),
    )
    if allow_rule_fallback:
        args.append("--allow-rule-fallback")
    return args


def parse_now(raw_value: str | None, timezone_name: str) -> datetime | None:
    if not raw_value:
        return None
    parsed = datetime.fromisoformat(raw_value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=ZoneInfo(timezone_name))
    return parsed.astimezone(ZoneInfo(timezone_name))


def state_key(job: str) -> str:
    return f"{job}_last_success_date"


def normalize_job_name(job: str) -> str:
    if job == "weekly":
        return "magazine"
    return job


def daily_report_json_path(report_date: str, category: str, base_dir: Path = DAILY_REPORTS_DIR) -> Path:
    return base_dir / report_date / f"{category}-{report_date}.json"


def load_paper_count(path: Path) -> int:
    payload = json.loads(path.read_text(encoding="utf-8"))
    papers = payload.get("papers", [])
    if not isinstance(papers, list):
        raise RuntimeError(f"Invalid report payload at {path}: `papers` is not a list.")
    return len(papers)


def validate_cool_daily_reports(report_date: str, categories: list[str], base_dir: Path = DAILY_REPORTS_DIR) -> None:
    empty_categories: list[str] = []

    for category in categories:
        report_path = daily_report_json_path(report_date, category, base_dir=base_dir)
        if not report_path.exists():
            raise RuntimeError(f"Expected generated report missing: {report_path}")
        paper_count = load_paper_count(report_path)
        if paper_count == 0:
            empty_categories.append(category)

    if empty_categories:
        category_summary = ", ".join(empty_categories)
        raise RuntimeError(
            f"Refusing to publish empty Cool Daily report for {report_date}: {category_summary}. "
            "The source feed is likely not ready yet; rerun the job later."
        )


def run_cool_daily_job(timezone_name: str, start_date: str, state: dict, now: datetime | None = None) -> list[str]:
    report_dates = cool_daily_backfill_dates(
        start_date=start_date,
        timezone_name=timezone_name,
        last_success_date=state.get(state_key("cool_daily")),
        now=now,
    )
    if not report_dates:
        print(f"No Cool Daily backfill needed in timezone {timezone_name}.")
        return []

    categories = os.environ.get("COOL_PAPER_CATEGORIES", "cs.AI cs.CL cs.CV").split()
    classifier_args = build_classifier_args("COOL_PAPER_DAILY")
    for report_date in report_dates:
        for category in categories:
            command = [
                "python3",
                "scripts/generate_daily_report.py",
                "--category",
                category,
                "--date",
                report_date,
                "--timezone",
                timezone_name,
                "--output-dir",
                "reports/daily",
                "--notify",
                "none",
                *classifier_args,
            ]
            run_command(command)
        validate_cool_daily_reports(report_date, categories)
    return report_dates


def run_hf_daily_job(timezone_name: str, start_date: str, state: dict, now: datetime | None = None) -> list[str]:
    classifier_args = build_classifier_args("COOL_PAPER_HF")
    report_dates = hf_daily_backfill_dates(
        start_date=start_date,
        timezone_name=timezone_name,
        last_success_date=state.get(state_key("hf_daily")),
        now=now,
    )
    if not report_dates:
        print(f"No HF Daily backfill needed in timezone {timezone_name}.")
        return []

    for report_date in report_dates:
        command = [
            "python3",
            "scripts/generate_hf_daily_report.py",
            "--date",
            report_date,
            "--timezone",
            timezone_name,
            "--output-dir",
            "reports/hf-daily",
            *classifier_args,
        ]
        run_command(command)
    return report_dates


def run_trending_job(timezone_name: str, start_date: str, state: dict, now: datetime | None = None) -> list[str]:
    report_dates = trending_backfill_dates(
        start_date=start_date,
        timezone_name=timezone_name,
        last_success_date=state.get(state_key("trending")),
        now=now,
    )
    if not report_dates:
        print(f"No Trending snapshot needed in timezone {timezone_name}.")
        return []

    for report_date in report_dates:
        command = [
            "python3",
            "scripts/generate_trending_report.py",
            "--date",
            report_date,
            "--timezone",
            timezone_name,
            "--since",
            os.environ.get("COOL_PAPER_TRENDING_WINDOW", "weekly"),
            "--output-dir",
            "reports/trending",
        ]
        run_command(command)
    return report_dates


def run_magazine_job(timezone_name: str, start_date: str, state: dict, now: datetime | None = None) -> list[str]:
    report_dates = magazine_backfill_dates(
        start_date=start_date,
        timezone_name=timezone_name,
        last_success_date=state.get(state_key("magazine")) or state.get("weekly_last_success_date"),
        now=now,
    )
    if not report_dates:
        print(f"No Magazine sync needed in timezone {timezone_name}.")
        return []

    for report_date in report_dates:
        command = [
            "python3",
            "scripts/generate_magazine_report.py",
            "--date",
            report_date,
            "--timezone",
            timezone_name,
            "--output-dir",
            "reports/magazine",
        ]
        run_command(command)
    return report_dates


def build_site_data() -> None:
    run_command(["python3", "scripts/build_site_data.py"])


def should_send_email_notification() -> bool:
    return os.getenv("COOL_PAPER_NOTIFY", "none").strip().lower() == "email"


def resolve_public_page_url(job: str) -> str:
    page_path = JOB_PAGE_CONFIG[job]["path"]
    site_url = os.getenv("COOL_PAPER_SITE_URL", "").strip()
    if not site_url:
        return page_path
    return f"{site_url.rstrip('/')}/{page_path}"


def build_notification_subject(job: str, date_window: list[str]) -> str:
    job_label = JOB_PAGE_CONFIG[job]["label"]
    return f"[MiPaper] {job_label} updated {summarize_date_window(date_window)}"


def build_notification_body(job: str, date_window: list[str], timezone_name: str, now: datetime | None = None) -> str:
    job_label = JOB_PAGE_CONFIG[job]["label"]
    page_url = resolve_public_page_url(job)
    updated_at = local_now(timezone_name, now).isoformat()
    lines = [
        "MiPaper published updated page content.",
        "",
        f"Job: {job_label}",
        f"Updated at: {updated_at}",
        f"Date window: {summarize_date_window(date_window)}",
        f"Page: {page_url}",
    ]

    if job == "cool_daily":
        categories = os.environ.get("COOL_PAPER_CATEGORIES", "cs.AI cs.CL cs.CV").split()
        lines.append(f"Categories: {', '.join(categories)}")
    elif job == "trending":
        lines.append(f"Window: {os.environ.get('COOL_PAPER_TRENDING_WINDOW', 'weekly')}")
    elif job == "magazine":
        lines.append("Source: ruanyf/weekly")

    lines.extend(
        [
            "",
            "Business dates:",
            *[f"- {report_date}" for report_date in date_window],
        ]
    )
    return "\n".join(lines)


def send_update_notification(job: str, date_window: list[str], timezone_name: str, now: datetime | None = None) -> None:
    if not should_send_email_notification():
        print("Notification: skipped")
        return

    subject = build_notification_subject(job, date_window)
    body = build_notification_body(job, date_window, timezone_name, now=now)
    EmailNotifier().send(subject=subject, body=body)
    print("Notification: email sent")


def run_command_with_retries(command: list[str], retries: int = 3) -> None:
    attempts = max(1, retries)
    for attempt in range(1, attempts + 1):
        try:
            run_command(command)
            return
        except subprocess.CalledProcessError as exc:
            if attempt >= attempts:
                raise
            print(
                f"Retrying after exit code {exc.returncode} "
                f"({attempt}/{attempts - 1}): {' '.join(command)}"
            )
            time.sleep(attempt * 5)


def commit_and_push(job: str, date_window: list[str], remote: str, branch: str) -> None:
    resolved_branch = branch or subprocess.check_output(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=ROOT_DIR,
        text=True,
    ).strip()

    run_command(["git", "add", "-A", "--", *GENERATED_PATHS])
    diff = subprocess.run(
        ["git", "diff", "--cached", "--quiet", "--exit-code"],
        cwd=ROOT_DIR,
        check=False,
    )
    if diff.returncode == 0:
        print("No generated changes to commit.")
        return

    message = f"chore(auto): update {job} {summarize_date_window(date_window)}"
    run_command(["git", "commit", "-m", message])
    run_command_with_retries(["git", "push", remote, resolved_branch], retries=3)


def main() -> int:
    load_env_file(ROOT_DIR / ".env")
    load_env_file(ROOT_DIR / ".dev.vars")
    args = parse_args()
    normalized_job = normalize_job_name(args.job)
    state_path = ROOT_DIR / args.state_path
    state = load_schedule_state(state_path)
    now = parse_now(args.now, args.timezone)

    if args.job == "cool_daily":
        dates = run_cool_daily_job(args.timezone, args.start_date, state, now)
    elif args.job == "hf_daily":
        dates = run_hf_daily_job(args.timezone, args.start_date, state, now)
    elif args.job == "trending":
        dates = run_trending_job(args.timezone, args.start_date, state, now)
    else:
        dates = run_magazine_job(args.timezone, args.start_date, state, now)

    if not dates:
        return 0

    build_site_data()
    if not args.skip_push:
        commit_and_push(args.job, dates, args.git_remote, args.git_branch)
    send_update_notification(args.job, dates, args.timezone, now=now)
    state[state_key(normalized_job)] = dates[-1]
    state[f"{normalized_job}_updated_at"] = local_now(args.timezone, now).isoformat()
    save_schedule_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
