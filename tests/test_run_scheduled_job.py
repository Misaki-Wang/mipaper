import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from scripts.run_scheduled_job import build_classifier_args, validate_cool_daily_reports


class RunScheduledJobTest(unittest.TestCase):
    def test_build_classifier_args_enables_rule_fallback_by_default(self) -> None:
        with mock.patch.dict(os.environ, {"COOL_PAPER_DAILY_CLASSIFIER": "codex"}, clear=False):
            args = build_classifier_args("COOL_PAPER_DAILY")

        self.assertIn("--allow-rule-fallback", args)

    def test_build_classifier_args_respects_disabled_rule_fallback(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "COOL_PAPER_DAILY_CLASSIFIER": "codex",
                "COOL_PAPER_DAILY_ALLOW_RULE_FALLBACK": "false",
            },
            clear=False,
        ):
            args = build_classifier_args("COOL_PAPER_DAILY")

        self.assertNotIn("--allow-rule-fallback", args)

    def test_validate_cool_daily_reports_accepts_non_empty_payloads(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            report_date = "2026-03-19"
            for category, count in (("cs.AI", 3), ("cs.CL", 1), ("cs.CV", 2)):
                report_dir = base_dir / report_date
                report_dir.mkdir(parents=True, exist_ok=True)
                report_path = report_dir / f"{category}-{report_date}.json"
                payload = {"papers": [{"paper_id": f"{category}-{index}"} for index in range(count)]}
                report_path.write_text(json.dumps(payload), encoding="utf-8")

            validate_cool_daily_reports(report_date, ["cs.AI", "cs.CL", "cs.CV"], base_dir=base_dir)

    def test_validate_cool_daily_reports_rejects_empty_payload(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            report_date = "2026-03-19"
            payloads = {
                "cs.AI": {"papers": [{"paper_id": "ok"}]},
                "cs.CL": {"papers": []},
                "cs.CV": {"papers": [{"paper_id": "ok"}]},
            }

            for category, payload in payloads.items():
                report_dir = base_dir / report_date
                report_dir.mkdir(parents=True, exist_ok=True)
                report_path = report_dir / f"{category}-{report_date}.json"
                report_path.write_text(json.dumps(payload), encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "Refusing to publish empty Cool Daily report"):
                validate_cool_daily_reports(report_date, ["cs.AI", "cs.CL", "cs.CV"], base_dir=base_dir)


if __name__ == "__main__":
    unittest.main()
