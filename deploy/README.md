# Self-hosting ChipForge

Run your own ChipForge with accounts, sync across devices and share links. You need
Docker with Compose.

```sh
cd deploy
cp .env.example .env      # then edit it
docker compose up -d --build
./smoke.sh                # optional: checks the app, the API and signing in
```

Open <http://localhost:8080>. Until email is set up, sign-in links are printed in
`docker compose logs api`, which is fine for a home server.

## On a server with a domain

1. Point the domain's DNS at the server and open ports 80 and 443.
2. In `.env`: `CHIPFORGE_SITE=music.example.com`, `APP_ORIGIN=https://music.example.com`,
   `HTTP_PORT=80`, `HTTPS_PORT=443`.
3. Fill in the `SMTP_*` settings so sign-in links arrive by email.
4. `docker compose up -d --build`. Caddy gets and renews the HTTPS certificate.

`APP_ORIGIN` must be exactly the address people use: the server only accepts changes
from that origin, and sign-in links point there.

## What runs

| Service | What | Data |
|---|---|---|
| `web` | Caddy: serves the app, proxies `/api`, handles HTTPS | `caddy_data` volume (certificates) |
| `api` | The ChipForge server (FastAPI) | `chipforge_data` volume: `chipforge.db` (SQLite) |

To use Postgres instead of SQLite, set `DATABASE_URL` for the `api` service (for
example `postgresql+psycopg://user:pass@db/chipforge`) and add the driver to
`api/pyproject.toml`.

## Paid plans

Off by default: on a self-hosted server everyone gets every feature with no limits.
To sell plans (as the hosted ChipForge does), set `BILLING_ENABLED=1`.

- **Plans** come from `api/app/plans.default.json`: Free, Supporter and Pro, with their
  limits and a price list per currency: `IRR` for ZarinPal, `USD` (or your
  `BTCPAY_CURRENCY`) for crypto. The prices are placeholders. To change them,
  copy the file to the data volume (`docker compose cp plans.json api:/data/plans.json`)
  and set `PLANS_FILE=/data/plans.json`.
- **Payments**: card payments through [ZarinPal](https://www.zarinpal.com/) (set
  `ZARINPAL_MERCHANT_ID`) and crypto through BTCPay Server (below). Set up either or
  both; buyers choose. Plans are prepaid: each payment adds a month or a year, and
  nothing renews by itself. With neither set up the plans still apply, but the app
  says payments aren't set up.
- **Test first** with `ZARINPAL_SANDBOX=1` and a sandbox merchant ID. The gateway
  code follows ZarinPal's v4 REST API but has only been tested against a fake gateway.
  Before taking real money, check it against ZarinPal's current documentation and
  make a full sandbox payment: pay, cancel and fail one each.
- **Grant a plan by hand** (refunds, gifts, testers):
  `docker compose exec api python -m app.admin grant someone@example.com supporter 31`.
  `show someone@example.com` prints their plan and payments.

### Crypto payments (BTCPay Server)

[BTCPay Server](https://btcpayserver.org/) is free, open-source payment software you
run yourself, or rent from a BTCPay host. Payments go straight to your own wallet,
with no company in between and no account to get approved. It takes Bitcoin and
Lightning out of the box, and other coins through plugins.

1. Set up BTCPay Server and a store, and connect a wallet to the store.
2. Under your account, **API Keys → Generate Key**, with the permissions to create
   and to view invoices, limited to this store. Set `BTCPAY_URL`, `BTCPAY_API_KEY`,
   and `BTCPAY_STORE_ID` (shown in the store's general settings).
3. In the store's settings, **Webhooks → Create webhook**, with the payload URL
   `https://your-chipforge-domain/api/billing/btcpay/webhook` and all events. Copy its
   secret into `BTCPAY_WEBHOOK_SECRET`.
4. Prices are in `BTCPAY_CURRENCY` (USD by default; BTCPay converts at checkout).

A crypto payment can take a while to confirm. Buyers who come back before then see
"waiting for it to confirm", and the webhook switches their plan on once it settles.
Only settled invoices for exactly the amount asked count; an invoice that expires
part-paid is marked failed, and you refund it from BTCPay. As with ZarinPal, this was
tested against a stand-in for BTCPay's API, so make a test payment on your BTCPay
(testnet, or a small real one) before announcing it.

Over the limit, songs stay on the user's device and the app says why; nothing is
deleted when a plan runs out.

## Back up and update

- Back up: `docker compose cp api:/data/chipforge.db ./chipforge-backup.db`
- Update: `git pull && docker compose up -d --build`

Your users' songs also stay in their browsers, so the server is a sync copy rather
than the only one.
