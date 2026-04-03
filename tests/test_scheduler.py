import unittest
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from mipaper.scheduler import (
    magazine_backfill_dates,
    cool_daily_backfill_dates,
    current_week_business_days,
    hf_daily_backfill_dates,
    is_weekend,
    iso_week_key,
    load_schedule_state,
    save_schedule_state,
    summarize_date_window,
    today_iso,
    trending_backfill_dates,
)


class SchedulerHelpersTest(unittest.TestCase):
    def test_is_weekend_detects_saturday(self) -> None:
        now = datetime.fromisoformat("2026-03-14T09:00:00+08:00")
        self.assertTrue(is_weekend("Asia/Shanghai", now))

    def test_today_iso_uses_timezone_aware_date(self) -> None:
        now = datetime.fromisoformat("2026-03-10T23:30:00+08:00")
        self.assertEqual("2026-03-10", today_iso("Asia/Shanghai", now))

    def test_current_week_business_days_returns_monday_to_friday(self) -> None:
        now = datetime.fromisoformat("2026-03-15T10:00:00+08:00")
        self.assertEqual(
            ["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"],
            current_week_business_days("Asia/Shanghai", now),
        )

    def test_summarize_date_window_formats_range(self) -> None:
        self.assertEqual("2026-03-10", summarize_date_window(["2026-03-10"]))
        self.assertEqual(
            "2026-03-10_to_2026-03-14",
            summarize_date_window(["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14"]),
        )

    def test_cool_daily_backfill_dates_uses_start_date_and_skips_weekend(self) -> None:
        now = datetime.fromisoformat("2026-03-10T21:00:00+08:00")
        self.assertEqual(
            [
                "2026-03-02",
                "2026-03-03",
                "2026-03-04",
                "2026-03-05",
                "2026-03-06",
                "2026-03-09",
                "2026-03-10",
            ],
            cool_daily_backfill_dates("2026-03-02", "Asia/Shanghai", now=now),
        )

    def test_cool_daily_backfill_dates_resume_after_last_success(self) -> None:
        now = datetime.fromisoformat("2026-03-10T21:00:00+08:00")
        self.assertEqual(
            ["2026-03-09", "2026-03-10"],
            cool_daily_backfill_dates("2026-03-02", "Asia/Shanghai", last_success_date="2026-03-06", now=now),
        )

    def test_hf_daily_backfill_dates_refresh_current_week_on_weekend(self) -> None:
        now = datetime.fromisoformat("2026-03-14T23:00:00+08:00")
        self.assertEqual(
            ["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"],
            hf_daily_backfill_dates("2026-03-02", "Asia/Shanghai", last_success_date="2026-03-13", now=now),
        )

    def test_trending_backfill_dates_runs_once_per_iso_week(self) -> None:
        now = datetime.fromisoformat("2026-03-16T12:00:00+08:00")
        self.assertEqual(["2026-03-16"], trending_backfill_dates("2026-03-02", "Asia/Shanghai", now=now))
        self.assertEqual(
            [],
            trending_backfill_dates("2026-03-02", "Asia/Shanghai", last_success_date="2026-03-16", now=now),
        )

    def test_magazine_backfill_dates_waits_until_friday_noon(self) -> None:
        thursday = datetime.fromisoformat("2026-04-02T12:00:00+08:00")
        friday_morning = datetime.fromisoformat("2026-04-03T11:59:00+08:00")
        friday_noon = datetime.fromisoformat("2026-04-03T12:00:00+08:00")
        self.assertEqual([], magazine_backfill_dates("2026-03-02", "Asia/Shanghai", now=thursday))
        self.assertEqual([], magazine_backfill_dates("2026-03-02", "Asia/Shanghai", now=friday_morning))
        self.assertEqual(["2026-04-03"], magazine_backfill_dates("2026-03-02", "Asia/Shanghai", now=friday_noon))

    def test_magazine_backfill_dates_runs_once_per_iso_week(self) -> None:
        saturday = datetime.fromisoformat("2026-04-04T09:00:00+08:00")
        self.assertEqual(
            [],
            magazine_backfill_dates("2026-03-02", "Asia/Shanghai", last_success_date="2026-04-03", now=saturday),
        )

    def test_iso_week_key_groups_same_week(self) -> None:
        self.assertEqual(iso_week_key(datetime.fromisoformat("2026-03-16").date()), iso_week_key(datetime.fromisoformat("2026-03-20").date()))

    def test_schedule_state_round_trip(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "state" / "scheduled_jobs.json"
            payload = {"cool_daily_last_success_date": "2026-03-10"}
            save_schedule_state(path, payload)
            self.assertEqual(payload, load_schedule_state(path))
            self.assertTrue(path.read_text(encoding="utf-8").endswith("\n"))

    def test_load_schedule_state_ignores_invalid_json(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "state" / "scheduled_jobs.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{invalid", encoding="utf-8")

            self.assertEqual({}, load_schedule_state(path))


if __name__ == "__main__":
    unittest.main()
