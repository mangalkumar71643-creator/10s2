import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

export type GameType = "coinflip" | "dice";

export interface PlayGameInput {
  userId: string;
  gameKey: string;
  gameType: GameType;
  stake: number;
  /** dice only: roll-under target, 2-98. Lower target = lower win chance,
   * higher multiplier. */
  target?: number;
}

const DICE_MIN_TARGET = 2;
const DICE_MAX_TARGET = 98;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Real-money "play a game" wagering engine. Outcomes are provably fair
 * (see fairnessService.ts / rng.ts) — computed server-side from a secret
 * seed the client cannot see or influence in advance, but independently
 * verifiable once that seed is later revealed. This is NOT the same as
 * accredited RNG certification, which a real gambling licence still
 * requires before real customers can play — see root README.
 */
export async function playGame(input: PlayGameInput) {
  const { userId, gameKey, gameType, stake } = input;
  await assertCanTransact(userId);

  const { minStake, maxStake, rtp, winMultiplier } = env.games;
  if (stake < minStake || stake > maxStake) {
    throw new ApiError(400, `Stake must be between ${minStake} and ${maxStake}.`);
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  if (Number(wallet.balance) < stake) {
    throw new ApiError(400, "Insufficient balance");
  }

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const roll = fairRandomFloat(serverSeed, clientSeed, nonce);

  let won: boolean;
  let multiplier: number;
  let target: number | null = null;

  if (gameType === "dice") {
    target = Math.min(DICE_MAX_TARGET, Math.max(DICE_MIN_TARGET, Math.round(input.target ?? 50)));
    // Player wins if the roll (0-100) lands under their chosen target —
    // a lower target is less likely to hit but pays out more, and the
    // multiplier is set so the long-run expected value always equals rtp
    // regardless of which target the player picks.
    won = roll * 100 < target;
    multiplier = won ? round2((rtp * 100) / target) : 0;
  } else {
    const winProbability = rtp / winMultiplier;
    won = roll < winProbability;
    multiplier = won ? winMultiplier : 0;
  }

  const payout = won ? round2(stake * multiplier) : 0;

  // Every real-money stake counts toward unlocking a locked deposit bonus
  // (see wallet.routes.ts POST /deposit) — once cumulative stakes reach
  // wageringRequired, the bonus becomes withdrawable and the tracking
  // fields reset to 0. Wallets with no active bonus (the common case)
  // just get the plain balance decrement, unchanged from before.
  const lockedBonus = Number(wallet.lockedBonus);
  const walletUpdateData: Record<string, unknown> = { balance: { decrement: stake } };
  if (lockedBonus > 0) {
    const newProgress = Number(wallet.wageringProgress) + stake;
    if (newProgress >= Number(wallet.wageringRequired)) {
      walletUpdateData.lockedBonus = 0;
      walletUpdateData.wageringRequired = 0;
      walletUpdateData.wageringProgress = 0;
    } else {
      walletUpdateData.wageringProgress = { increment: stake };
    }
  }

  await prisma.$transaction([
    prisma.wallet.update({ where: { userId }, data: walletUpdateData }),
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
      gameType,
      target,
      stake,
      multiplier,
      payout,
      won,
      serverSeedHash,
      clientSeed,
      nonce,
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
