import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  cashOutAviatorBet,
  getAviatorConfig,
  getCurrentRoundView,
  getHistory,
  getMyBets,
  getMyCurrentBet,
  placeAviatorBet,
} from "../services/aviatorService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getAviatorConfig());
});

router.get(
  "/current",
  asyncHandler(async (_req, res) => {
    res.json(await getCurrentRoundView());
  })
);

router.get(
  "/history",
  asyncHandler(async (_req, res) => {
    res.json(await getHistory());
  })
);

const betSchema = z.object({
  amount: z.number().positive(),
  autoCashoutAt: z.number().min(1.01).optional(),
});

router.post(
  "/bet",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount, autoCashoutAt } = betSchema.parse(req.body);
    const bet = await placeAviatorBet(req.user!.userId, amount, autoCashoutAt);
    res.status(201).json(bet);
  })
);

const cashoutSchema = z.object({
  betId: z.string().min(1),
});

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { betId } = cashoutSchema.parse(req.body);
    res.json(await cashOutAviatorBet(req.user!.userId, betId));
  })
);

router.get(
  "/my-current-bet",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentBet(req.user!.userId));
  })
);

router.get(
  "/my-bets",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyBets(req.user!.userId));
  })
);

export default router;
