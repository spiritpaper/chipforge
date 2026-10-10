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
  limits and prices (in the gateway's currency, IRR for ZarinPal). To change them,
  copy the file to the data volume (`docker compose cp plans.json api:/data/plans.json`)
  and set `PLANS_FILE=/data/plans.json`.
- **Payments** go through [ZarinPal](https://www.zarinpal.com/). Set
  `ZARINPAL_MERCHANT_ID`. Plans are prepaid: each payment adds a month or a year,
  and nothing renews by itself. Without a merchant ID the plans still apply, but
  the app says payments aren't set up.
- **Test first** with `ZARINPAL_SANDBOX=1` and a sandbox merchant ID. The gateway
  code follows ZarinPal's v4 REST API but has only been tested against a fake gateway.
  Before taking real money, check it against ZarinPal's current documentation and
  make a full sandbox payment: pay, cancel and fail one each.
- **Grant a plan by hand** (refunds, gifts, testers):
  `docker compose exec api python -m app.admin grant someone@example.com supporter 31`.
  `show someone@example.com` prints their plan and payments.

Over the limit, songs stay on the user's device and the app says why; nothing is
deleted when a plan runs out.

## Back up and update

- Back up: `docker compose cp api:/data/chipforge.db ./chipforge-backup.db`
- Update: `git pull && docker compose up -d --build`

Your users' songs also stay in their browsers, so the server is a sync copy rather
than the only one.
