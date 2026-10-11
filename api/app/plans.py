"""Plans for a hosted service. Self-hosted servers leave BILLING_ENABLED unset, and every
account gets everything.

Plans come from app/plans.default.json or the file in PLANS_FILE. Prices are listed per
currency, one for each gateway you use (IRR for ZarinPal, USD or BTCPAY_CURRENCY for
BTCPay), and are placeholders: set your own.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

from .db import User, now

PERIOD_DAYS = {"month": 31, "year": 366}


@dataclass(frozen=True)
class Plan:
    id: str
    name: str
    max_songs: int | None
    share: bool
    gpu_conversion: bool
    badge: bool
    #: currency -> period -> amount
    prices: dict[str, dict[str, Decimal]]

    def price(self, currency: str, period: str) -> Decimal | None:
        return self.prices.get(currency, {}).get(period)

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "maxSongs": self.max_songs,
            "share": self.share,
            "gpuConversion": self.gpu_conversion,
            "badge": self.badge,
            "prices": {
                currency: {period: _number(amount) for period, amount in periods.items()}
                for currency, periods in self.prices.items()
            },
        }


def _number(amount: Decimal) -> int | float:
    return int(amount) if amount == amount.to_integral_value() else float(amount)


# What everyone gets when billing is off (self-hosting).
UNLIMITED = Plan("unlimited", "Unlimited", None, True, True, False, {})


@dataclass(frozen=True)
class Plans:
    enabled: bool
    plans: dict[str, Plan]

    def effective(self, user: User, at: datetime | None = None) -> Plan:
        if not self.enabled:
            return UNLIMITED
        until = user.plan_until
        if until is not None and until.tzinfo is None:
            until = until.replace(tzinfo=(at or now()).tzinfo)
        if user.plan in self.plans and until is not None and until > (at or now()):
            return self.plans[user.plan]
        return self.plans["free"]


def load_plans(enabled: bool, path: str | None = None) -> Plans:
    file = Path(path) if path else Path(__file__).with_name("plans.default.json")
    # Parse numbers as Decimal so 2.99 stays exactly 2.99.
    data = json.loads(file.read_text(), parse_float=Decimal, parse_int=Decimal)

    def prices(p: dict) -> dict[str, dict[str, Decimal]]:
        raw = p.get("prices", {})
        # The first format had one currency for the whole file: {"month": 1000000}.
        if raw and all(not isinstance(v, dict) for v in raw.values()):
            raw = {data.get("currency", "IRR"): raw}
        out = {
            cur.upper(): {period: Decimal(v) for period, v in periods.items()}
            for cur, periods in raw.items()
        }
        for periods in out.values():
            if unknown := set(periods) - set(PERIOD_DAYS):
                raise ValueError(f"{file}: plan {p['id']} has unknown periods {unknown}")
            if any(v <= 0 for v in periods.values()):
                raise ValueError(f"{file}: plan {p['id']} has a price that isn't positive")
        return out

    plans = {
        p["id"]: Plan(
            p["id"],
            p["name"],
            int(p["maxSongs"]) if p.get("maxSongs") is not None else None,
            p["share"],
            p["gpuConversion"],
            p["badge"],
            prices(p),
        )
        for p in data["plans"]
    }
    if "free" not in plans:
        raise ValueError(f"{file}: a plan with id 'free' is required")
    return Plans(enabled, plans)


def extend(user: User, plan_id: str, period: str, at: datetime | None = None) -> None:
    """Adds a paid period: on top of time left on the same plan, else from now."""
    start = at or now()
    until = user.plan_until
    if until is not None and until.tzinfo is None:
        until = until.replace(tzinfo=start.tzinfo)
    if user.plan == plan_id and until is not None and until > start:
        start = until
    user.plan = plan_id
    user.plan_until = start + timedelta(days=PERIOD_DAYS[period])
