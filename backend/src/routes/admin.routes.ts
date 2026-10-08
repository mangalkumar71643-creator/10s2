import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { paymentProvider } from "../services/paymentService";
import { getGameReport } from "../services/gameReportService";
import * as winGoService from "../services/winGoService";
import * as aviatorService from "../services/aviatorService";
import { getChickenRoadConfig } from "../services/chickenRoadService";
import { getMinesConfig } from "../services/minesService";
import * as popupService from "../services/popupService";
import * as giftCodeService from "../services/giftCodeService";
import { getAppDownloadUrl, getGameSettings, MAX_MAX_PAYOUT, MIN_MAX_PAYOUT, setAppDownloadUrl, setMaxPayout } from "../services/settingsService";

const router = Router();
router.use(requireAuth, requireAdmin);

const userSummarySelect = { firstName: true, lastName: true, uid: true, email: true, phone: true } as const;

// --- Users / KYC / reports ---

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const users = await prisma.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        uid: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        kycStatus: true,
        isSelfExcluded: true,
        isBanned: true,
        banReason: true,
        bannedAt: true,
        role: true,
        createdAt: true,
        wallet: { select: { balance: true, currency: true } },
      },
      take: 200,
    });
    res.json(users);
  })
);

const kycDecisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });
router.patch(
  "/kyc/:userId",
  asyncHandler(async (req, res) => {
    const { status } = kycDecisionSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { kycStatus: status },
      select: { id: true, kycStatus: true },
    });
    res.json(user);
  })
);

const banSchema = z.object({ reason: z.string().trim().min(1).max(500) });
router.patch(
  "/users/:userId/ban",
  asyncHandler(async (req, res) => {
    const { reason } = banSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { isBanned: true, banReason: reason, bannedAt: new Date() },
      select: { id: true, isBanned: true, banReason: true, bannedAt: true },
    });
    res.json(user);
  })
);

router.patch(
  "/users/:userId/unban",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { isBanned: false, banReason: null, bannedAt: null },
      select: { id: true, isBanned: true },
    });
    res.json(user);
  })
);

router.get(
  "/dashboard-summary",
  asyncHandler(async (_req, res) => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers7d,
      totalDeposit,
      deposit7d,
      totalWithdrawal,
      withdrawal7d,
      activePlayerRows,
      playerBalances,
      pendingWithdrawals,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.transaction.aggregate({ where: { type: "DEPOSIT", status: "COMPLETED" }, _sum: { amount: true } }),
        prisma.transaction.aggregate({
          where: { type: "DEPOSIT", status: "COMPLETED", createdAt: { gte: weekAgo } },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({ where: { type: "WITHDRAWAL", status: "COMPLETED" }, _sum: { amount: true } }),
        prisma.transaction.aggregate({
          where: { type: "WITHDRAWAL", status: "COMPLETED", createdAt: { gte: weekAgo } },
          _sum: { amount: true },
        }),
        // "Active" = staked something (a sports bet or any game round) in the last 24h.
        prisma.transaction.findMany({
          where: { type: { in: ["GAME_STAKE", "BET_STAKE"] }, createdAt: { gte: dayAgo } },
          distinct: ["userId"],
          select: { userId: true },
        }),
        prisma.wallet.aggregate({ _sum: { balance: true } }),
        // Already deducted from wallets when requested, but not paid out yet.
        prisma.transaction.aggregate({ where: { type: "WITHDRAWAL", status: "PENDING" }, _sum: { amount: true } }),
      ]);

    const playerBalanceTotal = Number(playerBalances._sum.balance ?? 0);
    const pendingWithdrawalTotal = Number(pendingWithdrawals._sum.amount ?? 0);

    res.json({
      totalUsers,
      newUsersLast7Days: newUsers7d,
      totalDeposit: totalDeposit._sum.amount ?? 0,
      depositLast7Days: deposit7d._sum.amount ?? 0,
      totalWithdrawal: totalWithdrawal._sum.amount ?? 0,
      withdrawalLast7Days: withdrawal7d._sum.amount ?? 0,
      activePlayers: activePlayerRows.length,
      playerBalanceTotal,
      pendingWithdrawalTotal,
      // What the house would have to pay if every player cashed out now.
      owedToPlayers: playerBalanceTotal + pendingWithdrawalTotal,
    });
  })
);

