import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from scripts.generate_daily_report import resolve_report_date


class GenerateDailyReportTest(unittest.TestCase):
    def test_resolve_previous_business_day_skips_weekend(self) -> None:
        monday = datetime(2026, 3, 9, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        resolved = resolve_report_date("previous_business_day", "Asia/Shanghai", now=monday)
        self.assertEqual("2026-03-06", resolved)

    def test_resolve_previous_business_day_on_weekday_uses_previous_day(self) -> None:
        tuesday = datetime(2026, 3, 10, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        resolved = resolve_report_date("previous_business_day", "Asia/Shanghai", now=tuesday)
        self.assertEqual("2026-03-09", resolved)


if __name__ == "__main__":
    unittest.main()
