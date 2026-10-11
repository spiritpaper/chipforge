"""ChipForge API: accounts (email sign-in links), song and SFX sync, and share links.

The web app is local-first and works without this server; signing in adds sync
across devices and sharing. Run with `uvicorn app.main:create_app --factory`, or
self-host with docker compose (see deploy/).
"""

import hashlib
import json
import re
import secrets
from collections import defaultdict, deque
from datetime import timedelta
from decimal import Decimal
from time import monotonic
from typing import Annotated, Any

from fastapi import Body, Cookie, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session as DbSession

from .billing import BTCPay, Gateway, GatewayError, Verified, ZarinPal, btcpay_signature_ok
from .config import Settings, get_settings
from .db import LoginToken, Payment, Session, SfxLibrary, Song, User, make_sessionmaker, now
from .mail import send_sign_in
from .plans import Plan, extend, load_plans
from .validate import song_problem

COOKIE = "chipforge_session"
TOKEN_MINUTES = 15
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$")
# Sign-in emails: at most this many per address per hour, and per client IP per hour.
PER_EMAIL_PER_HOUR = 5
PER_IP_PER_HOUR = 20


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def gateways_from(settings: Settings) -> list[Gateway]:
    """The payment gateways whose credentials are set, in the order buyers see them."""
    out: list[Gateway] = []
    if settings.zarinpal_merchant_id:
        out.append(ZarinPal(settings.zarinpal_merchant_id, sandbox=settings.zarinpal_sandbox))
    if settings.btcpay_url and settings.btcpay_store_id and settings.btcpay_api_key:
        out.append(
            BTCPay(
                settings.btcpay_url,
                settings.btcpay_store_id,
                settings.btcpay_api_key,
                settings.btcpay_currency,
            )
        )
    return out


