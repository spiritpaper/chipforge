"""ChipForge API: accounts (email sign-in links), song and SFX sync, and share links.

The web app is local-first and works without this server; signing in adds sync
across devices and sharing. Run with `uvicorn app.main:create_app --factory`, or
self-host with docker compose (see deploy/).
"""

import hashlib
import re
import secrets
from collections import defaultdict, deque
from datetime import timedelta
from time import monotonic
from typing import Annotated, Any

from fastapi import Body, Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from .config import Settings, get_settings
from .db import LoginToken, Session, SfxLibrary, Song, User, make_sessionmaker, now
from .mail import send_sign_in
from .validate import song_problem

COOKIE = "chipforge_session"
TOKEN_MINUTES = 15
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$")
# Sign-in emails: at most this many per address per hour, and per client IP per hour.
PER_EMAIL_PER_HOUR = 5
PER_IP_PER_HOUR = 20


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    sessions = make_sessionmaker(settings.database_url)
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

    @app.get("/api/me")
    def me(
        s: Db, session: Annotated[str | None, Cookie(alias=COOKIE)] = None
    ) -> dict[str, str | None]:
        """Who is signed in; {"email": null} when nobody is (not an error)."""
        try:
            return {"email": current_user(s, session).email}
        except HTTPException:
            return {"email": None}

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
    def share(s: Db, user: CurrentUser, song_id: str) -> dict[str, str]:
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

    return app
