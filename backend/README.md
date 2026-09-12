# NovaPlay backend

Node.js + TypeScript + Express + PostgreSQL (Prisma).

## Setup

```bash
cp .env.example .env   # then edit DATABASE_URL / JWT_SECRET
npm install
npm run prisma:migrate  # creates tables
npm run prisma:seed     # creates an admin user + a sample football event
npm run dev              # http://localhost:4000
```

Default seeded admin: `admin@novaplay.test` / `ChangeMe123!` — change the
password immediately in a real environment.

## API overview

| Area | Routes |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| KYC | `POST /kyc/submit`, `GET /kyc/status` |
| Wallet | `GET /wallet`, `POST /wallet/deposit`, `POST /wallet/withdraw`, `GET /wallet/transactions` |
| Sports | `GET /sports`, `GET /sports/:sportId/events`, `GET /sports/events/:eventId` |
| Bets | `POST /bets`, `GET /bets` |
| Responsible gambling | `PUT /responsible-gambling/deposit-limits`, `POST /responsible-gambling/self-exclude` |
| Admin (role=ADMIN) | `/admin/sports`, `/admin/events`, `/admin/markets`, `/admin/selections/:id/odds`, `/admin/markets/:id/settle`, `/admin/users`, `/admin/kyc/:userId`, `/admin/bets`, `/admin/reports/summary` |

All authenticated routes take `Authorization: Bearer <token>` from
`/auth/login` or `/auth/register`.

## KYC & payments are mocked

`src/services/kycService.ts` and `src/services/paymentService.ts` each
export an interface plus a `Mock*Provider` used when
`KYC_PROVIDER_MODE`/`PAYMENT_PROVIDER_MODE` are `mock` (the default). No
real money or real identity data ever moves through these. Before
accepting real users, implement the `Live*Provider` classes against a
licensed KYC vendor and a gambling-licensed payment processor, and flip
the mode env vars to `live`. See the root `README.md` for the full
compliance checklist.
