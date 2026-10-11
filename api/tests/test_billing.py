"""Plans, limits and paying for a period with a gateway (ZarinPal and BTCPay, faked)."""

import hashlib
import hmac
import json
import re
from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.billing import BTCPay, GatewayError, Verified, ZarinPal
from app.config import Settings
from app.db import Payment, User, make_sessionmaker, now
from app.main import create_app

from .test_api import ORIGIN, small_song

ADA = "ada@example.com"


class FakeGateway:
    """ZarinPal's flow without the network."""

    name = "zarinpal"
    label = "Card (ZarinPal)"
    currency = "IRR"
    return_url = ZarinPal.return_url

    def __init__(self) -> None:
        self.paid: set[str] = set()
        self.verified: list[tuple[str, Decimal]] = []
        self.down = False
        self.n = 0

    def start(self, payment_id, amount, description, return_url, email):
        self.n += 1
        ref = f"A{self.n:035d}"
        self.callback_url = return_url
        return ref, f"https://gateway.test/StartPay/{ref}"

    def verify(self, reference, amount):
        if self.down:
            raise GatewayError("down")
        self.verified.append((reference, amount))
        return Verified("paid", "12345") if reference in self.paid else Verified("failed")


class FakeBTCPay:
    """A BTCPay Server: invoices whose status the test sets."""

    def __init__(self) -> None:
        self.invoices: dict[str, dict] = {}

    def __call__(self, method, url, body, headers):
        assert headers == {"Authorization": "token key-1"}
        if method == "POST":
            assert url == "https://pay.test/api/v1/stores/store-1/invoices"
            invoice_id = f"inv{len(self.invoices) + 1}"
            self.invoices[invoice_id] = {**body, "id": invoice_id, "status": "New"}
            return {**self.invoices[invoice_id], "checkoutLink": f"https://pay.test/i/{invoice_id}"}
        invoice_id = url.rsplit("/", 1)[1]
        if invoice_id not in self.invoices:
            raise GatewayError("gateway answered 404")
        return self.invoices[invoice_id]


@pytest.fixture
def env(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/t.db",
        app_origin=ORIGIN,
        mail_file=str(tmp_path / "mail.txt"),
        billing_enabled=True,
    )
    gateway = FakeGateway()
    c = TestClient(create_app(settings, [gateway]), base_url=ORIGIN, headers={"Origin": ORIGIN})
    c.post("/api/auth/request", json={"email": ADA})
    link = re.findall(r"http\S+", (tmp_path / "mail.txt").read_text())[-1]
    c.get(link.replace(ORIGIN, ""), follow_redirects=False)
    return c, gateway, settings


def put(c, i):
    return c.put(f"/api/songs/s{i}", json={"song": small_song(f"Song {i}"), "baseVersion": None})


def test_free_plan_limits_synced_songs_and_sharing(env):
    c, _, _ = env
    me = c.get("/api/me").json()
    assert me["plan"]["id"] == "free" and me["plan"]["maxSongs"] == 10
    assert [p["id"] for p in me["billing"]["plans"]] == ["free", "supporter", "pro"]
    for i in range(10):
        assert put(c, i).status_code == 200
    r = put(c, 10)
    assert r.status_code == 402 and r.json()["limit"] == "songs"
    assert "up to 10 songs" in r.json()["detail"]
    # Editing a song already synced is always fine.
    assert (
        c.put("/api/songs/s0", json={"song": small_song("Edited"), "baseVersion": 1}).status_code
        == 200
    )
    r = c.post("/api/songs/s0/share")
    assert r.status_code == 402 and r.json()["limit"] == "share"
    assert c.get("/api/me").json()["usage"] == {"songs": 10}


def test_paying_buys_a_period_of_a_plan(env):
    c, gateway, _ = env
    r = c.post("/api/billing/checkout", json={"plan": "supporter", "period": "month"})
    url = r.json()["url"]
    ref = url.rsplit("/", 1)[1]
    assert gateway.callback_url == f"{ORIGIN}/api/billing/zarinpal/callback"
    gateway.paid.add(ref)
    r = c.get(f"/api/billing/zarinpal/callback?Authority={ref}&Status=OK", follow_redirects=False)
    assert r.headers["location"].endswith("#/account?payment=ok")
    # Verified with the amount from our records.
    assert gateway.verified == [(ref, Decimal(1_000_000))]
    me = c.get("/api/me").json()
    assert me["plan"]["id"] == "supporter" and me["plan"]["until"]
    for i in range(12):
        assert put(c, i).status_code == 200
    assert c.post("/api/songs/s0/share").status_code == 200

    # A repeated callback doesn't add another month.
    until = me["plan"]["until"]
    c.get(f"/api/billing/zarinpal/callback?Authority={ref}&Status=OK", follow_redirects=False)
    assert c.get("/api/me").json()["plan"]["until"] == until


