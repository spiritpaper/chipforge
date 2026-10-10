"""Accounts, sync, conflicts, sharing and the safety rules around them."""

import copy
import re
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import LoginToken, make_sessionmaker, now
from app.main import COOKIE, create_app

ORIGIN = "http://app.test"


def small_song(title: str = "Test") -> dict:
    cell = {"note": None, "instrument": None, "volume": None, "effect": None, "param": 0}
    macro = {"values": [], "loop": None, "release": None}
    return {
        "version": 1,
        "title": title,
        "bpm": 150,
        "speed": 6,
        "rowsPerBeat": 4,
        "patternLength": 4,
        "instruments": [
            {"name": "Lead", "volume": macro, "duty": macro, "pitch": macro, "arpeggio": macro}
        ],
        "patterns": [
            {
                "channels": [
                    [dict(cell, note=60 if r == 0 else None) for r in range(4)] for _ in range(4)
                ]
            }
        ],
        "order": [0],
        "loopPoint": 0,
    }


@pytest.fixture
def env(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/test.db",
        app_origin=ORIGIN,
        mail_file=str(tmp_path / "mail.txt"),
    )
    return settings, tmp_path / "mail.txt"


def client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings), base_url=ORIGIN, headers={"Origin": ORIGIN})


def last_link(mail) -> str:
    return re.findall(r"http\S+", mail.read_text())[-1]


