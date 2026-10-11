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
    # Hosted-service plans. Off by default: a self-hosted server gives everyone everything.
    billing_enabled: bool = field(
        default_factory=lambda: (
            os.environ.get("BILLING_ENABLED", "").lower() in {"1", "true", "yes"}
        )
    )
    plans_file: str = field(default_factory=lambda: os.environ.get("PLANS_FILE", ""))
    zarinpal_merchant_id: str = field(
        default_factory=lambda: os.environ.get("ZARINPAL_MERCHANT_ID", "")
    )
    zarinpal_sandbox: bool = field(
        default_factory=lambda: (
            os.environ.get("ZARINPAL_SANDBOX", "").lower() in {"1", "true", "yes"}
        )
    )
    # BTCPay Server (crypto): the server's URL, a store id, a Greenfield API key, and the
    # secret of a webhook pointing at /api/billing/btcpay/webhook.
    btcpay_url: str = field(default_factory=lambda: os.environ.get("BTCPAY_URL", ""))
    btcpay_store_id: str = field(default_factory=lambda: os.environ.get("BTCPAY_STORE_ID", ""))
    btcpay_api_key: str = field(default_factory=lambda: os.environ.get("BTCPAY_API_KEY", ""))
    btcpay_webhook_secret: str = field(
        default_factory=lambda: os.environ.get("BTCPAY_WEBHOOK_SECRET", "")
    )
    btcpay_currency: str = field(
        default_factory=lambda: os.environ.get("BTCPAY_CURRENCY", "USD").upper()
    )

    @property
    def secure_cookies(self) -> bool:
        return self.app_origin.startswith("https://")


def get_settings() -> Settings:
    return Settings()
