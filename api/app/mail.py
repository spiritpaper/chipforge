"""Sends sign-in links: SMTP if configured, else a file (tests, dev) or the log."""

import logging
import smtplib
from email.message import EmailMessage

from .config import Settings

log = logging.getLogger("chipforge.mail")


def send_sign_in(settings: Settings, to: str, link: str) -> None:
    body = (
        "Here is your link to sign in to ChipForge:\n\n"
        f"{link}\n\n"
        "It works once, for 15 minutes. If you didn't ask for it, ignore this email.\n"
    )
    if settings.smtp_host:
        msg = EmailMessage()
        msg["Subject"] = "Sign in to ChipForge"
        msg["From"] = settings.mail_from
        msg["To"] = to
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    elif settings.mail_file:
        with open(settings.mail_file, "a", encoding="utf-8") as f:
            f.write(f"To: {to}\n{link}\n\n")
    else:
        log.warning("No SMTP configured; sign-in link for %s: %s", to, link)
