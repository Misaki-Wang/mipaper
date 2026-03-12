#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from mipaper.paths import SCHEDULE_STATE_PATH
from mipaper.scheduler import (
    cool_daily_backfill_dates,
    hf_daily_backfill_dates,
    load_schedule_state,
    local_now,
    save_schedule_state,
    summarize_date_window,
    trending_backfill_dates,
)

GENERATED_PATHS = [
    "reports/daily",
    "reports/hf-daily",
    "reports/trending",
    "site/data",
]


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
    parser = argparse.ArgumentParser(description="Run scheduled Cool Daily / HF Daily / Trending jobs.")
    parser.add_argument("--job", choices=("cool_daily", "hf_daily", "trending"), required=True, help="scheduled job kind")
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
        help="optional ISO datetime override for tests, for example 2026-03-10T11:00:00+08:00",
    )
    return parser.parse_args()


def run_command(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT_DIR, check=True)


def ensure_codex_available() -> None:
    if shutil.which("codex"):
        return
    raise RuntimeError("Scheduled codex classification requested, but `codex` is not available in PATH.")


def build_codex_args(prefix: str) -> list[str]:
    classifier = os.environ.get(f"{prefix}_CLASSIFIER", "codex")
    args = ["--classifier", classifier]
    if classifier != "codex":
        return args
    ensure_codex_available()
    model = os.environ.get("COOL_PAPER_CODEX_MODEL", "").strip()
    timeout = os.environ.get("COOL_PAPER_CODEX_TIMEOUT_SECONDS", "").strip()
    if model:
        args.extend(["--codex-model", model])
    if timeout:
        args.extend(["--codex-timeout-seconds", timeout])
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
    codex_args = build_codex_args("COOL_PAPER_DAILY")
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
                os.environ.get("COOL_PAPER_NOTIFY", "none"),
                *codex_args,
            ]
            run_command(command)
    return report_dates


def run_hf_daily_job(timezone_name: str, start_date: str, state: dict, now: datetime | None = None) -> list[str]:
    codex_args = build_codex_args("COOL_PAPER_HF")
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
            *codex_args,
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


def build_site_data() -> None:
    run_command(["python3", "scripts/build_site_data.py"])


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
    run_command(["git", "push", remote, resolved_branch])


def main() -> int:
    load_env_file(ROOT_DIR / ".env")
    args = parse_args()
    state_path = ROOT_DIR / args.state_path
    state = load_schedule_state(state_path)
    now = parse_now(args.now, args.timezone)

    if args.job == "cool_daily":
        dates = run_cool_daily_job(args.timezone, args.start_date, state, now)
    elif args.job == "hf_daily":
        dates = run_hf_daily_job(args.timezone, args.start_date, state, now)
    else:
        dates = run_trending_job(args.timezone, args.start_date, state, now)

    if not dates:
        return 0

    build_site_data()
    if not args.skip_push:
        commit_and_push(args.job, dates, args.git_remote, args.git_branch)
    state[state_key(args.job)] = dates[-1]
    state[f"{args.job}_updated_at"] = local_now(args.timezone, now).isoformat()
    save_schedule_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