def test_a_second_payment_extends_the_same_plan(env):
    c, gateway, settings = env
    for _ in range(2):
        ref = (
            c.post("/api/billing/checkout", json={"plan": "supporter", "period": "month"})
            .json()["url"]
            .rsplit("/", 1)[1]
        )
        gateway.paid.add(ref)
        c.get(f"/api/billing/zarinpal/callback?Authority={ref}&Status=OK", follow_redirects=False)
    with make_sessionmaker(settings.database_url)() as s:
        user = s.query(User).filter_by(email=ADA).one()
        days = (user.plan_until.replace(tzinfo=now().tzinfo) - now()).days
    assert 60 <= days <= 62


def test_cancelled_failed_and_unreachable_payments(env):
    c, gateway, settings = env
    ref = (
        c.post("/api/billing/checkout", json={"plan": "pro", "period": "year"})
        .json()["url"]
        .rsplit("/", 1)[1]
    )
    r = c.get(f"/api/billing/zarinpal/callback?Authority={ref}&Status=NOK", follow_redirects=False)
    assert r.headers["location"].endswith("payment=cancelled")
    ref2 = (
        c.post("/api/billing/checkout", json={"plan": "pro", "period": "year"})
        .json()["url"]
        .rsplit("/", 1)[1]
    )
    gateway.down = True
    r = c.get(f"/api/billing/zarinpal/callback?Authority={ref2}&Status=OK", follow_redirects=False)
    assert r.headers["location"].endswith("payment=error")
    gateway.down = False
    r = c.get(f"/api/billing/zarinpal/callback?Authority={ref2}&Status=OK", follow_redirects=False)
    assert r.headers["location"].endswith("payment=failed"), "verified, but never paid"
    r = c.get("/api/billing/zarinpal/callback?Authority=nope&Status=OK", follow_redirects=False)
    assert r.headers["location"].endswith("payment=unknown")
    assert c.get("/api/me").json()["plan"]["id"] == "free"
    with make_sessionmaker(settings.database_url)() as s:
        assert sorted(p.status for p in s.query(Payment)) == ["cancelled", "failed"]


def test_rejects_unknown_plans_and_periods(env):
    c, _, _ = env
    assert (
        c.post("/api/billing/checkout", json={"plan": "free", "period": "month"}).status_code == 422
    )
    assert (
        c.post("/api/billing/checkout", json={"plan": "gold", "period": "month"}).status_code == 422
    )
    assert (
        c.post("/api/billing/checkout", json={"plan": "pro", "period": "week"}).status_code == 422
    )


def test_expired_plans_fall_back_to_free(env):
    c, _, settings = env
    with make_sessionmaker(settings.database_url)() as s:
        user = s.query(User).filter_by(email=ADA).one()
        user.plan, user.plan_until = "pro", now() - timedelta(days=1)
        s.commit()
    assert c.get("/api/me").json()["plan"]["id"] == "free"


def test_self_hosted_servers_have_no_limits(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/t.db",
        app_origin=ORIGIN,
        mail_file=str(tmp_path / "m.txt"),
    )
    c = TestClient(create_app(settings), base_url=ORIGIN, headers={"Origin": ORIGIN})
    c.post("/api/auth/request", json={"email": ADA})
    c.get(
        re.findall(r"http\S+", (tmp_path / "m.txt").read_text())[-1].replace(ORIGIN, ""),
        follow_redirects=False,
    )
    for i in range(12):
        assert put(c, i).status_code == 200
    assert c.post("/api/songs/s0/share").status_code == 200
    me = c.get("/api/me").json()
    assert me["plan"]["id"] == "unlimited" and me["billing"]["enabled"] is False
    assert (
        c.post("/api/billing/checkout", json={"plan": "pro", "period": "year"}).status_code == 503
    )