def create_app(settings: Settings | None = None, gateways: list[Gateway] | None = None) -> FastAPI:
    settings = settings or get_settings()
    sessions = make_sessionmaker(settings.database_url)
    plans = load_plans(settings.billing_enabled, settings.plans_file or None)
    by_name = {g.name: g for g in (gateways if gateways is not None else gateways_from(settings))}
    ip_requests: dict[str, deque[float]] = defaultdict(deque)
    app = FastAPI(
        title="ChipForge API",
        version="0.2.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    def db():
        with sessions() as s:
            yield s

    Db = Annotated[DbSession, Depends(db)]

    def same_origin(request: Request) -> None:
        """Changes must come from the app itself (cookies alone don't prove that)."""
        origin = request.headers.get("origin")
        if origin != settings.app_origin:
            raise HTTPException(403, "Requests must come from the ChipForge app.")

    def current_user(s: Db, session: Annotated[str | None, Cookie(alias=COOKIE)] = None) -> User:
        if session:
            row = s.get(Session, _hash(session))
            if row and row.expires_at.replace(tzinfo=row.expires_at.tzinfo or now().tzinfo) > now():
                user = s.get(User, row.user_id)
                if user:
                    return user
        raise HTTPException(401, "Sign in to sync songs.")

    CurrentUser = Annotated[User, Depends(current_user)]
    SameOrigin = Depends(same_origin)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # ---- accounts ---------------------------------------------------------------

    @app.post("/api/auth/request", dependencies=[SameOrigin], status_code=202)
    def request_link(
        s: Db, request: Request, email: Annotated[str, Body(embed=True)]
    ) -> dict[str, str]:
        email = email.strip().lower()
        if not EMAIL_RE.match(email):
            raise HTTPException(422, "That doesn't look like an email address.")
        ip = request.client.host if request.client else "?"
        window = ip_requests[ip]
        while window and monotonic() - window[0] > 3600:
            window.popleft()
        recent = s.scalar(
            select(func.count())
            .select_from(LoginToken)
            .where(LoginToken.email == email, LoginToken.created_at > now() - timedelta(hours=1))
        )
        if len(window) >= PER_IP_PER_HOUR or recent >= PER_EMAIL_PER_HOUR:
            raise HTTPException(429, "Too many sign-in emails. Try again in an hour.")
        window.append(monotonic())
        token = secrets.token_urlsafe(32)
        s.add(
            LoginToken(
                token_hash=_hash(token),
                email=email,
                expires_at=now() + timedelta(minutes=TOKEN_MINUTES),
            )
        )
        s.commit()
        send_sign_in(settings, email, f"{settings.app_origin}/api/auth/verify?token={token}")
        # Same answer whether or not the address has an account.
        return {"status": "sent"}

    @app.get("/api/auth/verify")
    def verify(s: Db, token: str) -> Response:
        row = s.get(LoginToken, _hash(token))
        expires = (
            row.expires_at.replace(tzinfo=row.expires_at.tzinfo or now().tzinfo) if row else None
        )
        if not row or row.used or expires < now():
            return RedirectResponse(f"{settings.app_origin}/#/account?error=link", status_code=303)
        row.used = True
        user = s.scalar(select(User).where(User.email == row.email))
        if not user:
            user = User(email=row.email)
            s.add(user)
            s.flush()
        session_id = secrets.token_urlsafe(32)
        s.add(
            Session(
                id_hash=_hash(session_id),
                user_id=user.id,
                expires_at=now() + timedelta(days=settings.session_days),
            )
        )
        s.commit()
        response = RedirectResponse(f"{settings.app_origin}/#/account?signed-in=1", status_code=303)
        response.set_cookie(
            COOKIE,
            session_id,
            max_age=settings.session_days * 86400,
            httponly=True,
            secure=settings.secure_cookies,
            samesite="lax",
            path="/",
        )
        return response

    def billing_info() -> dict[str, Any]:
        live = list(by_name.values()) if plans.enabled else []
        return {
            "enabled": plans.enabled,
            "checkout": bool(live),
            "gateways": [{"id": g.name, "label": g.label, "currency": g.currency} for g in live],
            "plans": [p.public() for p in plans.plans.values()] if plans.enabled else [],
        }

    def song_count(s: DbSession, user: User) -> int:
        return s.scalar(select(func.count()).select_from(Song).where(Song.user_id == user.id)) or 0

    @app.get("/api/me")
    def me(s: Db, session: Annotated[str | None, Cookie(alias=COOKIE)] = None) -> dict[str, Any]:
        """Who is signed in and on which plan; {"email": null} when nobody is."""
        try:
            user = current_user(s, session)
        except HTTPException:
            return {"email": None, "billing": billing_info()}
        plan = plans.effective(user)
        paid_until = (
            user.plan_until.isoformat() if plan.id == user.plan and user.plan_until else None
        )
        return {
            "email": user.email,
            "plan": {**plan.public(), "until": paid_until},
            "usage": {"songs": song_count(s, user)},
            "billing": billing_info(),
        }

    def over_limit(message: str, limit: str) -> JSONResponse:
        return JSONResponse({"detail": message, "limit": limit}, status_code=402)

    def songs_limit_message(plan: Plan) -> str:
        return (
            f"Your {plan.name} plan syncs up to {plan.max_songs} songs. This one stays on this "
            "device; upgrade to sync more."
        )

    @app.post("/api/auth/logout", dependencies=[SameOrigin])
    def logout(
        s: Db, response: Response, session: Annotated[str | None, Cookie(alias=COOKIE)] = None
    ) -> dict[str, str]:
        if session and (row := s.get(Session, _hash(session))):
            s.delete(row)
            s.commit()
        response.delete_cookie(COOKIE, path="/")
        return {"status": "signed out"}

    # ---- songs ------------------------------------------------------------------

    def find_song(s: DbSession, user: User, song_id: str) -> Song | None:
        return s.scalar(select(Song).where(Song.user_id == user.id, Song.id == song_id))

    @app.get("/api/songs")
    def list_songs(s: Db, user: CurrentUser) -> list[dict[str, Any]]:
        rows = s.scalars(
            select(Song).where(Song.user_id == user.id).order_by(Song.updated_at.desc())
        )
        return [
            {
                "id": r.id,
                "title": r.title,
                "version": r.version,
                "updatedAt": r.updated_at.isoformat(),
            }
            for r in rows
        ]

    @app.get("/api/songs/{song_id}")
    def get_song(s: Db, user: CurrentUser, song_id: str) -> dict[str, Any]:
        row = find_song(s, user, song_id)
        if not row:
            raise HTTPException(404, "No such song.")
        return {"id": row.id, "version": row.version, "song": row.data, "shareSlug": row.share_slug}

    @app.put("/api/songs/{song_id}", dependencies=[SameOrigin])
    async def put_song(s: Db, user: CurrentUser, song_id: str, request: Request) -> Any:
        raw = await request.body()
        if len(raw) > settings.song_max_bytes:
            raise HTTPException(413, "That song is too large to store.")
        try:
            body = await request.json()
        except ValueError:
            raise HTTPException(400, "Expected JSON.") from None
        song, base = body.get("song"), body.get("baseVersion")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", song_id):
            raise HTTPException(422, "Bad song id.")
        if problem := song_problem(song):
            raise HTTPException(422, f"Not a valid song: {problem}.")
        row = find_song(s, user, song_id)
        plan = plans.effective(user)
        if not row and plan.max_songs is not None and song_count(s, user) >= plan.max_songs:
            return over_limit(songs_limit_message(plan), "songs")
        if row and base != row.version:
            # Changed elsewhere since this browser last saw it: send the server copy back.
            return JSONResponse(
                {"conflict": True, "version": row.version, "song": row.data}, status_code=409
            )
        if row:
            row.data, row.title, row.version = song, song["title"], row.version + 1
        else:
            row = Song(id=song_id, user_id=user.id, title=song["title"], data=song, version=1)
            s.add(row)
        s.commit()
        return {"version": row.version}

    @app.delete("/api/songs/{song_id}", dependencies=[SameOrigin], status_code=204)
    def delete_song(s: Db, user: CurrentUser, song_id: str) -> Response:
        if row := find_song(s, user, song_id):
            s.delete(row)
            s.commit()
        return Response(status_code=204)

    # ---- sharing ----------------------------------------------------------------

    @app.post("/api/songs/{song_id}/share", dependencies=[SameOrigin])
    def share(s: Db, user: CurrentUser, song_id: str) -> Any:
        plan = plans.effective(user)
        if not plan.share:
            return over_limit(f"Share links come with a paid plan; you're on {plan.name}.", "share")
        row = find_song(s, user, song_id)
        if not row:
            raise HTTPException(404, "Sync the song before sharing it.")
        if not row.share_slug:
            row.share_slug = secrets.token_urlsafe(9)
            s.commit()
        return {"slug": row.share_slug}

    @app.delete("/api/songs/{song_id}/share", dependencies=[SameOrigin], status_code=204)
    def unshare(s: Db, user: CurrentUser, song_id: str) -> Response:
        if (row := find_song(s, user, song_id)) and row.share_slug:
            row.share_slug = None
            s.commit()
        return Response(status_code=204)

    @app.get("/api/shared/{slug}")
    def shared(s: Db, slug: str) -> dict[str, Any]:
        row = s.scalar(select(Song).where(Song.share_slug == slug))
        if not row:
            raise HTTPException(404, "This share link was turned off or never existed.")
        return {"title": row.title, "song": row.data}

    # ---- SFX library ------------------------------------------------------------

    @app.get("/api/sfx-library")
    def get_sfx(s: Db, user: CurrentUser) -> dict[str, Any]:
        row = s.get(SfxLibrary, user.id)
        return (
            {"version": row.version, "library": row.data}
            if row
            else {"version": 0, "library": None}
        )

    @app.put("/api/sfx-library", dependencies=[SameOrigin])
    async def put_sfx(s: Db, user: CurrentUser, request: Request) -> Any:
        raw = await request.body()
        if len(raw) > settings.song_max_bytes:
            raise HTTPException(413, "The sound library is too large to store.")
        body = await request.json()
        library, base = body.get("library"), body.get("baseVersion")
        if not isinstance(library, dict) or not isinstance(library.get("entries"), list):
            raise HTTPException(422, "Not a sound library.")
        row = s.get(SfxLibrary, user.id)
        if row and base != row.version:
            return JSONResponse(
                {"conflict": True, "version": row.version, "library": row.data}, status_code=409
            )
        if row:
            row.data, row.version = library, row.version + 1
        else:
            row = SfxLibrary(user_id=user.id, data=library, version=1)
            s.add(row)
        s.commit()
        return {"version": row.version}

    # ---- billing ----------------------------------------------------------------

    @app.post("/api/billing/checkout", dependencies=[SameOrigin])
    def checkout(
        s: Db,
        user: CurrentUser,
        plan_id: Annotated[str, Body(alias="plan")],
        period: Annotated[str, Body()],
        gateway_name: Annotated[str | None, Body(alias="gateway")] = None,
    ) -> dict[str, str]:
        if not plans.enabled or not by_name:
            raise HTTPException(503, "Payments aren't set up on this server.")
        gateway = by_name.get(gateway_name) if gateway_name else next(iter(by_name.values()))
        if gateway is None:
            raise HTTPException(422, "No such payment method.")
        plan = plans.plans.get(plan_id)
        amount = plan.price(gateway.currency, period) if plan else None
        if not plan or not amount:
            raise HTTPException(422, "No such plan or period.")
        payment = Payment(
            user_id=user.id,
            plan=plan.id,
            period=period,
            amount=str(amount),
            currency=gateway.currency,
            provider=gateway.name,
        )
        s.add(payment)
        s.flush()
        try:
            reference, url = gateway.start(
                payment.id,
                amount,
                f"ChipForge {plan.name}, one {period}",
                gateway.return_url(settings.app_origin, payment.id),
                user.email,
            )
        except GatewayError as e:
            s.rollback()
            raise HTTPException(502, str(e)) from e
        payment.reference = reference
        s.commit()
        return {"url": url}

    def back_to_account(result: str) -> RedirectResponse:
        return RedirectResponse(
            f"{settings.app_origin}/#/account?payment={result}", status_code=303
        )

    def settle(s: DbSession, payment: Payment, verified: Verified) -> str:
        """Records what the gateway said; returns the result for the account page."""
        if verified.status == "pending":
            return "pending"
        if verified.status != "paid":
            s.execute(
                update(Payment)
                .where(Payment.id == payment.id, Payment.status != "paid")
                .values(status=verified.status)
            )
            s.commit()
            return verified.status
        # The return link and a webhook can arrive together: only the request that
        # flips the payment to paid extends the plan.
        flipped = s.execute(
            update(Payment)
            .where(Payment.id == payment.id, Payment.status != "paid")
            .values(status="paid", receipt=verified.receipt, paid_at=now())
        ).rowcount
        if flipped:
            user = s.get(User, payment.user_id)
            if user:
                extend(user, payment.plan, payment.period)
        s.commit()
        return "ok"

    def check(s: DbSession, payment: Payment) -> str:
        """Asks the payment's gateway about it and settles it."""
        if payment.status == "paid":
            return "ok"
        gateway = by_name.get(payment.provider)
        if gateway is None or not payment.reference:
            return "unknown"
        # The amount comes from our record, never from the buyer or the callback.
        return settle(s, payment, gateway.verify(payment.reference, Decimal(payment.amount)))

    @app.get("/api/billing/zarinpal/callback")
    def zarinpal_callback(
        s: Db,
        authority: Annotated[str, Query(alias="Authority")],
        status: Annotated[str, Query(alias="Status")] = "",
    ) -> Response:
        payment = s.scalar(
            select(Payment).where(Payment.reference == authority, Payment.provider == "zarinpal")
        )
        if not payment or "zarinpal" not in by_name:
            return back_to_account("unknown")
        if payment.status == "paid":
            return back_to_account("ok")
        if status != "OK":
            return back_to_account(settle(s, payment, Verified("cancelled")))
        try:
            return back_to_account(check(s, payment))
        except GatewayError:
            # Left pending: coming back to this link verifies again.
            return back_to_account("error")

    @app.get("/api/billing/btcpay/return")
    def btcpay_return(s: Db, payment_id: Annotated[str, Query(alias="payment")]) -> Response:
        payment = s.get(Payment, payment_id)
        if not payment or payment.provider != "btcpay":
            return back_to_account("unknown")
        try:
            return back_to_account(check(s, payment))
        except GatewayError:
            return back_to_account("error")

    @app.post("/api/billing/btcpay/webhook")
    async def btcpay_webhook(request: Request) -> dict[str, bool]:
        """BTCPay calls this as invoices change. Only the invoice id is taken from the
        (signed) body; its state is then fetched from BTCPay itself."""
        body = await request.body()
        if not btcpay_signature_ok(
            settings.btcpay_webhook_secret, body, request.headers.get("BTCPay-Sig")
        ):
            raise HTTPException(401, "Bad signature.")
        try:
            invoice_id = json.loads(body).get("invoiceId")
        except (ValueError, AttributeError):
            raise HTTPException(400, "Not a BTCPay webhook.") from None
        with sessions() as s:
            payment = s.scalar(
                select(Payment).where(Payment.reference == invoice_id, Payment.provider == "btcpay")
            )
            if payment:
                try:
                    check(s, payment)
                except GatewayError as e:
                    # A failed delivery makes BTCPay try again later.
                    raise HTTPException(502, str(e)) from e
        return {"ok": True}

    return app
