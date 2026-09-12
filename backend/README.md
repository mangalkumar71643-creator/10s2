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
| Auth (email) | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Auth (phone) | `POST /auth/phone/verify` — used by the mobile app; see below |
| KYC | `POST /kyc/submit`, `GET /kyc/status` |
| Wallet | `GET /wallet`, `POST /wallet/deposit`, `POST /wallet/withdraw`, `GET /wallet/transactions` |
| Sports | `GET /sports`, `GET /sports/:sportId/events`, `GET /sports/events/:eventId` |
| Bets | `POST /bets`, `GET /bets` |
| Games (real-money) | `GET /games/config`, `POST /games/:gameKey/play`, `GET /games/history`, `GET /games/daily-bonus/status`, `POST /games/daily-bonus/claim` |
| Provably fair | `GET /games/fairness`, `PUT /games/fairness/client-seed`, `POST /games/fairness/rotate`, `GET /games/fairness/history` |
| Responsible gambling | `PUT /responsible-gambling/deposit-limits`, `POST /responsible-gambling/self-exclude` |
| Admin (role=ADMIN) | `/admin/sports`, `/admin/events`, `/admin/markets`, `/admin/selections/:id/odds`, `/admin/markets/:id/settle`, `/admin/users`, `/admin/kyc/:userId`, `/admin/bets`, `/admin/reports/summary` |

All authenticated routes take `Authorization: Bearer <token>` from
`/auth/login`, `/auth/register` or `/auth/phone/verify`.

### Phone auth (`POST /auth/phone/verify`)

Body: `{ idToken, firstName?, lastName?, dateOfBirth?, country? }`. In
`PHONE_AUTH_MODE=mock` (default), `idToken` is just the E.164 phone number —
nothing is actually verified, so this must never be used with real users.
In `PHONE_AUTH_MODE=live` it's a real Firebase ID token, checked
server-side (once you implement `LiveFirebasePhoneVerifier` in
`src/services/phoneAuthService.ts` with `firebase-admin`). A brand-new
phone number without the optional profile fields gets `428
{"error":"profile_required"}` — resend with those fields to create the
account (18+ enforced here too).

### Games (`POST /games/:gameKey/play`)

Body: `{ stake, gameType: "coinflip" | "dice", target? }` (`target`, 2-98,
only applies to `dice` — the roll-under number the player picked; its
payout multiplier is always `rtp * 100 / target` so every target has the
same expected value). Outcomes are computed via
`src/services/fairnessService.ts` + `src/utils/rng.ts`: a secret
per-user server seed (committed via its SHA-256 hash, exposed through
`GET /games/fairness`) combined with a client seed and an incrementing
nonce through HMAC-SHA256. Rotating the seed (`POST
/games/fairness/rotate`) reveals the old one so every round played under
its hash can be recomputed and verified independently. This proves the
*process* wasn't tampered with — it is not the same as accredited RNG
certification, which a real licence still requires.

## KYC, payments & phone auth are mocked

`src/services/kycService.ts`, `src/services/paymentService.ts` and
`src/services/phoneAuthService.ts` each export an interface plus a
`Mock*`/dev implementation used by default
(`KYC_PROVIDER_MODE`/`PAYMENT_PROVIDER_MODE`/`PHONE_AUTH_MODE=mock`). No
real money, real identity data, or real SMS verification ever happens
through these. Before accepting real users, implement the `Live*` classes
against a licensed KYC vendor, a gambling-licensed payment processor, and
Firebase Admin, then flip the mode env vars to `live`. See the root
`README.md` for the full compliance checklist, including the RNG
certification requirement for `/games/:gameKey/play`.
