import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/** No new bets once the plane has taken off — same anti-abuse idea as
 * ColorGame's LOCK_SECONDS, but here it's just "the betting window". */
const BETTING_DURATION_SECONDS = 6;

/** How long the crashed multiplier stays on screen before the next
 * round's betting window opens — a UI grace period, not a fairness
 * mechanism (crashMultiplier is already fixed the instant the round is
 * created; see periodNumberFor/createNextRound). */
const RESULT_PAUSE_SECONDS = 4;

/** multiplier(t) = e^(GROWTH_RATE * t), t in seconds since takeoff. Chosen
 * so the multiplier roughly doubles every ~5s — fast enough to feel
 * exciting, slow enough to bet on. */
const GROWTH_RATE = Math.log(2) / 5;

/** House edge baked into the crash-point distribution itself (see
 * crashMultiplierFromSeed) — independent of any platform fee, this alone
 * gives the house a positive long-run edge on every round. */
const HOUSE_EDGE = 0.03;

const MIN_AUTO_CASHOUT = 1.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** IST (UTC+5:30) has no DST — a fixed offset is exact. Used only to make
 * periodNumber human-readable (date + time of takeoff); it has no bearing
 * on the round's actual timing or crash result. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function periodNumberFor(bettingStartTime: Date): string {
  const ist = new Date(bettingStartTime.getTime() + IST_OFFSET_MS);
  const y = String(ist.getUTCFullYear()).slice(-2);
  const mo = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const h = String(ist.getUTCHours()).padStart(2, "0");
  const mi = String(ist.getUTCMinutes()).padStart(2, "0");
  const s = String(ist.getUTCSeconds()).padStart(2, "0");
  const ms = String(ist.getUTCMilliseconds()).padStart(3, "0");
  return `${y}${mo}${d}${h}${mi}${s}${ms}`;
}

/**
 * Standard provably-fair crash-point construction (the same one used by
 * every open-source "Bustabit-style" crash game): draw r uniformly from
 * [0, 1) via HMAC, then crash = max(1.00, (1 - houseEdge) / (1 - r)).
 * P(raw value < 1.00, i.e. an instant 1.00x crash) = P(r < houseEdge) =
 * houseEdge exactly, so the house edge is provable from the formula
 * itself, not hidden in a lookup table.
 */
function crashMultiplierFromSeed(serverSeed: string, periodNumber: string): number {
  const r = fairRandomFloat(serverSeed, periodNumber, 0);
  const raw = (1 - HOUSE_EDGE) / (1 - r);
  return round2(Math.max(1, raw));
}

function secondsToReach(multiplier: number): number {
  return Math.log(multiplier) / GROWTH_RATE;
}

type Phase = "BETTING" | "FLYING" | "CRASHED";

function phaseFor(round: { flyStartTime: Date; crashTime: Date }, now: Date): Phase {
  if (now < round.flyStartTime) return "BETTING";
  if (now < round.crashTime) return "FLYING";
  return "CRASHED";
}

/** Multiplier at `now` — 1.00x before takeoff, growing exponentially
 * during flight, frozen at the crash value once crashed. */
function liveMultiplier(round: { flyStartTime: Date; crashTime: Date; crashMultiplier: unknown }, now: Date): number {
  if (now <= round.flyStartTime) return 1;
  const cappedNow = Math.min(now.getTime(), round.crashTime.getTime());
  const elapsed = (cappedNow - round.flyStartTime.getTime()) / 1000;
  return round2(Math.exp(GROWTH_RATE * elapsed));
}

