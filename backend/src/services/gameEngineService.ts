import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { secureRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * Real-money "play a game" wagering engine. The RNG here is a simple,
 * honest server-side implementation (crypto-random, computed server-side
 * so the client can never influence or predict it) — but it is NOT
 * independently certified. Real gambling licences require RNG
 * certification from an accredited testing lab (e.g. GLI, iTech Labs)
 * before this can be used with real customers. See root README.
 */
export async function playGame(userId: string, gameKey: string, stake: number) {
  await assertCanTransact(userId);

  const { minStake, maxStake, rtp, winMultiplier } = env.games;
  if (stake < minStake || stake > maxStake) {
    throw new ApiError(400, `Stake must be between ${minStake} and ${maxStake}.`);
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  if (Number(wallet.balance) < stake) {
    throw new ApiError(400, "Insufficient balance");
  }

  const winProbability = rtp / winMultiplier;
  const won = secureRandomFloat() < winProbability;
  const payout = won ? Math.round(stake * winMultiplier * 100) / 100 : 0;

  await prisma.$transaction([
    prisma.wallet.update({ where: { userId }, data: { balance: { decrement: stake } } }),
    prisma.transaction.create({
      data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" },
    }),
  ]);

  if (won) {
    await prisma.$transaction([
      prisma.wallet.update({ where: { userId }, data: { balance: { increment: payout } } }),
      prisma.transaction.create({
        data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" },
      }),
    ]);
  }

  const round = await prisma.gameRound.create({
    data: {
      userId,
      gameKey,
      stake,
      multiplier: won ? winMultiplier : 0,
      payout,
      won,
    },
  });

  const updatedWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return { round, newBalance: updatedWallet.balance };
}

// Mirrors mobile/src/data/mockData.ts's `dailyRewardTrack` so the UI's
// 7-day track always matches what's actually credited. Tune both together —
// these are real-money amounts once PAYMENT_PROVIDER_MODE=live.
const DAILY_REWARD_TABLE = [100, 150, 200, 250, 350, 500, 1000];

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** Server-authoritative daily login bonus — fixed reward table, streak
 * tracked on the user record so the client cannot claim more than once a
 * day or dictate the amount. */
export async function claimDailyBonus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = new Date();

  if (user.lastDailyClaimAt && isSameCalendarDay(user.lastDailyClaimAt, now)) {
    throw new ApiError(409, "Daily reward already claimed today.");
  }

  const missedADay =
    user.lastDailyClaimAt !== null &&
    now.getTime() - user.lastDailyClaimAt.getTime() > 1000 * 60 * 60 * 48;
  const nextStreak = missedADay || !user.lastDailyClaimAt ? 1 : user.dailyStreak + 1;
  const amount = DAILY_REWARD_TABLE[(nextStreak - 1) % DAILY_REWARD_TABLE.length];

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { dailyStreak: nextStreak, lastDailyClaimAt: now },
    }),
    prisma.wallet.update({ where: { userId }, data: { balance: { increment: amount } } }),
    prisma.transaction.create({
      data: { userId, type: "BONUS", amount, status: "COMPLETED" },
    }),
  ]);

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return { streak: nextStreak, amount, newBalance: wallet.balance };
}
