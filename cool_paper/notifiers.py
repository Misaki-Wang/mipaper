from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


class EmailNotifier:
    def __init__(self) -> None:
        self.host = require_env("COOL_PAPER_SMTP_HOST")
        self.port = int(os.getenv("COOL_PAPER_SMTP_PORT", "587"))
        self.username = require_env("COOL_PAPER_SMTP_USERNAME")
        self.password = require_env("COOL_PAPER_SMTP_PASSWORD")
        self.sender = require_env("COOL_PAPER_EMAIL_FROM")
        self.recipient = require_env("COOL_PAPER_EMAIL_TO")
        self.security = os.getenv("COOL_PAPER_SMTP_SECURITY", "starttls").lower()

    def send(self, subject: str, body: str) -> None:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = self.sender
        message["To"] = self.recipient
        message.set_content(body)

        if self.security == "ssl":
            with smtplib.SMTP_SSL(self.host, self.port) as smtp:
                smtp.login(self.username, self.password)
                smtp.send_message(message)
            return

        with smtplib.SMTP(self.host, self.port) as smtp:
            if self.security == "starttls":
                smtp.starttls()
            smtp.login(self.username, self.password)
            smtp.send_message(message)


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing environment variable: {name}")
    return value

