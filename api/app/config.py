"""Settings, all from environment variables so self-hosters configure without code."""

import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    value = os.environ.get(name)
    return int(value) if value else default


@dataclass(frozen=True)
class Settings:
    database_url: str = field(
        default_factory=lambda: os.environ.get("DATABASE_URL", "sqlite:///./chipforge.db")
    )
    # Where the web app lives; mutating requests must come from here (CSRF protection).
    app_origin: str = field(
        default_factory=lambda: os.environ.get("APP_ORIGIN", "http://localhost:5173")
    )
    # Mail: SMTP when configured; otherwise sign-in links go to MAIL_FILE or the log.
    smtp_host: str = field(default_factory=lambda: os.environ.get("SMTP_HOST", ""))
    smtp_port: int = field(default_factory=lambda: _int("SMTP_PORT", 587))
    smtp_user: str = field(default_factory=lambda: os.environ.get("SMTP_USER", ""))
    smtp_password: str = field(default_factory=lambda: os.environ.get("SMTP_PASSWORD", ""))
    mail_from: str = field(
        default_factory=lambda: os.environ.get("MAIL_FROM", "ChipForge <no-reply@localhost>")
    )
    mail_file: str = field(default_factory=lambda: os.environ.get("MAIL_FILE", ""))
    song_max_bytes: int = field(default_factory=lambda: _int("SONG_MAX_BYTES", 2_000_000))
    session_days: int = field(default_factory=lambda: _int("SESSION_DAYS", 60))

    @property
    def secure_cookies(self) -> bool:
        return self.app_origin.startswith("https://")


def get_settings() -> Settings:
    return Settings()
