# ApnaPay UK — DEMO (no real money)

A demo of a UK bank-transfer payment desk:

- **Admin panel** (`/admin`): UK bank accounts (sort code + account number) with LIVE/OFF switches, a share of orders and daily limits for each account, orders, payment links, bank notifications, a payment simulator, API keys, webhooks, Telegram alerts and 2FA.
- **Payment page** (`/pay/:id`): shows the account name, sort code, account number and a unique reference like `AP7KQ2XM`. A **Simulate bank transfer** button stands in for a real bank.
- **Merchant API** (`/api/v1/orders`) with Bearer keys (`ak_demo_…`) and HMAC-signed `order.paid` webhooks.
- **Demo shop** (`/shop`): a built-in "product website". Buying an item goes through the API, and the signed webhook marks the item SOLD.

No bank is connected. Every payment is simulated.

## Run

```
npm install
npm start        # http://localhost:3000
npm test
```

`DATABASE_URL` (Neon / Postgres) is optional. Without it, a built-in PGlite database is used. On Vercel that database lives in `/tmp`, so it resets now and then.

## API

```
POST /api/v1/orders                 { "amount": 24.99, "reference": "INV-1", "customer": {...}, "return_url": "..." }
GET  /api/v1/orders/{id}
GET  /api/v1/orders?reference=INV-1
POST /api/v1/orders/{id}/cancel
```

Every webhook is a `POST` with these headers:

- `X-ApnaPay-Event`
- `X-ApnaPay-Timestamp`
- `X-ApnaPay-Signature: sha256=HMAC(secret, timestamp + "." + body)`
