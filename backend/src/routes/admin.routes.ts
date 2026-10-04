import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { paymentProvider } from "../services/paymentService";
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

router.post(
  "/withdrawals/:transactionId/approve",
  asyncHandler(async (req, res) => {
    const transaction = await prisma.transaction.findUniqueOrThrow({ where: { id: req.params.transactionId } });
    if (transaction.type !== "WITHDRAWAL" || transaction.status !== "PENDING") {
      throw new ApiError(400, "This withdrawal is not pending.");
    }
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: transaction.userId } });
    const result = await paymentProvider.withdraw({
      userId: transaction.userId,
      amount: Number(transaction.amount),
      currency: wallet.currency,
    });
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
    if (transaction.type !== "WITHDRAWAL" || transaction.status !== "PENDING") {
      throw new ApiError(400, "This withdrawal is not pending.");
    }
    // Refund the earmarked amount (it was deducted the moment the
    // withdrawal was requested — see wallet.routes.ts) and record the
    // reversal as its own transaction so the customer's history stays
    // accurate rather than showing a debit for money that never left.
    const [updated] = await prisma.$transaction([
      prisma.transaction.update({ where: { id: transaction.id }, data: { status: "FAILED" } }),
      prisma.wallet.update({
        where: { userId: transaction.userId },
        data: { balance: { increment: transaction.amount } },
      }),
      prisma.transaction.create({
        data: { userId: transaction.userId, type: "WITHDRAWAL_REVERSAL", amount: transaction.amount, status: "COMPLETED" },
      }),
    ]);
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
