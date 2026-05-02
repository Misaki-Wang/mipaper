import os
import unittest
from unittest import mock

from mipaper.notifiers import EmailNotifier, parse_csv_emails, resolve_recipients, smtp_host_candidates


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

    def test_email_notifier_sends_html_alternative_when_provided(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "COOL_PAPER_SMTP_HOST": "smtp.example.com",
                "COOL_PAPER_SMTP_PORT": "587",
                "COOL_PAPER_SMTP_USERNAME": "user",
                "COOL_PAPER_SMTP_PASSWORD": "password",
                "COOL_PAPER_EMAIL_FROM": "from@example.com",
                "COOL_PAPER_EMAIL_TO": "to@example.com",
                "COOL_PAPER_SMTP_SECURITY": "none",
            },
            clear=False,
        ), mock.patch("mipaper.notifiers.socket.getaddrinfo", return_value=[]), mock.patch(
            "mipaper.notifiers.smtplib.SMTP"
        ) as smtp_class:
            smtp = smtp_class.return_value.__enter__.return_value
            EmailNotifier().send("Subject", "Plain body", "<strong>HTML body</strong>")

        message = smtp.send_message.call_args.args[0]
        self.assertEqual("Plain body\n", message.get_body(preferencelist=("plain",)).get_content())
        self.assertEqual("<strong>HTML body</strong>\n", message.get_body(preferencelist=("html",)).get_content())

    def test_smtp_host_candidates_adds_ipv4_fallbacks(self) -> None:
        with mock.patch(
            "mipaper.notifiers.socket.getaddrinfo",
            return_value=[
                (mock.Mock(), mock.Mock(), mock.Mock(), "", ("192.0.2.10", 587)),
                (mock.Mock(), mock.Mock(), mock.Mock(), "", ("192.0.2.11", 587)),
            ],
        ):
            self.assertEqual(
                ["smtp.example.com", "192.0.2.10", "192.0.2.11"],
                smtp_host_candidates("smtp.example.com", 587),
            )


if __name__ == "__main__":
    unittest.main()
