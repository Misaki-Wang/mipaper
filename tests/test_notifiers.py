import os
import unittest
from unittest import mock

from mipaper.notifiers import parse_csv_emails, resolve_recipients


class NotifiersTest(unittest.TestCase):
    def test_parse_csv_emails_trims_and_filters_empty_values(self) -> None:
        self.assertEqual(
            ["alice@example.com", "bob@example.com"],
            parse_csv_emails(" alice@example.com, , bob@example.com "),
        )

    def test_resolve_recipients_prefers_explicit_email_to(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "COOL_PAPER_EMAIL_TO": "alerts@example.com",
                "ALLOWED_EMAILS": "account@example.com",
            },
            clear=False,
        ):
            self.assertEqual(["alerts@example.com"], resolve_recipients())

    def test_resolve_recipients_falls_back_to_allowlisted_accounts(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "COOL_PAPER_EMAIL_TO": "",
                "ALLOWED_EMAILS": "account@example.com, teammate@example.com",
            },
            clear=False,
        ):
            self.assertEqual(["account@example.com", "teammate@example.com"], resolve_recipients())

    def test_resolve_recipients_requires_some_recipient_source(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "COOL_PAPER_EMAIL_TO": "",
                "ALLOWED_EMAILS": "",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(ValueError, "Missing recipient emails"):
                resolve_recipients()


if __name__ == "__main__":
    unittest.main()
