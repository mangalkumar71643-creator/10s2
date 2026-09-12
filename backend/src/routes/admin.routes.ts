import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { settleMarket } from "../services/betService";

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
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        kycStatus: true,
        isSelfExcluded: true,
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

export default router;
