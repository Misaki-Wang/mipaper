import unittest
from datetime import datetime

from cool_paper.scheduler import current_week_business_days, is_weekend, summarize_date_window, today_iso


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


if __name__ == "__main__":
    unittest.main()
