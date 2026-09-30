import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Lucky Gems: a 3x3 gem slot with five fixed lines (three rows and two
 * diagonals) and a fourth reel that shows a win multiplier. Three of a symbol
 * on a line pays SYMBOL_PAYS times the bet; the golden mask is wild for every
 * symbol and three masks pay WILD_PAYS. The total line win is multiplied by
 * the multiplier reel. Extra Bet costs 1.5x the bet and makes the big
 * multipliers more likely; lines still pay on the bet.
 *
 * The RTP is exact: every combination of reel stops is counted (the multiplier
 * reel is independent of the others), so RTP = E[line win] x E[multiplier] / cost.
 */
export const SYMBOLS = ["J", "Q", "K", "A", "GREEN", "BLUE", "RED", "WILD"] as const;
export type GemSymbol = (typeof SYMBOLS)[number];
const WILD = 7;
export const SYMBOL_PAYS: number[] = [0.4, 1, 1.6, 2, 2.4, 3, 4];
export const WILD_PAYS = 5;
export const EXTRA_BET_COST = 1.5;

// Reel strips, top to bottom and wrapping round. Symbol index into SYMBOLS.
const STRIP_TEXT = ["JAKJWQJGQJQJQAJWJAQBRQJKGJKB", "RJBQJAJQGJAQJWQBQKJQJKJGWAKJ", "QJQGJQBAJQKJWJQKJBAQJGKRJWJA"];
const CODE: Record<string, number> = { J: 0, Q: 1, K: 2, A: 3, G: 4, B: 5, R: 6, W: 7 };
export const STRIPS: number[][] = STRIP_TEXT.map((s) => [...s].map((ch) => CODE[ch]));

/** Lines as the row (0 = top) used on each of the three reels. */
export const LINES: number[][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

export const MULTIPLIERS = [1, 2, 3, 5, 10, 15];
/** Out of 100, for each multiplier. */
export const MULTIPLIER_WEIGHTS = [58, 21, 10, 7, 3, 1];
export const EXTRA_MULTIPLIER_WEIGHTS = [32, 27, 18, 14, 6, 3];

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The three visible symbols of each reel (column), top to bottom. */
export function gridFor(stops: number[]): number[][] {
  return stops.map((stop, reel) => {
    const strip = STRIPS[reel];
    return [0, 1, 2].map((row) => strip[(stop + row) % strip.length]);
  });
}

export type LineWin = { line: number; symbol: GemSymbol; pays: number };

/** Every paying line, and their total in bets (before the multiplier). */
export function lineWins(grid: number[][]): { wins: LineWin[]; total: number } {
  const wins: LineWin[] = [];
  LINES.forEach((rows, line) => {
    const cells = rows.map((row, reel) => grid[reel][row]);
    const plain = cells.filter((c) => c !== WILD);
    if (plain.length === 0) wins.push({ line, symbol: "WILD", pays: WILD_PAYS });
    else if (plain.every((c) => c === plain[0])) wins.push({ line, symbol: SYMBOLS[plain[0]], pays: SYMBOL_PAYS[plain[0]] });
  });
  return { wins, total: Number(wins.reduce((s, w) => s + w.pays, 0).toFixed(4)) };
}

function meanMultiplier(weights: number[]): number {
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.reduce((s, w, i) => s + w * MULTIPLIERS[i], 0) / sum;
}

/** Exact line-win statistics over every combination of reel stops. */
export const LINE_STATS = (() => {
  const [a, b, c] = STRIPS.map((s) => s.length);
  let total = 0;
  let hits = 0;
  for (let i = 0; i < a; i++)
    for (let j = 0; j < b; j++)
      for (let k = 0; k < c; k++) {
        const w = lineWins(gridFor([i, j, k])).total;
        total += w;
        if (w > 0) hits++;
      }
  const n = a * b * c;
  return { meanWin: total / n, hitRate: hits / n };
})();

export const RTP = LINE_STATS.meanWin * meanMultiplier(MULTIPLIER_WEIGHTS);
export const EXTRA_RTP = (LINE_STATS.meanWin * meanMultiplier(EXTRA_MULTIPLIER_WEIGHTS)) / EXTRA_BET_COST;

/**
 * Reel i stops at floor(HMAC(serverSeed, "<clientSeed>:gems:<nonce>:<i>") x strip length);
 * the multiplier reel uses i = 3 against the weights out of 100.
 */
export function spinFor(serverSeed: string, clientSeed: string, nonce: number, extraBet: boolean) {
  const stops = STRIPS.map((strip, i) => Math.floor(fairGameFloat(serverSeed, clientSeed, `gems:${nonce}`, i) * strip.length));
  const weights = extraBet ? EXTRA_MULTIPLIER_WEIGHTS : MULTIPLIER_WEIGHTS;
  let roll = Math.floor(fairGameFloat(serverSeed, clientSeed, `gems:${nonce}`, 3) * 100);
  let m = 0;
  while (roll >= weights[m]) roll -= weights[m++];
  return { stops, multiplier: MULTIPLIERS[m] };
}

type SpinRow = Prisma.LuckyGemsSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  const grid = gridFor(row.stops);
  return { ...rest, grid: grid.map((col) => col.map((s) => SYMBOLS[s])), lineWins: lineWins(grid).wins };
}