def test_zarinpal_speaks_its_v4_api():
    calls = []

    def post(url, body):
        calls.append((url, body))
        if url.endswith("request.json"):
            return {
                "data": {"code": 100, "authority": "A0000000000000000000000000000012345"},
                "errors": [],
            }
        return {"data": {"code": 100, "ref_id": 201}, "errors": []}

    z = ZarinPal("merchant-123", sandbox=True, post=post)
    ref, url = z.start("p1", Decimal(1_000_000), "ChipForge Supporter", "https://app/cb", "a@b.co")
    assert url == "https://sandbox.zarinpal.com/pg/StartPay/A0000000000000000000000000000012345"
    assert calls[0][0] == "https://sandbox.zarinpal.com/pg/v4/payment/request.json"
    assert calls[0][1] == {
        "merchant_id": "merchant-123",
        "amount": 1_000_000,
        "currency": "IRR",
        "description": "ChipForge Supporter",
        "callback_url": "https://app/cb",
        "metadata": {"email": "a@b.co", "order_id": "p1"},
    }
    assert z.verify(ref, Decimal(1_000_000)) == Verified("paid", "201")
    assert calls[1][1] == {"merchant_id": "merchant-123", "amount": 1_000_000, "authority": ref}


def test_zarinpal_errors_are_reported():
    z = ZarinPal(
        "m",
        post=lambda url, body: {"data": [], "errors": {"code": -9, "message": "validation error"}},
    )
    with pytest.raises(GatewayError, match="refused"):
        z.start("p1", Decimal(1000), "x", "https://cb", "a@b.co")
    assert z.verify("A1", Decimal(1000)) == Verified("failed")
    paid_before = ZarinPal("m", post=lambda url, body: {"data": {"code": 101, "ref_id": 9}})
    assert paid_before.verify("A1", Decimal(1000)).ok, "101 means it was already verified"


SECRET = "whsec-test"


@pytest.fixture
def crypto(tmp_path):
    """A server selling plans through both ZarinPal and BTCPay, signed in as Ada."""
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/t.db",
        app_origin=ORIGIN,
        mail_file=str(tmp_path / "mail.txt"),
        billing_enabled=True,
        btcpay_webhook_secret=SECRET,
    )
    btcpay = FakeBTCPay()
    gateways = [FakeGateway(), BTCPay("https://pay.test/", "store-1", "key-1", request=btcpay)]
    c = TestClient(create_app(settings, gateways), base_url=ORIGIN, headers={"Origin": ORIGIN})
    c.post("/api/auth/request", json={"email": ADA})
    link = re.findall(r"http\S+", (tmp_path / "mail.txt").read_text())[-1]
    c.get(link.replace(ORIGIN, ""), follow_redirects=False)
    return c, btcpay, settings


def webhook(c, invoice_id, secret=SECRET, kind="InvoiceSettled"):
    body = json.dumps({"type": kind, "invoiceId": invoice_id, "storeId": "store-1"}).encode()
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    # BTCPay posts from its own server: no Origin header.
    return c.post(
        "/api/billing/btcpay/webhook",
        content=body,
        headers={"BTCPay-Sig": sig, "Origin": "", "Content-Type": "application/json"},
    )


def buy_with_crypto(c, plan="supporter", period="month"):
    r = c.post("/api/billing/checkout", json={"plan": plan, "period": period, "gateway": "btcpay"})
    assert r.status_code == 200, r.text
    return r.json()["url"].rsplit("/", 1)[1]


def test_both_gateways_are_offered_with_their_own_prices(crypto):
    c, btcpay, _ = crypto
    billing = c.get("/api/me").json()["billing"]
    assert billing["gateways"] == [
        {"id": "zarinpal", "label": "Card (ZarinPal)", "currency": "IRR"},
        {"id": "btcpay", "label": "Crypto (BTCPay)", "currency": "USD"},
    ]
    supporter = next(p for p in billing["plans"] if p["id"] == "supporter")
    assert supporter["prices"] == {
        "IRR": {"month": 1_000_000, "year": 10_000_000},
        "USD": {"month": 3, "year": 30},
    }
    invoice = btcpay.invoices[buy_with_crypto(c, "pro", "year")]
    assert invoice["amount"] == "80" and invoice["currency"] == "USD"
    assert invoice["checkout"]["redirectURL"].startswith(f"{ORIGIN}/api/billing/btcpay/return?")
    assert invoice["metadata"]["buyerEmail"] == ADA
    r = c.post("/api/billing/checkout", json={"plan": "pro", "period": "year", "gateway": "x"})
    assert r.status_code == 422


