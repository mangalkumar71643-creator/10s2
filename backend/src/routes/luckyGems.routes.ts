import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getLuckyGemsConfig, getMyLuckyGemsHistory, spinLuckyGems } from "../services/luckyGemsService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getLuckyGemsConfig());
});

const spinSchema = z.object({ bet: z.number().positive(), extraBet: z.boolean().default(false) });

router.post(
  "/spin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bet, extraBet } = spinSchema.parse(req.body);
    res.status(201).json(await spinLuckyGems(req.user!.userId, bet, extraBet));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyLuckyGemsHistory(req.user!.userId, limit));
  })
);

export default router;