export function getLuckyGemsConfig() {
  const odds = (weights: number[]) => MULTIPLIERS.map((multiplier, i) => ({ multiplier, chancePercent: weights[i] }));
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    symbols: SYMBOLS,
    // Best first.
    paytable: [{ symbol: "WILD", pays: WILD_PAYS }, ...SYMBOL_PAYS.map((pays, i) => ({ symbol: SYMBOLS[i], pays })).reverse()],
    lines: LINES,
    strips: STRIPS.map((s) => s.map((c) => SYMBOLS[c])),
    multipliers: odds(MULTIPLIER_WEIGHTS),
    extraMultipliers: odds(EXTRA_MULTIPLIER_WEIGHTS),
    extraBetCost: EXTRA_BET_COST,
    hitRatePercent: round2(LINE_STATS.hitRate * 100),
    rtpPercent: Math.floor(RTP * 10000) / 100,
    extraRtpPercent: Math.floor(EXTRA_RTP * 10000) / 100,
  };
}

/** Spins once: debits the cost, spins from the player's provably-fair seeds and pays, in one transaction. */
export async function spinLuckyGems(userId: string, bet: number, extraBet = false) {
  if (bet < env.games.minStake || bet > env.games.maxStake) {
    throw new ApiError(400, `Bet must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  const cost = round2(bet * (extraBet ? EXTRA_BET_COST : 1));

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const { stops, multiplier } = spinFor(serverSeed, clientSeed, nonce, extraBet);
  const { total } = lineWins(gridFor(stops));
  const payout = Math.min(floor2(bet * total * multiplier), env.games.maxPayout);

  const row = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: cost } }, data: { balance: { decrement: cost } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    const data: Prisma.WalletUpdateInput = {};
    if (payout > 0) data.balance = { increment: payout };
    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const progress = Number(wallet.wageringProgress) + cost;
      if (progress >= Number(wallet.wageringRequired)) {
        data.lockedBonus = 0;
        data.wageringRequired = 0;
        data.wageringProgress = 0;
      } else {
        data.wageringProgress = { increment: cost };
      }
    }
    if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId }, data });

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: cost, status: "COMPLETED" } });
    if (payout > 0) await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });

    return tx.luckyGemsSpin.create({
      data: { userId, bet, extraBet, cost, stops, multiplier, lineTotal: total, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicSpin(row);
}

export async function getMyLuckyGemsHistory(userId: string, limit = 30) {
  const rows = await prisma.luckyGemsSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
