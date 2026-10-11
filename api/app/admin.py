"""Server administration from the command line.

    python -m app.admin show <email>
    python -m app.admin grant <email> <plan> <days>     # gifts, refunds, testing

In Docker: docker compose exec api python -m app.admin show someone@example.com
"""

import sys
from datetime import timedelta

from sqlalchemy import func, select

from .config import get_settings
from .db import Payment, Song, User, make_sessionmaker, now
from .plans import load_plans


def main(argv: list[str]) -> int:
    settings = get_settings()
    sessions = make_sessionmaker(settings.database_url)
    plans = load_plans(True, settings.plans_file or None)
    if len(argv) >= 2 and argv[0] == "show":
        with sessions() as s:
            user = s.scalar(select(User).where(User.email == argv[1].lower()))
            if not user:
                print("no such account")
                return 1
            songs = s.scalar(select(func.count()).select_from(Song).where(Song.user_id == user.id))
            print(f"{user.email}: plan {user.plan}, until {user.plan_until}, {songs} songs")
            for p in s.scalars(
                select(Payment).where(Payment.user_id == user.id).order_by(Payment.created_at)
            ):
                print(
                    f"  {p.created_at:%Y-%m-%d} {p.plan}/{p.period} {p.amount} {p.currency} {p.status} {p.receipt or ''}"
                )
        return 0
    if len(argv) == 4 and argv[0] == "grant":
        email, plan, days = argv[1].lower(), argv[2], int(argv[3])
        if plan not in plans.plans:
            print(f"unknown plan {plan!r}; plans: {', '.join(plans.plans)}")
            return 1
        with sessions() as s:
            user = s.scalar(select(User).where(User.email == email))
            if not user:
                user = User(email=email)
                s.add(user)
            start = (
                user.plan_until
                if user.plan == plan
                and user.plan_until
                and user.plan_until.replace(tzinfo=now().tzinfo) > now()
                else now()
            )
            user.plan, user.plan_until = (
                plan,
                start.replace(tzinfo=now().tzinfo) + timedelta(days=days),
            )
            s.commit()
            print(f"{email}: {plan} until {user.plan_until:%Y-%m-%d}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
