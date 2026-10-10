"""Plans for a hosted service. Self-hosted servers leave BILLING_ENABLED unset, and every
account gets everything.

Plans come from app/plans.default.json or the file in PLANS_FILE. Prices are in the
payment gateway's unit (Rial for ZarinPal) and are placeholders: set your own.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
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
    prices: dict[str, int]

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "maxSongs": self.max_songs,
            "share": self.share,
            "gpuConversion": self.gpu_conversion,
            "badge": self.badge,
            "prices": self.prices,
        }


# What everyone gets when billing is off (self-hosting).
UNLIMITED = Plan("unlimited", "Unlimited", None, True, True, False, {})


@dataclass(frozen=True)
class Plans:
    enabled: bool
    currency: str
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
    data = json.loads(file.read_text())
    plans = {
        p["id"]: Plan(
            p["id"],
            p["name"],
            p.get("maxSongs"),
            p["share"],
            p["gpuConversion"],
            p["badge"],
            p.get("prices", {}),
        )
        for p in data["plans"]
    }
    if "free" not in plans:
        raise ValueError(f"{file}: a plan with id 'free' is required")
    for plan in plans.values():
        if unknown := set(plan.prices) - set(PERIOD_DAYS):
            raise ValueError(f"{file}: plan {plan.id} has unknown periods {unknown}")
    return Plans(enabled, data.get("currency", "IRR"), plans)


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
