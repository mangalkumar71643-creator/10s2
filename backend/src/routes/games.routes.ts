import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { claimDailyBonus, playGame } from "../services/gameEngineService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json({
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    rtp: env.games.rtp,
  });
});

const playSchema = z.object({ stake: z.number().positive() });

router.post(
  "/:gameKey/play",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = playSchema.parse(req.body);
    const result = await playGame(req.user!.userId, req.params.gameKey, stake);
    res.status(201).json(result);
  })
);

router.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rounds = await prisma.gameRound.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(rounds);
  })
);

router.get(
  "/daily-bonus/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: { dailyStreak: true, lastDailyClaimAt: true },
    });
    const claimedToday =
      !!user.lastDailyClaimAt && user.lastDailyClaimAt.toDateString() === new Date().toDateString();
    res.json({ ...user, claimedToday });
  })
);

router.post(
  "/daily-bonus/claim",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await claimDailyBonus(req.user!.userId);
    res.json(result);
  })
);

export default router;
