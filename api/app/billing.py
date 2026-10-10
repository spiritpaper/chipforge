"""Payment gateways behind a small interface, starting with ZarinPal.

ZarinPal has no recurring billing, so a payment buys a period (a month or a year)
and the plan runs until that date.
"""

import json
import urllib.request
from dataclasses import dataclass
from typing import Protocol


class GatewayError(Exception):
    pass


@dataclass
class Verified:
    ok: bool
    receipt: str | None = None


class Gateway(Protocol):
    name: str

    def start(
        self, amount: int, description: str, callback_url: str, email: str
    ) -> tuple[str, str]:
        """Creates a checkout; returns (reference, URL to send the buyer to)."""
        ...

    def verify(self, reference: str, amount: int) -> Verified:
        """Asks the gateway whether the checkout was paid, for exactly `amount`."""
        ...


def _post_json(url: str, body: dict, timeout: float = 20) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        # ZarinPal reports errors with 4xx statuses and a JSON body.
        try:
            return json.loads(e.read())
        except ValueError:
            raise GatewayError(f"gateway answered {e.code}") from e
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise GatewayError(f"couldn't reach the payment gateway: {e}") from e


class ZarinPal:
    """ZarinPal REST API v4 (https://www.zarinpal.com/docs/). Amounts are in Rial."""

    name = "zarinpal"

    def __init__(self, merchant_id: str, sandbox: bool = False, post=_post_json):
        self.merchant_id = merchant_id
        host = "sandbox.zarinpal.com" if sandbox else "payment.zarinpal.com"
        self.api = f"https://{host}/pg/v4/payment"
        self.start_pay = f"https://{host}/pg/StartPay"
        self.post = post

    def start(
        self, amount: int, description: str, callback_url: str, email: str
    ) -> tuple[str, str]:
        r = self.post(
            f"{self.api}/request.json",
            {
                "merchant_id": self.merchant_id,
                "amount": amount,
                "currency": "IRR",
                "description": description,
                "callback_url": callback_url,
                "metadata": {"email": email},
            },
        )
        data = r.get("data") or {}
        if data.get("code") != 100 or not data.get("authority"):
            raise GatewayError(f"ZarinPal refused the checkout: {r.get('errors') or data}")
        authority = data["authority"]
        return authority, f"{self.start_pay}/{authority}"

    def verify(self, reference: str, amount: int) -> Verified:
        r = self.post(
            f"{self.api}/verify.json",
            {"merchant_id": self.merchant_id, "amount": amount, "authority": reference},
        )
        data = r.get("data") or {}
        # 100: paid now; 101: already verified earlier (a repeated callback).
        if data.get("code") in (100, 101):
            return Verified(True, str(data.get("ref_id", "")) or None)
        return Verified(False)
