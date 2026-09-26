import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  kycProviderMode: (process.env.KYC_PROVIDER_MODE ?? "mock") as "mock" | "live",
  paymentProviderMode: (process.env.PAYMENT_PROVIDER_MODE ?? "mock") as "mock" | "live",
  smsProviderMode: (process.env.SMS_PROVIDER_MODE ?? "mock") as "mock" | "live",

  games: {
    minStake: Number(process.env.GAME_MIN_STAKE ?? 1),
    maxStake: Number(process.env.GAME_MAX_STAKE ?? 500),
    // Return-to-player: long-run share of total stakes paid back as winnings
    // (0.90 = a 10% house edge on Win Go, Aviator, Chicken Road, Mines and dice).
    rtp: Number(process.env.GAME_RTP ?? 0.9),
    // 7 Up Down runs its own, higher edge (0.85 = 15%).
    sevenUpDownRtp: Number(process.env.SEVEN_UP_DOWN_RTP ?? 0.85),
    // Win pays out at this multiple of the stake; win probability is derived
    // from rtp / winMultiplier so the long-run expected value matches rtp.
    winMultiplier: Number(process.env.GAME_WIN_MULTIPLIER ?? 2),
    // Most a single Chicken Road round can pay out, whatever the stake and
    // multiplier — bounds the house's worst single-round loss.
    maxPayout: Number(process.env.GAME_MAX_PAYOUT ?? 10000),
  },

  tron: {
    // Trx Win Go reads its results from TRON blocks through a full node API.
    // TronGrid works without a key at low volume; set TRONGRID_API_KEY for
    // its higher rate limits.
    apiUrl: process.env.TRON_API_URL ?? "https://api.trongrid.io",
    apiKey: process.env.TRONGRID_API_KEY ?? "",
  },

  wallet: {
    // First-deposit-only bonus: min(amount * percent, cap). Credited
    // straight into balance (so it's immediately playable) but locked
    // from withdrawal until wageringMultiplier x the bonus is staked —
    // see paymentService.ts and each game service (e.g. vortexService.ts).
    firstDepositBonusPercent: Number(process.env.FIRST_DEPOSIT_BONUS_PERCENT ?? 0.15),
    firstDepositBonusCap: Number(process.env.FIRST_DEPOSIT_BONUS_CAP ?? 500),
    wageringMultiplier: Number(process.env.WAGERING_MULTIPLIER ?? 3),
    // Total COMPLETED withdrawals per calendar day, across all payment
    // methods, enforced server-side in wallet.routes.ts.
    dailyWithdrawalLimit: Number(process.env.DAILY_WITHDRAWAL_LIMIT ?? 50000),
  },
};
