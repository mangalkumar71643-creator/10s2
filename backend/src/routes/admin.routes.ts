import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { settleMarket } from "../services/betService";
import { paymentProvider } from "../services/paymentService";

const router = Router();
router.use(requireAuth, requireAdmin);

// --- Sports / events / markets / odds management ---

const sportSchema = z.object({ name: z.string().min(1), slug: z.string().min(1) });
router.post(
  "/sports",
  asyncHandler(async (req, res) => {
    const input = sportSchema.parse(req.body);
    const sport = await prisma.sport.create({ data: input });
    res.status(201).json(sport);
  })
);

const eventSchema = z.object({
  sportId: z.string().uuid(),
  name: z.string().min(1),
  startTime: z.string(),
});
router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const input = eventSchema.parse(req.body);
    const event = await prisma.event.create({
      data: { ...input, startTime: new Date(input.startTime) },
    });
    res.status(201).json(event);
  })
);

const marketSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1),
  selections: z.array(z.object({ name: z.string().min(1), odds: z.number().positive() })).min(2),
});
router.post(
  "/markets",
  asyncHandler(async (req, res) => {
    const input = marketSchema.parse(req.body);
    const market = await prisma.market.create({
      data: {
        eventId: input.eventId,
        name: input.name,
        selections: { create: input.selections },
      },
      include: { selections: true },
    });
    res.status(201).json(market);
  })
);

const oddsUpdateSchema = z.object({ odds: z.number().positive() });
router.patch(
  "/selections/:selectionId/odds",
  asyncHandler(async (req, res) => {
    const { odds } = oddsUpdateSchema.parse(req.body);
    const selection = await prisma.selection.update({
      where: { id: req.params.selectionId },
      data: { odds },
    });
    res.json(selection);
  })
);

const settleSchema = z.object({ winningSelectionId: z.string().uuid() });
router.post(
  "/markets/:marketId/settle",
  asyncHandler(async (req, res) => {
    const { winningSelectionId } = settleSchema.parse(req.body);
    const market = await settleMarket(req.params.marketId, winningSelectionId);
    res.json(market);
  })
);

// --- Users / KYC / bets / reports ---

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
  "/bets",
  asyncHandler(async (_req, res) => {
    const bets = await prisma.bet.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { email: true } }, selection: true },
    });
    res.json(bets);
  })
);

router.get(
  "/reports/summary",
  asyncHandler(async (_req, res) => {
    const [totalStaked, totalPayout, betCount, userCount] = await Promise.all([
      prisma.transaction.aggregate({ where: { type: "BET_STAKE" }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: "BET_PAYOUT" }, _sum: { amount: true } }),
      prisma.bet.count(),
      prisma.user.count(),
    ]);
    res.json({
      totalStaked: totalStaked._sum.amount ?? 0,
      totalPayout: totalPayout._sum.amount ?? 0,
      betCount,
      userCount,
    });
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

export default router;
