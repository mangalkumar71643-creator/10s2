import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { placeBet } from "../services/betService";

const router = Router();

const placeBetSchema = z.object({
  selectionId: z.string().uuid(),
  stake: z.number().positive(),
});

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { selectionId, stake } = placeBetSchema.parse(req.body);
    const bet = await placeBet(req.user!.userId, selectionId, stake);
    res.status(201).json(bet);
  })
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bets = await prisma.bet.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: { selection: { include: { market: { include: { event: true } } } } },
    });
    res.json(bets);
  })
);

export default router;
