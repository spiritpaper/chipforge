"""Payment gateways behind a small interface: ZarinPal (Iranian cards, in Rial) and
BTCPay Server (Bitcoin and other crypto, priced in a currency like USD).

Neither does recurring billing here: a payment buys a period (a month or a year) and
the plan runs until that date.
"""

import hashlib
import hmac
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Literal, Protocol


class GatewayError(Exception):
    pass


@dataclass
class Verified:
    """What the gateway says about a checkout. "pending" means not settled yet (crypto
    waiting for confirmations); the payment stays open and is checked again later."""

    status: Literal["paid", "pending", "failed", "cancelled"]
    receipt: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "paid"


class Gateway(Protocol):
    #: Id used in URLs and the database.
    name: str
    #: How the buyer pays, as shown on the button.
    label: str
    #: ISO currency the plan prices for this gateway are in.
    currency: str

    def return_url(self, app_origin: str, payment_id: str) -> str:
        """Where the gateway sends the buyer back to."""
        ...

    def start(
        self, payment_id: str, amount: Decimal, description: str, return_url: str, email: str
    ) -> tuple[str, str]:
        """Creates a checkout; returns (reference, URL to send the buyer to)."""
        ...

    def verify(self, reference: str, amount: Decimal) -> Verified:
        """Asks the gateway about the checkout; paid only for exactly `amount`."""
        ...


def _http_json(
    method: str,
    url: str,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
    error_bodies: bool = False,
    timeout: float = 20,
) -> dict:
    """JSON over HTTP. With `error_bodies`, a 4xx/5xx JSON body is returned instead of
    raising (ZarinPal reports refusals that way)."""
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            **(headers or {}),
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        if error_bodies:
            try:
                return json.loads(e.read())
            except ValueError:
                pass
        raise GatewayError(f"gateway answered {e.code}") from e
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise GatewayError(f"couldn't reach the payment gateway: {e}") from e


def _post_json(url: str, body: dict) -> dict:
    return _http_json("POST", url, body, error_bodies=True)


class ZarinPal:
    """ZarinPal REST API v4 (https://www.zarinpal.com/docs/). Amounts are in Rial."""

    name = "zarinpal"
    label = "Card (ZarinPal)"
    currency = "IRR"

    def __init__(self, merchant_id: str, sandbox: bool = False, post=_post_json):
        self.merchant_id = merchant_id
        host = "sandbox.zarinpal.com" if sandbox else "payment.zarinpal.com"
        self.api = f"https://{host}/pg/v4/payment"
        self.start_pay = f"https://{host}/pg/StartPay"
        self.post = post

    def return_url(self, app_origin: str, payment_id: str) -> str:
        # ZarinPal adds ?Authority=…&Status=…, which identifies the payment.
        return f"{app_origin}/api/billing/zarinpal/callback"

    def start(
        self, payment_id: str, amount: Decimal, description: str, return_url: str, email: str
    ) -> tuple[str, str]:
        r = self.post(
            f"{self.api}/request.json",
            {
                "merchant_id": self.merchant_id,
                "amount": int(amount),
                "currency": "IRR",
                "description": description,
                "callback_url": return_url,
                "metadata": {"email": email, "order_id": payment_id},
            },
        )
        data = r.get("data") or {}
        if data.get("code") != 100 or not data.get("authority"):
            raise GatewayError(f"ZarinPal refused the checkout: {r.get('errors') or data}")
        authority = data["authority"]
        return authority, f"{self.start_pay}/{authority}"

    def verify(self, reference: str, amount: Decimal) -> Verified:
        r = self.post(
            f"{self.api}/verify.json",
            {"merchant_id": self.merchant_id, "amount": int(amount), "authority": reference},
        )
        data = r.get("data") or {}
        # 100: paid now; 101: already verified earlier (a repeated callback).
        if data.get("code") in (100, 101):
            return Verified("paid", str(data.get("ref_id", "")) or None)
        return Verified("failed")


class BTCPay:
    """BTCPay Server's Greenfield API (https://docs.btcpayserver.org/API/Greenfield/v1/).

    BTCPay is open source and self-hosted: payments go straight to the operator's
    wallet. Invoices are priced in `currency` (USD by default) and paid in Bitcoin or
    whatever the store accepts. The API key needs the "Create invoice" and "View
    invoices" permissions on the store.
    """

    name = "btcpay"
    label = "Crypto (BTCPay)"

    def __init__(
        self, url: str, store_id: str, api_key: str, currency: str = "USD", request=_http_json
    ):
        self.base = f"{url.rstrip('/')}/api/v1/stores/{urllib.parse.quote(store_id)}"
        self.auth = {"Authorization": f"token {api_key}"}
        self.currency = currency
        self.request = request

    def return_url(self, app_origin: str, payment_id: str) -> str:
        return f"{app_origin}/api/billing/btcpay/return?payment={payment_id}"

    def start(
        self, payment_id: str, amount: Decimal, description: str, return_url: str, email: str
    ) -> tuple[str, str]:
        r = self.request(
            "POST",
            f"{self.base}/invoices",
            {
                "amount": str(amount),
                "currency": self.currency,
                "metadata": {"orderId": payment_id, "buyerEmail": email, "itemDesc": description},
                "checkout": {"redirectURL": return_url, "redirectAutomatically": True},
            },
            self.auth,
        )
        if not r.get("id") or not r.get("checkoutLink"):
            raise GatewayError(f"BTCPay didn't create the invoice: {r}")
        return r["id"], r["checkoutLink"]

    def verify(self, reference: str, amount: Decimal) -> Verified:
        r = self.request(
            "GET", f"{self.base}/invoices/{urllib.parse.quote(reference)}", None, self.auth
        )
        status = r.get("status")
        if status == "Settled":
            try:
                same = (
                    Decimal(str(r.get("amount"))) == amount and r.get("currency") == self.currency
                )
            except InvalidOperation:
                same = False
            return Verified("paid", reference) if same else Verified("failed")
        if status in ("New", "Processing"):
            # Unpaid but still open, or paid and waiting for confirmations.
            return Verified("pending")
        if status == "Expired":
            # Expired with part of the amount paid needs a refund by hand, not a retry.
            partial = r.get("additionalStatus") == "PaidPartial"
            return Verified("failed" if partial else "cancelled")
        return Verified("failed")


def btcpay_signature_ok(secret: str, body: bytes, header: str | None) -> bool:
    """Checks a BTCPay webhook's `BTCPay-Sig: sha256=<HMAC of the raw body>` header."""
    if not secret or not header:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)