async function createNextRound(bettingStartTime: Date) {
  const periodNumber = periodNumberFor(bettingStartTime);
  const flyStartTime = new Date(bettingStartTime.getTime() + BETTING_DURATION_SECONDS * 1000);
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  const crashMultiplier = crashMultiplierFromSeed(serverSeed, periodNumber);
  const crashTime = new Date(flyStartTime.getTime() + secondsToReach(crashMultiplier) * 1000);
  const endTime = new Date(crashTime.getTime() + RESULT_PAUSE_SECONDS * 1000);

  try {
    return await prisma.aviatorRound.create({
      data: { periodNumber, bettingStartTime, flyStartTime, crashTime, endTime, crashMultiplier, serverSeed, serverSeedHash },
    });
  } catch {
    // periodNumber is deterministic from bettingStartTime — a unique-
    // constraint failure just means a concurrent request beat us to it.
    return prisma.aviatorRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Resolves every still-PENDING bet in a round whose crash point is
 * already known (now >= crashTime): a bet with an autoCashoutAt at or
 * below the crash multiplier wins at that multiplier, everyone else
 * loses. Safe to call repeatedly — only touches PENDING bets, so it's a
 * no-op once a round has already been resolved. Deliberately not gated on
 * `settled` so `my-bets`/wallet reflect the result immediately once the
 * plane crashes, without waiting for the trailing result-pause to end. */
async function resolvePendingBets(roundId: string) {
  const round = await prisma.aviatorRound.findUniqueOrThrow({ where: { id: roundId } });
  const crashMultiplier = Number(round.crashMultiplier);
  const pendingBets = await prisma.aviatorBet.findMany({ where: { roundId, status: "PENDING" } });

  for (const bet of pendingBets) {
    const auto = bet.autoCashoutAt !== null ? Number(bet.autoCashoutAt) : null;
    const won = auto !== null && auto <= crashMultiplier;
    const payout = won ? round2(Number(bet.amount) * auto!) : 0;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.aviatorBet.update({
        where: { id: bet.id },
        data: { status: won ? "WON" : "LOST", cashoutMultiplier: won ? auto : null, payout },
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
}

async function settleRound(roundId: string) {
  const round = await prisma.aviatorRound.findUniqueOrThrow({ where: { id: roundId } });
  if (round.settled) return;
  await resolvePendingBets(roundId);
  await prisma.aviatorRound.update({ where: { id: roundId }, data: { settled: true } });
}

/** Returns the live round, settling and chaining past any that have
 * already ended. Same lazy pattern as ColorGame's ensureCurrentRound —
 * there's no always-on process ticking rounds forward on this serverless
 * backend, so every read/write catches the chain up to "now" first.
 * Unlike ColorGame, rounds aren't aligned to wall-clock slots — each one
 * starts the instant the previous one's result-pause ends. */
// No single round's flight can realistically take anywhere near this long
// (even a rare huge crash multiplier resolves in well under a minute), so
// a gap bigger than this can only mean the track sat unpolled — safe to
// treat as "nobody was around to bet" rather than "still mid-round".
const IDLE_GAP_MS = 5 * 60 * 1000;

export async function ensureCurrentRound() {
  let round = await prisma.aviatorRound.findFirst({ orderBy: { bettingStartTime: "desc" } });

  const now = new Date();
  if (round && !round.settled && round.endTime <= now) {
    await settleRound(round.id);
  }

  if (!round || round.endTime <= now) {
    // Chain straight off the previous round when we're only a beat
    // behind (the normal case), or jump to `now` when the gap is large —
    // no round in that gap could have had a bet placed on it (this is
    // the only place a round ever gets created), so there's nothing to
    // settle for them and no need for their rows to exist at all.
    const bettingStartTime = round && now.getTime() - round.endTime.getTime() < IDLE_GAP_MS ? round.endTime : now;
    round = await createNextRound(bettingStartTime);
  }

  // The current round may already be past its crashTime (mid result-pause)
  // — resolve pending bets against the now-known result right away rather
  // than waiting for the round to fully end.
  if (now >= round.crashTime && !round.settled) {
    await resolvePendingBets(round.id);
  }

  return round;
}

export async function getCurrentRoundView() {
  const round = await ensureCurrentRound();
  const now = new Date();
  const phase = phaseFor(round, now);
  // crashTime/endTime are both derived from the secret crash multiplier
  // (see createNextRound) — exposing either before the round actually
  // reaches it would let a client back-solve the crash point early, the
  // same failure mode commit-reveal is meant to prevent. Only flyStartTime
  // (a fixed schedule, independent of the secret) is safe to reveal early.
  return {
    periodNumber: round.periodNumber,
    bettingStartTime: round.bettingStartTime,
    flyStartTime: round.flyStartTime,
    crashTime: phase === "CRASHED" ? round.crashTime : null,
    // Same reasoning: endTime = crashTime + a fixed pause, so it's exactly
    // as revealing as crashTime and safe on the same condition.
    endTime: phase === "CRASHED" ? round.endTime : null,
    serverSeedHash: round.serverSeedHash,
    phase,
    multiplier: liveMultiplier(round, now),
    // Only reveal the crash point once the round has actually reached it.
    crashMultiplier: phase === "CRASHED" ? Number(round.crashMultiplier) : null,
  };
}

export async function placeAviatorBet(userId: string, amount: number, autoCashoutAt?: number) {
  if (amount < env.games.minStake || amount > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (autoCashoutAt !== undefined && autoCashoutAt < MIN_AUTO_CASHOUT) {
    throw new ApiError(400, `Auto cash-out must be at least ${MIN_AUTO_CASHOUT}x.`);
  }

  await assertCanTransact(userId);

  const round = await ensureCurrentRound();
  const now = new Date();
  if (phaseFor(round, now) !== "BETTING") {
    throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
  }

  // Up to two concurrent bets per round (matches the mobile UI's two
  // independent bet panels — real Aviator lets a player run a manual bet
  // and a second auto-cashout bet side by side).
  const existingCount = await prisma.aviatorBet.count({
    where: { roundId: round.id, userId, status: "PENDING" },
  });
  if (existingCount >= 2) {
    throw new ApiError(400, "You already have the maximum of two bets placed on this round.");
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  if (Number(wallet.balance) < amount) {
    throw new ApiError(400, "Insufficient balance");
  }

  // Same locked-bonus wagering-progress mechanic as colorGameService.ts.
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
    prisma.aviatorBet.create({
      data: { roundId: round.id, userId, amount, autoCashoutAt: autoCashoutAt ?? null },
    }),
    prisma.wallet.update({ where: { userId }, data: walletUpdateData }),
    prisma.transaction.create({
      data: { userId, type: "GAME_STAKE", amount, status: "COMPLETED" },
    }),
  ]);

  return bet;
}

export async function cashOutAviatorBet(userId: string, betId: string) {
  const bet = await prisma.aviatorBet.findUnique({ where: { id: betId }, include: { round: true } });
  if (!bet) throw new ApiError(404, "Bet not found.");
  if (bet.userId !== userId) throw new ApiError(403, "Not your bet.");
  if (bet.status !== "PENDING") throw new ApiError(400, "This bet has already been settled.");

  const now = new Date();
  const phase = phaseFor(bet.round, now);
  if (phase === "BETTING") throw new ApiError(400, "The plane hasn't taken off yet.");
  if (phase === "CRASHED") throw new ApiError(400, "Too late — the plane already crashed.");

  const multiplier = liveMultiplier(bet.round, now);
  const payout = round2(Number(bet.amount) * multiplier);

  await prisma.$transaction([
    prisma.aviatorBet.update({
      where: { id: bet.id },
      data: { status: "WON", cashoutMultiplier: multiplier, payout },
    }),
    prisma.wallet.update({ where: { userId }, data: { balance: { increment: payout } } }),
    prisma.transaction.create({
      data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" },
    }),
  ]);

  return { multiplier, payout };
}

export async function getMyCurrentBet(userId: string) {
  const round = await ensureCurrentRound();
  return prisma.aviatorBet.findFirst({
    where: { roundId: round.id, userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getHistory(limit = 30) {
  return prisma.aviatorRound.findMany({
    where: { settled: true },
    orderBy: { bettingStartTime: "desc" },
    take: limit,
    select: {
      periodNumber: true,
      bettingStartTime: true,
      crashMultiplier: true,
      serverSeed: true,
      serverSeedHash: true,
    },
  });
}

export async function getMyBets(userId: string, limit = 50) {
  return prisma.aviatorBet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      round: { select: { periodNumber: true, crashMultiplier: true, settled: true } },
    },
  });
}

/** Shows other players' activity without exposing who they are — just the
 * first and last character of their first name, everything else starred
 * out (e.g. "Mangal" -> "m***l"). Never sends phone/email/uid to other
 * players. */
function maskPlayerName(firstName: string): string {
  const name = firstName.trim();
  if (name.length <= 1) return `${name.toLowerCase()}***`;
  return `${name[0].toLowerCase()}***${name[name.length - 1].toLowerCase()}`;
}

const publicBetSelect = {
  id: true,
  amount: true,
  cashoutMultiplier: true,
  payout: true,
  status: true,
  createdAt: true,
  user: { select: { firstName: true } },
} as const;

function toPublicBet<T extends { user: { firstName: string } }>(bet: T) {
  const { user, ...rest } = bet;
  return { ...rest, player: maskPlayerName(user.firstName) };
}

/** Every bet placed on a given round (current or already-settled), most
 * staked first — powers the "All Bets" / "Previous" public bet lists. */
export async function getRoundBets(periodNumber: string, limit = 100) {
  const round = await prisma.aviatorRound.findUnique({ where: { periodNumber }, select: { id: true } });
  if (!round) return [];
  const bets = await prisma.aviatorBet.findMany({
    where: { roundId: round.id },
    orderBy: { amount: "desc" },
    take: limit,
    select: publicBetSelect,
  });
  return bets.map(toPublicBet);
}

/** Biggest recent wins across all players, for the "Top" tab. */
export async function getTopBets(limit = 50) {
  const bets = await prisma.aviatorBet.findMany({
    where: { status: "WON" },
    orderBy: { payout: "desc" },
    take: limit,
    select: publicBetSelect,
  });
  return bets.map(toPublicBet);
}

export function getAviatorConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    bettingDurationSeconds: BETTING_DURATION_SECONDS,
    resultPauseSeconds: RESULT_PAUSE_SECONDS,
    growthRate: GROWTH_RATE,
    houseEdgePercent: HOUSE_EDGE * 100,
    minAutoCashout: MIN_AUTO_CASHOUT,
  };
}
