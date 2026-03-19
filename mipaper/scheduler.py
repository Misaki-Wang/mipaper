from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


def local_now(timezone_name: str, now: datetime | None = None) -> datetime:
    current = now or datetime.now(ZoneInfo(timezone_name))
    if current.tzinfo is None:
        return current.replace(tzinfo=ZoneInfo(timezone_name))
    return current.astimezone(ZoneInfo(timezone_name))


def is_weekend(timezone_name: str, now: datetime | None = None) -> bool:
    return local_now(timezone_name, now).weekday() >= 5


def today_iso(timezone_name: str, now: datetime | None = None) -> str:
    return local_now(timezone_name, now).date().isoformat()


def current_week_business_days(timezone_name: str, now: datetime | None = None) -> list[str]:
    current_date = local_now(timezone_name, now).date()
    monday = current_date - timedelta(days=current_date.weekday())
    return [(monday + timedelta(days=offset)).isoformat() for offset in range(5)]


def parse_iso_date(raw_value: str) -> date:
    return date.fromisoformat(raw_value)


def iso_date_range(start_date: date, end_date: date) -> list[str]:
    if end_date < start_date:
        return []
    span = (end_date - start_date).days
    return [(start_date + timedelta(days=offset)).isoformat() for offset in range(span + 1)]


def business_days_between(start_date: date, end_date: date) -> list[str]:
    return [day for day in iso_date_range(start_date, end_date) if parse_iso_date(day).weekday() < 5]


def previous_business_day(current_date: date) -> date:
    candidate = current_date - timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate -= timedelta(days=1)
    return candidate


def most_recent_business_day(timezone_name: str, now: datetime | None = None) -> date:
    current_date = local_now(timezone_name, now).date()
    if current_date.weekday() < 5:
        return current_date
    return previous_business_day(current_date)


def next_business_day(current_date: date) -> date:
    candidate = current_date + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def resolve_start_date(start_date: str, last_success_date: str | None) -> date:
    anchor_date = parse_iso_date(start_date)
    if not last_success_date:
        return anchor_date
    return max(anchor_date, next_business_day(parse_iso_date(last_success_date)))


def cool_daily_backfill_dates(start_date: str, timezone_name: str, last_success_date: str | None = None, now: datetime | None = None) -> list[str]:
    window_start = resolve_start_date(start_date, last_success_date)
    window_end = most_recent_business_day(timezone_name, now)
    return business_days_between(window_start, window_end)


def hf_daily_backfill_dates(start_date: str, timezone_name: str, last_success_date: str | None = None, now: datetime | None = None) -> list[str]:
    window_start = resolve_start_date(start_date, last_success_date)
    window_end = most_recent_business_day(timezone_name, now)
    dates = business_days_between(window_start, window_end)
    if is_weekend(timezone_name, now):
        dates = sorted(set(dates + current_week_business_days(timezone_name, now)))
    return dates


def iso_week_key(raw_date: date) -> tuple[int, int]:
    iso_year, iso_week, _ = raw_date.isocalendar()
    return iso_year, iso_week


def trending_backfill_dates(
    start_date: str,
    timezone_name: str,
    last_success_date: str | None = None,
    now: datetime | None = None,
) -> list[str]:
    current_date = local_now(timezone_name, now).date()
    anchor_date = parse_iso_date(start_date)
    if current_date < anchor_date:
        return []
    if last_success_date and iso_week_key(parse_iso_date(last_success_date)) == iso_week_key(current_date):
        return []
    return [current_date.isoformat()]


def load_schedule_state(path: Path) -> dict:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {}
    return payload


def save_schedule_state(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    temp_path = path.with_name(f".{path.name}.tmp")
    temp_path.write_text(serialized, encoding="utf-8")
    temp_path.replace(path)


def summarize_date_window(dates: list[str]) -> str:
    if not dates:
        return "no-dates"
    if len(dates) == 1:
        return dates[0]
    return f"{dates[0]}_to_{dates[-1]}"
