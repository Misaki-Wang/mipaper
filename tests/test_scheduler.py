import unittest
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from cool_paper.scheduler import (
    cool_daily_backfill_dates,
    current_week_business_days,
    hf_daily_backfill_dates,
    is_weekend,
    load_schedule_state,
    save_schedule_state,
    summarize_date_window,
    today_iso,
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
        now = datetime.fromisoformat("2026-03-10T11:00:00+08:00")
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
        now = datetime.fromisoformat("2026-03-10T11:00:00+08:00")
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

    def test_schedule_state_round_trip(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "scheduled_jobs.json"
            payload = {"cool_daily_last_success_date": "2026-03-10"}
            save_schedule_state(path, payload)
            self.assertEqual(payload, load_schedule_state(path))


if __name__ == "__main__":
    unittest.main()
