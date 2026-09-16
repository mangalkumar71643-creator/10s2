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
    // Return-to-player: long-run share of total stakes paid back as winnings.
    rtp: Number(process.env.GAME_RTP ?? 0.92),
    // Win pays out at this multiple of the stake; win probability is derived
    // from rtp / winMultiplier so the long-run expected value matches rtp.
    winMultiplier: Number(process.env.GAME_WIN_MULTIPLIER ?? 2),
  },

  wallet: {
    // First-deposit-only bonus: min(amount * percent, cap). Credited
    // straight into balance (so it's immediately playable) but locked
    // from withdrawal until wageringMultiplier x the bonus is staked —
    // see paymentService.ts / gameEngineService.ts.
    firstDepositBonusPercent: Number(process.env.FIRST_DEPOSIT_BONUS_PERCENT ?? 0.15),
    firstDepositBonusCap: Number(process.env.FIRST_DEPOSIT_BONUS_CAP ?? 500),
    wageringMultiplier: Number(process.env.WAGERING_MULTIPLIER ?? 3),
    // Total COMPLETED withdrawals per calendar day, across all payment
    // methods, enforced server-side in wallet.routes.ts.
    dailyWithdrawalLimit: Number(process.env.DAILY_WITHDRAWAL_LIMIT ?? 50000),
  },
};
