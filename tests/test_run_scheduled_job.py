import json
import os
import unittest
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import scripts.run_scheduled_job as scheduled_job
from scripts.run_scheduled_job import (
    build_classifier_args,
    build_notification_body,
    build_notification_subject,
    normalize_job_name,
    resolve_public_page_url,
    validate_cool_daily_reports,
)


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

    def test_build_notification_subject_uses_job_label(self) -> None:
        self.assertEqual(
            "[MiPaper] HF Daily updated 2026-03-19",
            build_notification_subject("hf_daily", ["2026-03-19"]),
        )

    def test_resolve_public_page_url_uses_site_url_when_configured(self) -> None:
        with mock.patch.dict(os.environ, {"COOL_PAPER_SITE_URL": "https://mipaper.pages.dev/"}, clear=False):
            self.assertEqual("https://mipaper.pages.dev/trending.html", resolve_public_page_url("trending"))
            self.assertEqual("https://mipaper.pages.dev/magazine.html", resolve_public_page_url("magazine"))

    def test_build_notification_body_lists_dates_and_category_context(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "COOL_PAPER_SITE_URL": "https://mipaper.pages.dev",
                "COOL_PAPER_CATEGORIES": "cs.AI cs.CL",
            },
            clear=False,
        ):
            body = build_notification_body(
                "cool_daily",
                ["2026-03-18", "2026-03-19"],
                "Asia/Shanghai",
                now=None,
            )

        self.assertIn("Job: Cool Daily", body)
        self.assertIn("Page: https://mipaper.pages.dev/cool-daily.html", body)
        self.assertIn("Categories: cs.AI, cs.CL", body)
        self.assertIn("- 2026-03-18", body)
        self.assertIn("- 2026-03-19", body)

    def test_build_notification_body_for_magazine_mentions_source(self) -> None:
        body = build_notification_body(
            "magazine",
            ["2026-04-04"],
            "Asia/Shanghai",
            now=None,
        )

        self.assertIn("Job: Magazine", body)
        self.assertIn("Page: magazine.html", body)
        self.assertIn("Source: ruanyf/weekly", body)

    def test_normalize_job_name_maps_legacy_weekly_to_magazine(self) -> None:
        self.assertEqual("magazine", normalize_job_name("weekly"))
        self.assertEqual("magazine", normalize_job_name("magazine"))

    def test_main_updates_magazine_state_after_success(self) -> None:
        now = datetime.fromisoformat("2026-04-04T09:00:00+08:00")
        updated_at = datetime.fromisoformat("2026-04-04T09:15:00+08:00")

        with TemporaryDirectory() as tmp_dir:
            state_path = Path(tmp_dir) / "scheduled_jobs.json"
            args = mock.Mock(
                job="magazine",
                timezone="Asia/Shanghai",
                skip_push=True,
                git_remote="origin",
                git_branch="",
                state_path=str(state_path),
                start_date="2026-03-02",
                now=now.isoformat(),
            )

            with mock.patch.object(scheduled_job, "load_env_file"), mock.patch.object(
                scheduled_job, "parse_args", return_value=args
            ), mock.patch.object(
                scheduled_job,
                "load_schedule_state",
                return_value={"weekly_last_success_date": "2026-03-28"},
            ), mock.patch.object(
                scheduled_job, "parse_now", return_value=now
            ), mock.patch.object(
                scheduled_job, "run_magazine_job", return_value=["2026-04-04"]
            ), mock.patch.object(
                scheduled_job, "build_site_data"
            ), mock.patch.object(
                scheduled_job, "send_update_notification"
            ), mock.patch.object(
                scheduled_job, "save_schedule_state"
            ) as save_schedule_state, mock.patch.object(
                scheduled_job, "local_now", return_value=updated_at
            ):
                result = scheduled_job.main()

        self.assertEqual(0, result)
        save_schedule_state.assert_called_once()
        saved_path, saved_state = save_schedule_state.call_args.args
        self.assertEqual(state_path, saved_path)
        self.assertEqual("2026-04-04", saved_state["magazine_last_success_date"])
        self.assertEqual(updated_at.isoformat(), saved_state["magazine_updated_at"])
        self.assertEqual("2026-03-28", saved_state["weekly_last_success_date"])


if __name__ == "__main__":
    unittest.main()
