import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

export type ColorGameBetType = "NUMBER" | "COLOR" | "SIZE";

/** Every duration runs as its own independent, continuous chain of rounds. */
export const COLOR_GAME_DURATIONS = [30, 60, 180, 300, 600] as const;

/** No new bets in the last few seconds of a round — standard anti-abuse
 * window, not a fairness requirement (the result is still unknown to
 * everyone, including us, until settlement). */
const LOCK_SECONDS = 5;

/** Platform fee taken off every stake before the win multiplier is applied
 * (independent of the fixed odds table below) — e.g. a ₹100 bet at 2x pays
 * ₹100 * 0.98 * 2 = ₹196 on a win, ₹0 on a loss. This guarantees a positive
 * house edge on every bet type, including Big/Small, which would otherwise
 * be an exact 50/50 payout with zero edge. */
const PLATFORM_FEE_RATE = 0.02;

function assertValidDuration(durationSeconds: number) {
  if (!COLOR_GAME_DURATIONS.includes(durationSeconds as (typeof COLOR_GAME_DURATIONS)[number])) {
    throw new ApiError(400, `Invalid duration. Choose one of: ${COLOR_GAME_DURATIONS.join(", ")}`);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sizeForNumber(n: number): "BIG" | "SMALL" {
  return n >= 5 ? "BIG" : "SMALL";
}

/** Which color(s) a drawn number belongs to. 0 and 5 are "mixed" —
 * they belong to violet plus one plain color, at a reduced payout for
 * that plain color (see payoutMultiplierFor). */
function colorsForNumber(n: number): Array<"GREEN" | "RED" | "VIOLET"> {
  if (n === 0) return ["VIOLET", "RED"];
  if (n === 5) return ["VIOLET", "GREEN"];
  return [2, 4, 6, 8].includes(n) ? ["RED"] : ["GREEN"];
}

/** Fixed, published odds — the same for every player, every round.
 * Nothing here depends on how much has been staked on each side. */
function payoutMultiplierFor(betType: ColorGameBetType, betValue: string, resultNumber: number): number {
  if (betType === "NUMBER") {
    return Number(betValue) === resultNumber ? 9 : 0;
  }
  if (betType === "SIZE") {
    return sizeForNumber(resultNumber) === betValue ? 2 : 0;
  }
  // betType === "COLOR"
  const colors = colorsForNumber(resultNumber);
  if (betValue === "VIOLET") return colors.includes("VIOLET") ? 4.5 : 0;
  if (betValue === "GREEN") {
    if (resultNumber === 5) return 1.5; // mixed number, reduced payout
    return colors.includes("GREEN") ? 2 : 0;
  }
  if (betValue === "RED") {
    if (resultNumber === 0) return 1.5; // mixed number, reduced payout
    return colors.includes("RED") ? 2 : 0;
  }
  return 0;
}

export function validateBetValue(betType: ColorGameBetType, betValue: string) {
  if (betType === "NUMBER") {
    if (!/^[0-9]$/.test(betValue)) throw new ApiError(400, "Number bet must be 0-9.");
  } else if (betType === "COLOR") {
    if (!["GREEN", "RED", "VIOLET"].includes(betValue)) throw new ApiError(400, "Color bet must be GREEN, RED or VIOLET.");
  } else if (betType === "SIZE") {
    if (!["BIG", "SMALL"].includes(betValue)) throw new ApiError(400, "Size bet must be BIG or SMALL.");
  } else {
    throw new ApiError(400, "Invalid bet type.");
  }
}

function periodNumberFor(durationSeconds: number, startTime: Date): string {
  const y = startTime.getUTCFullYear();
  const m = String(startTime.getUTCMonth() + 1).padStart(2, "0");
  const d = String(startTime.getUTCDate()).padStart(2, "0");
  const secondsSinceMidnightUtc = startTime.getUTCHours() * 3600 + startTime.getUTCMinutes() * 60 + startTime.getUTCSeconds();
  const index = Math.floor(secondsSinceMidnightUtc / durationSeconds);
  return `${durationSeconds}-${y}${m}${d}-${String(index).padStart(5, "0")}`;
}

function alignToBoundary(now: Date, durationSeconds: number): Date {
  const ms = durationSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

async function createNextRound(durationSeconds: number, startTime: Date) {
  const periodNumber = periodNumberFor(durationSeconds, startTime);
  const endTime = new Date(startTime.getTime() + durationSeconds * 1000);
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  try {
    return await prisma.colorGameRound.create({
      data: { durationSeconds, periodNumber, startTime, endTime, serverSeed, serverSeedHash },
    });
  } catch {
    // periodNumber is a deterministic function of (duration, startTime), so
    // a unique-constraint failure here just means a concurrent request beat
    // us to creating this exact round — use theirs.
    return prisma.colorGameRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Settles a round: draws the result from its (now-revealable) server
 * seed and pays out every pending bet against the fixed odds table. Safe
 * to call more than once — a no-op if already settled. */
async function settleRound(roundId: string) {
  const round = await prisma.colorGameRound.findUniqueOrThrow({ where: { id: roundId }, include: { bets: true } });
  if (round.settled) return round;

  // serverSeed was set when the round was created and only "revealed" (to
  // API responses) once settled — see getHistory.
  const roll = fairRandomFloat(round.serverSeed!, round.periodNumber, 0);
  const resultNumber = Math.min(9, Math.floor(roll * 10));
  const resultSize = sizeForNumber(resultNumber);

  for (const bet of round.bets) {
    if (bet.status !== "PENDING") continue;
    const multiplier = payoutMultiplierFor(bet.betType, bet.betValue, resultNumber);
    const won = multiplier > 0;
    const payout = won ? round2(Number(bet.amount) * (1 - PLATFORM_FEE_RATE) * multiplier) : 0;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.colorGameBet.update({
        where: { id: bet.id },
        data: { status: won ? "WON" : "LOST", payout, payoutMultiplier: multiplier },
      }),
    ];
    if (won) {
      ops.push(
        prisma.wallet.update({ where: { userId: bet.userId }, data: { balance: { increment: payout } } }),
        prisma.transaction.create({
          data: { userId: bet.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" },
        })
      );
    }
    await prisma.$transaction(ops);
  }

  return prisma.colorGameRound.update({
    where: { id: roundId },
    data: { resultNumber, resultSize, settled: true },
  });
}

/** Returns the live round for this duration, settling and advancing past
 * any that have already ended. There's no always-on process ticking
 * rounds forward on this serverless backend, so every read/write here
 * catches the chain up to "now" first — the same lazy pattern the rest
 * of this backend uses (e.g. admin withdrawal settlement). */
export async function ensureCurrentRound(durationSeconds: number) {
  assertValidDuration(durationSeconds);
  let round = await prisma.colorGameRound.findFirst({
    where: { durationSeconds },
    orderBy: { startTime: "desc" },
  });

  const now = new Date();
  while (!round || round.endTime <= now) {
    if (round && !round.settled) {
      await settleRound(round.id);
    }
    const startTime = round ? round.endTime : alignToBoundary(now, durationSeconds);
    round = await createNextRound(durationSeconds, startTime);
  }

  return round;
}

export async function getCurrentRoundView(durationSeconds: number) {
  const round = await ensureCurrentRound(durationSeconds);
  const timeRemainingSeconds = Math.max(0, Math.round((round.endTime.getTime() - Date.now()) / 1000));
  return {
    periodNumber: round.periodNumber,
    durationSeconds: round.durationSeconds,
    startTime: round.startTime,
    endTime: round.endTime,
    serverSeedHash: round.serverSeedHash,
    timeRemainingSeconds,
    locked: timeRemainingSeconds <= LOCK_SECONDS,
  };
}

export async function placeColorGameBet(
  userId: string,
  durationSeconds: number,
  betType: ColorGameBetType,
  betValue: string,
  amount: number
) {
  assertValidDuration(durationSeconds);
  validateBetValue(betType, betValue);
  if (amount < env.games.minStake || amount > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const round = await ensureCurrentRound(durationSeconds);
  const msRemaining = round.endTime.getTime() - Date.now();
  if (msRemaining <= LOCK_SECONDS * 1000) {
    throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  if (Number(wallet.balance) < amount) {
    throw new ApiError(400, "Insufficient balance");
  }

  // Same locked-bonus wagering-progress mechanic as gameEngineService.ts.
  const lockedBonus = Number(wallet.lockedBonus);
  const walletUpdateData: Record<string, unknown> = { balance: { decrement: amount } };
  if (lockedBonus > 0) {
    const newProgress = Number(wallet.wageringProgress) + amount;
    if (newProgress >= Number(wallet.wageringRequired)) {
      walletUpdateData.lockedBonus = 0;
      walletUpdateData.wageringRequired = 0;
      walletUpdateData.wageringProgress = 0;
    } else {
      walletUpdateData.wageringProgress = { increment: amount };
    }
  }

  const [bet] = await prisma.$transaction([
    prisma.colorGameBet.create({
      data: { roundId: round.id, userId, betType, betValue, amount, payoutMultiplier: 0 },
    }),
    prisma.wallet.update({ where: { userId }, data: walletUpdateData }),
    prisma.transaction.create({
      data: { userId, type: "GAME_STAKE", amount, status: "COMPLETED" },
    }),
  ]);

  return bet;
}

export async function getHistory(durationSeconds: number, limit = 30) {
  assertValidDuration(durationSeconds);
  return prisma.colorGameRound.findMany({
    where: { durationSeconds, settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: {
      periodNumber: true,
      startTime: true,
      endTime: true,
      resultNumber: true,
      resultSize: true,
      serverSeed: true,
      serverSeedHash: true,
    },
  });
}

export async function getMyBets(userId: string, limit = 50) {
  return prisma.colorGameBet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      round: { select: { periodNumber: true, durationSeconds: true, resultNumber: true, resultSize: true, settled: true } },
    },
  });
}

export function getColorGameConfig() {
  return {
    durations: COLOR_GAME_DURATIONS,
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    lockSeconds: LOCK_SECONDS,
    payouts: { number: 9, color: 2, colorMixed: 1.5, violet: 4.5, size: 2 },
    platformFeePercent: PLATFORM_FEE_RATE * 100,
  };
}
