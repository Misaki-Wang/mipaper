from __future__ import annotations

from datetime import date, datetime, timedelta
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


def summarize_date_window(dates: list[str]) -> str:
    if not dates:
        return "no-dates"
    if len(dates) == 1:
        return dates[0]
    return f"{dates[0]}_to_{dates[-1]}"