def sign_in(c: TestClient, mail, email: str = "Ada@Example.com") -> None:
    assert c.post("/api/auth/request", json={"email": email}).status_code == 202
    link = last_link(mail).replace(ORIGIN, "")
    r = c.get(link, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"].endswith("#/account?signed-in=1")


def test_sign_in_with_an_emailed_link(env):
    settings, mail = env
    c = client(settings)
    assert c.get("/api/me").json()["email"] is None
    assert c.get("/api/songs").status_code == 401
    sign_in(c, mail)
    assert c.get("/api/me").json()["email"] == "ada@example.com"


def test_links_work_once(env):
    settings, mail = env
    c = client(settings)
    sign_in(c, mail)
    other = client(settings)
    r = other.get(last_link(mail).replace(ORIGIN, ""), follow_redirects=False)
    assert r.headers["location"].endswith("#/account?error=link")
    assert other.get("/api/me").json()["email"] is None


def test_expired_links_are_refused(env):
    settings, mail = env
    c = client(settings)
    c.post("/api/auth/request", json={"email": "a@b.co"})
    with make_sessionmaker(settings.database_url)() as s:
        for t in s.query(LoginToken):
            t.expires_at = now() - timedelta(minutes=1)
        s.commit()
    r = c.get(last_link(mail).replace(ORIGIN, ""), follow_redirects=False)
    assert r.headers["location"].endswith("error=link")


def test_session_cookie_is_http_only(env):
    settings, mail = env
    c = client(settings)
    c.post("/api/auth/request", json={"email": "a@b.co"})
    r = c.get(last_link(mail).replace(ORIGIN, ""), follow_redirects=False)
    cookie = r.headers["set-cookie"]
    assert COOKIE in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()


def test_rejects_bad_emails_and_rate_limits(env):
    settings, _ = env
    c = client(settings)
    assert c.post("/api/auth/request", json={"email": "not an email"}).status_code == 422
    codes = [c.post("/api/auth/request", json={"email": "spam@b.co"}).status_code for _ in range(6)]
    assert codes == [202] * 5 + [429]


def test_changes_must_come_from_the_app(env):
    settings, mail = env
    c = client(settings)
    sign_in(c, mail)
    evil = {"Origin": "https://evil.example"}
    assert (
        c.put(
            "/api/songs/s1", json={"song": small_song(), "baseVersion": None}, headers=evil
        ).status_code
        == 403
    )
    assert c.post("/api/auth/request", json={"email": "a@b.co"}, headers=evil).status_code == 403


def test_sync_with_versions_and_conflicts(env):
    settings, mail = env
    c = client(settings)
    sign_in(c, mail)
    assert c.put("/api/songs/s1", json={"song": small_song(), "baseVersion": None}).json() == {
        "version": 1
    }
    assert c.get("/api/songs").json()[0]["title"] == "Test"
    assert c.get("/api/songs/s1").json()["song"]["bpm"] == 150

    # Another device edits from version 1 first...
    edited = small_song("Edited elsewhere")
    assert c.put("/api/songs/s1", json={"song": edited, "baseVersion": 1}).json() == {"version": 2}
    # ...so a stale save from version 1 conflicts and gets the server copy back.
    r = c.put("/api/songs/s1", json={"song": small_song("Mine"), "baseVersion": 1})
    assert r.status_code == 409
    assert r.json()["version"] == 2 and r.json()["song"]["title"] == "Edited elsewhere"

    assert c.delete("/api/songs/s1").status_code == 204
    assert c.get("/api/songs/s1").status_code == 404


def test_invalid_and_oversized_songs_are_refused(env):
    settings, mail = env
    c = client(settings)
    sign_in(c, mail)
    bad = small_song()
    bad["order"] = [7]
    r = c.put("/api/songs/s1", json={"song": bad, "baseVersion": None})
    assert r.status_code == 422 and "missing pattern" in r.json()["detail"]
    cells = copy.deepcopy(small_song())
    cells["patterns"][0]["channels"][0][0]["note"] = 500
    assert c.put("/api/songs/s1", json={"song": cells, "baseVersion": None}).status_code == 422
    sid = {**small_song(), "chip": "sid"}
    assert c.put("/api/songs/s1", json={"song": sid, "baseVersion": None}).status_code == 422
    game_boy = {**small_song(), "chip": "gb"}
    assert c.put("/api/songs/gb", json={"song": game_boy, "baseVersion": None}).status_code == 200
    huge = small_song("x" * 100)
    huge["instruments"][0]["name"] = "x" * 3_000_000
    assert c.put("/api/songs/s1", json={"song": huge, "baseVersion": None}).status_code == 413
    assert (
        c.put("/api/songs/bad id!", json={"song": small_song(), "baseVersion": None}).status_code
        == 422
    )


def test_users_only_see_their_own_songs(env):
    settings, mail = env
    ada, bob = client(settings), client(settings)
    sign_in(ada, mail, "ada@x.co")
    sign_in(bob, mail, "bob@x.co")
    ada.put("/api/songs/s1", json={"song": small_song("Ada's"), "baseVersion": None})
    assert bob.get("/api/songs").json() == []
    assert bob.get("/api/songs/s1").status_code == 404
    # Same id, different user: a separate song.
    assert bob.put(
        "/api/songs/s1", json={"song": small_song("Bob's"), "baseVersion": None}
    ).json() == {"version": 1}
    assert ada.get("/api/songs/s1").json()["song"]["title"] == "Ada's"


def test_share_links(env):
    settings, mail = env
    c = client(settings)
    sign_in(c, mail)
    c.put("/api/songs/s1", json={"song": small_song("Shared tune"), "baseVersion": None})
    slug = c.post("/api/songs/s1/share").json()["slug"]
    assert c.post("/api/songs/s1/share").json()["slug"] == slug, "sharing twice keeps the link"
    anonymous = TestClient(create_app(settings), base_url=ORIGIN)
    assert anonymous.get(f"/api/shared/{slug}").json()["title"] == "Shared tune"
    c.delete("/api/songs/s1/share")
    assert anonymous.get(f"/api/shared/{slug}").status_code == 404


def test_sfx_library_sync(env):
    settings, mail = env
    c = client(settings)
    sign_in(c, mail)
    assert c.get("/api/sfx-library").json() == {"version": 0, "library": None}
    lib = {"entries": [{"name": "Coin 1"}]}
    assert c.put("/api/sfx-library", json={"library": lib, "baseVersion": 0}).json() == {
        "version": 1
    }
    assert c.put("/api/sfx-library", json={"library": lib, "baseVersion": 0}).status_code == 409
    assert c.put("/api/sfx-library", json={"library": "nope", "baseVersion": 1}).status_code == 422


def test_sign_out_ends_the_session(env):
    settings, mail = env
    c = client(settings)
    sign_in(c, mail)
    assert c.post("/api/auth/logout").status_code == 200
    assert c.get("/api/me").json()["email"] is None
    assert c.get("/api/songs").status_code == 401