type DayRow = { day: string; staked: unknown; paid: unknown; bets: bigint; players: bigint };

/**
 * House result from every game, per day (India time): what was staked, what
 * was paid back, and the profit. Built from the GAME_STAKE / GAME_PAYOUT
 * wallet transactions every game writes, so it covers all games at once.
 */
router.get(
  "/reports/daily",
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const rows = await prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(amount) FILTER (WHERE type = 'GAME_STAKE'), 0) AS staked,
             COALESCE(SUM(amount) FILTER (WHERE type = 'GAME_PAYOUT'), 0) AS paid,
             COUNT(*) FILTER (WHERE type = 'GAME_STAKE') AS bets,
             COUNT(DISTINCT "userId") FILTER (WHERE type = 'GAME_STAKE') AS players
      FROM "Transaction"
      WHERE type IN ('GAME_STAKE', 'GAME_PAYOUT') AND status = 'COMPLETED'
        AND "createdAt" >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - make_interval(days => ${days - 1}::int)) AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC'
      GROUP BY 1
      ORDER BY 1 DESC`;
    const [allStaked, allPaid] = await Promise.all([
      prisma.transaction.aggregate({ where: { type: "GAME_STAKE", status: "COMPLETED" }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: "GAME_PAYOUT", status: "COMPLETED" }, _sum: { amount: true } }),
    ]);
    const toDay = (r: DayRow) => {
      const staked = Number(r.staked);
      const paid = Number(r.paid);
      return { day: r.day, staked, paid, profit: Math.round((staked - paid) * 100) / 100, bets: Number(r.bets), players: Number(r.players) };
    };
    const list = rows.map(toDay);
    const sum = (k: "staked" | "paid" | "bets") => list.reduce((t, d) => t + d[k], 0);
    const periodStaked = sum("staked");
    const periodPaid = sum("paid");
    const allTimeStaked = Number(allStaked._sum.amount ?? 0);
    const allTimePaid = Number(allPaid._sum.amount ?? 0);
    res.json({
      days: list,
      period: { days, staked: periodStaked, paid: periodPaid, profit: Math.round((periodStaked - periodPaid) * 100) / 100, bets: sum("bets") },
      allTime: { staked: allTimeStaked, paid: allTimePaid, profit: Math.round((allTimeStaked - allTimePaid) * 100) / 100 },
      targetHouseEdgePercent: Math.round((1 - env.games.rtp) * 1000) / 10,
    });
  })
);

type PnlRow = { period: string; type: string; provider: string | null; total: unknown };

/**
 * Profit & loss for today, the last 7 and 30 days, and all time (India time).
 *
 * Game result: stakes minus winnings across every game (plus any refunds of
 * old sports bets). Bonus cost: money handed to players without a stake
 * (gift codes, deposit bonuses, VIP rewards, admin test credits, shown apart
 * so test top-ups don't hide the real figure). Net = game result - bonuses.
 *
 * Cash: real deposits in and withdrawals paid out, plus where things stand
 * right now: what players hold in their wallets (they may withdraw it) and
 * withdrawals waiting for approval.
 */
router.get(
  "/reports/pnl",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.$queryRaw<PnlRow[]>`
      WITH bounds AS (
        SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC' AS today,
               (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - interval '6 days') AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC' AS d7,
               (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - interval '29 days') AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC' AS d30
      ), periods AS (
        SELECT 'today' AS period, today AS since FROM bounds
        UNION ALL SELECT 'd7', d7 FROM bounds
        UNION ALL SELECT 'd30', d30 FROM bounds
        UNION ALL SELECT 'all', '-infinity'::timestamp
      )
      SELECT p.period, t.type::text AS type,
             CASE WHEN t.type IN ('BONUS', 'DEPOSIT_BONUS') THEN t.provider ELSE NULL END AS provider,
             SUM(t.amount) AS total
      FROM periods p
      JOIN "Transaction" t ON t."createdAt" >= p.since AND t.status = 'COMPLETED'
      GROUP BY 1, 2, 3`;
    const [wallets, pending, players] = await Promise.all([
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.transaction.aggregate({ where: { type: "WITHDRAWAL", status: "PENDING" }, _sum: { amount: true }, _count: true }),
      prisma.wallet.count({ where: { balance: { gt: 0 } } }),
    ]);

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const periods = ["today", "d7", "d30", "all"] as const;
    const out = Object.fromEntries(
      periods.map((period) => {
        const mine = rows.filter((r) => r.period === period);
        const sum = (types: string[], provider?: (p: string | null) => boolean) =>
          r2(mine.filter((r) => types.includes(r.type) && (!provider || provider(r.provider))).reduce((t, r) => t + Number(r.total), 0));
        const staked = sum(["GAME_STAKE", "BET_STAKE"]);
        const paid = sum(["GAME_PAYOUT", "BET_PAYOUT", "BET_REFUND"]);
        const gameProfit = r2(staked - paid);
        const testCredit = sum(["BONUS"], (p) => p === "admin-credit");
        const giftCodes = sum(["BONUS"], (p) => p === "gift-code");
        const vip = sum(["BONUS"], (p) => p === "vip-upgrade" || p === "vip-weekly");
        const depositBonus = sum(["DEPOSIT_BONUS"]);
        const otherBonus = r2(sum(["BONUS"]) - testCredit - giftCodes - vip);
        const bonuses = r2(giftCodes + vip + depositBonus + otherBonus);
        const deposits = sum(["DEPOSIT"]);
        const withdrawals = sum(["WITHDRAWAL"]);
        return [
          period,
          {
            staked,
            paid,
            gameProfit,
            edgePercent: staked > 0 ? Math.round((gameProfit / staked) * 10000) / 100 : null,
            bonuses: { total: bonuses, giftCodes, vip, depositBonus, other: otherBonus },
            testCredit,
            netProfit: r2(gameProfit - bonuses),
            deposits,
            withdrawals,
            cashIn: r2(deposits - withdrawals),
          },
        ];
      })
    );
    const playerBalances = r2(Number(wallets._sum.balance ?? 0));
    const pendingWithdrawals = r2(Number(pending._sum.amount ?? 0));
    res.json({
      periods: out,
      now: {
        playerBalances,
        playersWithBalance: players,
        pendingWithdrawals,
        pendingWithdrawalCount: pending._count,
        // Real money kept if every player withdrew everything now: deposits - paid withdrawals - what's still owed.
        cashIfAllWithdrew: r2((out.all as { cashIn: number }).cashIn - playerBalances - pendingWithdrawals),
      },
      targetHouseEdgePercent: Math.round((1 - env.games.rtp) * 1000) / 10,
    });
  })
);

/** Per-game profit and loss: see gameReportService. */
router.get(
  "/reports/games",
  asyncHandler(async (_req, res) => {
    res.json(await getGameReport());
  })
);

// --- Test balance: credit a player by their UID ---
// Deposits are closed until a real payment provider is wired in; this is how
// the admin tops up a balance for testing. Recorded as a BONUS transaction
// from "admin-credit" so it never counts as a real deposit (or towards the
// first/second deposit bonus).

router.get(
  "/users/by-uid/:uid",
  asyncHandler(async (req, res) => {
    const uid = Number(req.params.uid);
    if (!Number.isInteger(uid)) throw new ApiError(400, "Enter a valid UID.");
    const user = await prisma.user.findUnique({ where: { uid }, select: { id: true, ...userSummarySelect, wallet: { select: { balance: true } } } });
    if (!user) throw new ApiError(404, "No player with that UID.");
    res.json(user);
  })
);

const creditSchema = z.object({ amount: z.number().positive().max(100000), note: z.string().trim().max(120).optional() });
router.post(
  "/users/by-uid/:uid/credit",
  asyncHandler(async (req, res) => {
    const uid = Number(req.params.uid);
    if (!Number.isInteger(uid)) throw new ApiError(400, "Enter a valid UID.");
    const { amount } = creditSchema.parse(req.body);
    const rounded = Math.round(amount * 100) / 100;
    const user = await prisma.user.findUnique({ where: { uid }, select: { id: true, ...userSummarySelect } });
    if (!user) throw new ApiError(404, "No player with that UID.");
    const wallet = await prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.upsert({ where: { userId: user.id }, update: { balance: { increment: rounded } }, create: { userId: user.id, balance: rounded } });
      await tx.transaction.create({ data: { userId: user.id, type: "BONUS", amount: rounded, status: "COMPLETED", provider: "admin-credit" } });
      return updated;
    });
    res.json({ user, credited: rounded, balance: wallet.balance });
  })
);

// --- App download link (Home slider "Download app" buttons) ---

router.get(
  "/app-download",
  asyncHandler(async (_req, res) => {
    res.json({ url: await getAppDownloadUrl() });
  })
);

const appDownloadSchema = z.object({
  url: z.union([z.literal(""), z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Link must start with http:// or https://")]),
});
router.put(
  "/app-download",
  asyncHandler(async (req, res) => {
    res.json(await setAppDownloadUrl(appDownloadSchema.parse(req.body).url));
  })
);

// --- Gift codes (redeemed from the app's gift box) ---

router.get(
  "/gift-codes",
  asyncHandler(async (_req, res) => {
    res.json(await giftCodeService.listGiftCodes());
  })
);

const createGiftCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{0,20}$/, "Code can only have letters and numbers (up to 20).")
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || v.length >= 4, "Code must be at least 4 characters."),
  amount: z.number().positive().max(100000),
  maxUses: z.number().int().min(1).max(100000),
});
router.post(
  "/gift-codes",
  asyncHandler(async (req, res) => {
    res.status(201).json(await giftCodeService.createGiftCode(createGiftCodeSchema.parse(req.body)));
  })
);

router.patch(
  "/gift-codes/:id",
  asyncHandler(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    res.json(await giftCodeService.setGiftCodeActive(req.params.id, active));
  })
);

router.delete(
  "/gift-codes/:id",
  asyncHandler(async (req, res) => {
    await giftCodeService.deleteGiftCode(req.params.id);
    res.status(204).end();
  })
);

// --- Game settings ---

router.get("/settings", (_req, res) => {
  res.json(getGameSettings());
});

const settingsSchema = z.object({ maxPayout: z.number().int().min(MIN_MAX_PAYOUT).max(MAX_MAX_PAYOUT) });
router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const { maxPayout } = settingsSchema.parse(req.body);
    res.json(await setMaxPayout(maxPayout));
  })
);

// --- Withdrawals (require manual approval — see wallet.routes.ts POST /withdraw) ---

const withdrawalStatusQuery = z.enum(["PENDING", "COMPLETED", "FAILED"]).optional();
router.get(
  "/withdrawals",
  asyncHandler(async (req, res) => {
    const status = withdrawalStatusQuery.parse(req.query.status);
    const withdrawals = await prisma.transaction.findMany({
      where: { type: "WITHDRAWAL", status },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            payoutAccountHolderName: true,
            payoutAccountNumber: true,
            payoutIfsc: true,
          },
        },
      },
      take: 200,
    });
    res.json(withdrawals);
  })
);

// A pending withdrawal is claimed before anything is paid or refunded, by a
// single conditional update that only one request can win: a double click,
// a retried request or an approve racing a reject finds it already claimed
// and stops. While the payment provider is paying it out, the claim is held
// by provider = "processing".
const PROCESSING = "processing";
const unclaimedPendingWithdrawal = (id: string) =>
  ({ id, type: "WITHDRAWAL", status: "PENDING", provider: null }) as const;

router.post(
  "/withdrawals/:transactionId/approve",
  asyncHandler(async (req, res) => {
    const transaction = await prisma.transaction.findUniqueOrThrow({ where: { id: req.params.transactionId } });
    const claimed = await prisma.transaction.updateMany({
      where: unclaimedPendingWithdrawal(transaction.id),
      data: { provider: PROCESSING },
    });
    if (claimed.count === 0) {
      throw new ApiError(400, "This withdrawal is not pending, or is already being processed.");
    }
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: transaction.userId } });
    let result: Awaited<ReturnType<typeof paymentProvider.withdraw>> | null = null;
    try {
      result = await paymentProvider.withdraw({
        userId: transaction.userId,
        amount: Number(transaction.amount),
        currency: wallet.currency,
      });
    } finally {
      if (result?.status !== "COMPLETED") {
        // Nothing was paid: release the claim so it can be approved again or rejected.
        await prisma.transaction.updateMany({
          where: { id: transaction.id, status: "PENDING", provider: PROCESSING },
          data: { provider: null },
        });
      }
    }
    if (result.status !== "COMPLETED") {
      throw new ApiError(502, "Withdrawal could not be completed by the payment provider.");
    }
    const updated = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "COMPLETED", provider: result.provider, providerReferenceId: result.providerReferenceId },
    });
    res.json(updated);
  })
);

router.post(
  "/withdrawals/:transactionId/reject",
  asyncHandler(async (req, res) => {
    const transaction = await prisma.transaction.findUniqueOrThrow({ where: { id: req.params.transactionId } });
    // Refund the earmarked amount (it was deducted the moment the
    // withdrawal was requested — see wallet.routes.ts) and record the
    // reversal as its own transaction so the customer's history stays
    // accurate rather than showing a debit for money that never left.
    // The claim and the refund commit together, so it is refunded once.
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: unclaimedPendingWithdrawal(transaction.id),
        data: { status: "FAILED" },
      });
      if (claimed.count === 0) {
        throw new ApiError(400, "This withdrawal is not pending, or is already being processed.");
      }
      await tx.wallet.update({
        where: { userId: transaction.userId },
        data: { balance: { increment: transaction.amount } },
      });
      await tx.transaction.create({
        data: { userId: transaction.userId, type: "WITHDRAWAL_REVERSAL", amount: transaction.amount, status: "COMPLETED" },
      });
      return tx.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    });
    res.json(updated);
  })
);

// --- Support tickets / Live Support chat ---

router.get(
  "/support-tickets",
  asyncHandler(async (_req, res) => {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      take: 200,
    });
    res.json(tickets);
  })
);

router.get(
  "/support-tickets/:ticketId/messages",
  asyncHandler(async (req, res) => {
    const messages = await prisma.chatMessage.findMany({
      where: { ticketId: req.params.ticketId },
      orderBy: { createdAt: "asc" },
    });
    res.json(messages);
  })
);

const replySchema = z.object({ text: z.string().trim().min(1).max(2000) });

router.post(
  "/support-tickets/:ticketId/reply",
  asyncHandler(async (req, res) => {
    const { text } = replySchema.parse(req.body);
    const message = await prisma.chatMessage.create({
      data: { ticketId: req.params.ticketId, sender: "ADMIN", text },
    });
    res.status(201).json(message);
  })
);

router.patch(
  "/support-tickets/:ticketId/resolve",
  asyncHandler(async (req, res) => {
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.ticketId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    res.json(ticket);
  })
);

// --- Live game monitoring (Win Go / Aviator / ...) ---
// Everything here is read-only — lets an admin watch a round unfold, check
// past rounds against their revealed seed, and audit who's actually been
// betting, without granting any special foresight the game's fairness
// model wouldn't otherwise allow (the live views below return exactly what
// a player already sees).

const winGoDurationQuery = z.coerce.number().refine((n) => winGoService.WINGO_DURATIONS.includes(n as winGoService.WinGoDuration), {
  message: "Invalid duration",
});

router.get(
  "/wingo/live",
  asyncHandler(async (req, res) => {
    const duration = winGoDurationQuery.parse(req.query.duration ?? 30);
    res.json(await winGoService.getCurrentRoundView(duration));
  })
);

router.get(
  "/wingo/rounds",
  asyncHandler(async (req, res) => {
    const duration = winGoDurationQuery.parse(req.query.duration ?? 30);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(await winGoService.getWinGoHistory(duration, limit));
  })
);

router.get(
  "/wingo/bets",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const duration = req.query.duration ? winGoDurationQuery.parse(req.query.duration) : undefined;
    const bets = await prisma.winGoBet.findMany({
      where: duration ? { round: { durationSeconds: duration } } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: userSummarySelect },
        round: { select: { periodNumber: true, durationSeconds: true, settled: true } },
      },
    });
    res.json(bets);
  })
);

router.get(
  "/aviator/live",
  asyncHandler(async (_req, res) => {
    res.json(await aviatorService.getCurrentRoundView());
  })
);

router.get(
  "/aviator/rounds",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(await aviatorService.getHistory(limit));
  })
);

router.get(
  "/aviator/bets",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const bets = await prisma.aviatorBet.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: userSummarySelect },
        round: { select: { periodNumber: true, crashMultiplier: true, settled: true } },
      },
    });
    res.json(bets);
  })
);

router.get("/chicken-road/config", (_req, res) => {
  res.json(getChickenRoadConfig());
});

router.get(
  "/chicken-road/rounds",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rounds = await prisma.chickenRoadRound.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: userSummarySelect } },
    });
    res.json(rounds);
  })
);

router.get("/mines/config", (_req, res) => {
  res.json(getMinesConfig());
});

router.get(
  "/mines/rounds",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rounds = await prisma.minesRound.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: userSummarySelect } },
    });
    res.json(rounds);
  })
);

// --- Home-screen popups ---

router.get(
  "/popups",
  asyncHandler(async (_req, res) => {
    res.json(await popupService.listAllPopups());
  })
);

// Empty text / target clears the button. The target is the app screen name
// of a game (e.g. "Aviator"); the app ignores names it doesn't know.
const popupButtonSchema = {
  buttonText: z.string().trim().max(20).nullish().transform((v) => v || null),
  buttonTarget: z.string().trim().regex(/^[A-Za-z0-9]{0,40}$/).nullish().transform((v) => v || null),
};
const createPopupSchema = z.object({
  title: z.string().trim().min(1).max(80),
  imageBase64: z.string().min(1),
  mimeType: z.enum(popupService.POPUP_MIME_TYPES),
  width: z.number().int().min(50).max(4000),
  height: z.number().int().min(50).max(4000),
  kind: z.enum(popupService.POPUP_KINDS).default("POPUP"),
  ...popupButtonSchema,
});
router.post(
  "/popups",
  asyncHandler(async (req, res) => {
    res.status(201).json(await popupService.createPopup(createPopupSchema.parse(req.body)));
  })
);

const updatePopupSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
  buttonText: popupButtonSchema.buttonText.optional(),
  buttonTarget: popupButtonSchema.buttonTarget.optional(),
});
router.patch(
  "/popups/:id",
  asyncHandler(async (req, res) => {
    res.json(await popupService.updatePopup(req.params.id, updatePopupSchema.parse(req.body)));
  })
);

const reorderPopupsSchema = z.object({ ids: z.array(z.string().min(1)).max(200), kind: z.enum(popupService.POPUP_KINDS).default("POPUP") });
router.post(
  "/popups/reorder",
  asyncHandler(async (req, res) => {
    const { ids, kind } = reorderPopupsSchema.parse(req.body);
    res.json(await popupService.reorderPopups(ids, kind));
  })
);

router.delete(
  "/popups/:id",
  asyncHandler(async (req, res) => {
    await popupService.deletePopup(req.params.id);
    res.status(204).end();
  })
);

export default router;