def test_crypto_payment_settles_on_return(crypto):
    c, btcpay, _ = crypto
    invoice_id = buy_with_crypto(c)
    payment_id = btcpay.invoices[invoice_id]["metadata"]["orderId"]
    back = f"/api/billing/btcpay/return?payment={payment_id}"
    # Back from the checkout before paying: still open.
    assert c.get(back, follow_redirects=False).headers["location"].endswith("payment=pending")
    btcpay.invoices[invoice_id]["status"] = "Settled"
    assert c.get(back, follow_redirects=False).headers["location"].endswith("payment=ok")
    me = c.get("/api/me").json()
    assert me["plan"]["id"] == "supporter"
    # Coming back again doesn't add another month.
    c.get(back, follow_redirects=False)
    assert c.get("/api/me").json()["plan"]["until"] == me["plan"]["until"]


def test_crypto_payment_confirmed_later_by_webhook(crypto):
    c, btcpay, settings = crypto
    invoice_id = buy_with_crypto(c)
    btcpay.invoices[invoice_id]["status"] = "Processing"
    payment_id = btcpay.invoices[invoice_id]["metadata"]["orderId"]
    r = c.get(f"/api/billing/btcpay/return?payment={payment_id}", follow_redirects=False)
    assert r.headers["location"].endswith("payment=pending")
    assert c.get("/api/me").json()["plan"]["id"] == "free"

    btcpay.invoices[invoice_id]["status"] = "Settled"
    assert webhook(c, invoice_id, secret="wrong").status_code == 401
    assert c.get("/api/me").json()["plan"]["id"] == "free"
    assert webhook(c, invoice_id).status_code == 200
    assert c.get("/api/me").json()["plan"]["id"] == "supporter"
    # A redelivered webhook is harmless.
    until = c.get("/api/me").json()["plan"]["until"]
    assert webhook(c, invoice_id).status_code == 200
    assert c.get("/api/me").json()["plan"]["until"] == until
    with make_sessionmaker(settings.database_url)() as s:
        payment = s.get(Payment, payment_id)
        assert (payment.status, payment.amount, payment.currency) == ("paid", "3", "USD")


def test_crypto_payments_that_expire_or_dont_match(crypto):
    c, btcpay, _ = crypto
    expired = buy_with_crypto(c)
    btcpay.invoices[expired]["status"] = "Expired"
    partial = buy_with_crypto(c)
    btcpay.invoices[partial].update(status="Expired", additionalStatus="PaidPartial")
    # Settled, but for a different amount than we asked for: not accepted.
    tampered = buy_with_crypto(c)
    btcpay.invoices[tampered].update(status="Settled", amount="0.01")
    for invoice_id, result in [(expired, "cancelled"), (partial, "failed"), (tampered, "failed")]:
        payment_id = btcpay.invoices[invoice_id]["metadata"]["orderId"]
        r = c.get(f"/api/billing/btcpay/return?payment={payment_id}", follow_redirects=False)
        assert r.headers["location"].endswith(f"payment={result}"), invoice_id
    assert c.get("/api/me").json()["plan"]["id"] == "free"
    r = c.get("/api/billing/btcpay/return?payment=nope", follow_redirects=False)
    assert r.headers["location"].endswith("payment=unknown")
    # Webhooks for invoices that aren't ours are acknowledged and ignored.
    assert webhook(c, "someone-elses").status_code == 200


def test_webhooks_are_refused_without_a_secret(env):
    c, _, _ = env
    assert webhook(c, "inv1").status_code == 401


def test_old_single_currency_plans_files_still_load(tmp_path):
    from app.plans import load_plans

    f = tmp_path / "plans.json"
    f.write_text(
        json.dumps(
            {
                "currency": "IRR",
                "plans": [
                    {
                        "id": "free",
                        "name": "Free",
                        "maxSongs": 5,
                        "share": False,
                        "gpuConversion": False,
                        "badge": False,
                    },
                    {
                        "id": "fan",
                        "name": "Fan",
                        "maxSongs": None,
                        "share": True,
                        "gpuConversion": False,
                        "badge": True,
                        "prices": {"month": 500000},
                    },
                ],
            }
        )
    )
    plans = load_plans(True, str(f))
    assert plans.plans["fan"].price("IRR", "month") == Decimal(500000)
    assert plans.plans["free"].max_songs == 5
