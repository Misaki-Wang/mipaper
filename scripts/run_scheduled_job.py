#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from cool_paper.scheduler import current_week_business_days, is_weekend, summarize_date_window, today_iso

GENERATED_PATHS = [
    "reports/daily",
    "reports/hf-daily",
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
    parser = argparse.ArgumentParser(description="Run scheduled Cool Daily / HF Daily jobs.")
    parser.add_argument("--job", choices=("cool_daily", "hf_daily"), required=True, help="scheduled job kind")
    parser.add_argument("--timezone", default=os.environ.get("COOL_PAPER_TIMEZONE", "Asia/Shanghai"))
    parser.add_argument("--skip-push", action="store_true", help="generate reports but skip git commit/push")
    parser.add_argument("--git-remote", default=os.environ.get("COOL_PAPER_GIT_REMOTE", "origin"))
    parser.add_argument("--git-branch", default=os.environ.get("COOL_PAPER_GIT_BRANCH", ""))
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


def run_cool_daily_job(timezone_name: str) -> list[str]:
    if is_weekend(timezone_name):
        print(f"Skipping Cool Daily scheduled run on weekend in timezone {timezone_name}.")
        return []

    report_date = today_iso(timezone_name)
    categories = os.environ.get("COOL_PAPER_CATEGORIES", "cs.AI cs.CL cs.CV").split()
    codex_args = build_codex_args("COOL_PAPER_DAILY")
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
    return [report_date]


def run_hf_daily_job(timezone_name: str) -> list[str]:
    codex_args = build_codex_args("COOL_PAPER_HF")
    if is_weekend(timezone_name):
        report_dates = current_week_business_days(timezone_name)
    else:
        report_dates = [today_iso(timezone_name)]

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

    if args.job == "cool_daily":
        dates = run_cool_daily_job(args.timezone)
    else:
        dates = run_hf_daily_job(args.timezone)

    if not dates:
        return 0

    build_site_data()
    if not args.skip_push:
        commit_and_push(args.job, dates, args.git_remote, args.git_branch)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
