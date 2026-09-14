import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  COLOR_GAME_DURATIONS,
  getColorGameConfig,
  getCurrentRoundView,
  getHistory,
  getMyBets,
  placeColorGameBet,
} from "../services/colorGameService";

const router = Router();

function parseDuration(raw: string): number {
  const duration = Number(raw);
  if (!COLOR_GAME_DURATIONS.includes(duration as (typeof COLOR_GAME_DURATIONS)[number])) {
    throw new ApiError(400, `Invalid duration. Choose one of: ${COLOR_GAME_DURATIONS.join(", ")}`);
  }
  return duration;
}

router.get("/config", (_req, res) => {
  res.json(getColorGameConfig());
});

router.get(
  "/:duration/current",
  asyncHandler(async (req, res) => {
    const duration = parseDuration(req.params.duration);
    res.json(await getCurrentRoundView(duration));
  })
);

router.get(
  "/:duration/history",
  asyncHandler(async (req, res) => {
    const duration = parseDuration(req.params.duration);
    res.json(await getHistory(duration));
  })
);

const betSchema = z.object({
  betType: z.enum(["NUMBER", "COLOR", "SIZE"]),
  betValue: z.string().min(1).max(10),
  amount: z.number().positive(),
});

router.post(
  "/:duration/bet",
  requireAuth,
  asyncHandler(async (req, res) => {
    const duration = parseDuration(req.params.duration);
    const { betType, betValue, amount } = betSchema.parse(req.body);
    const bet = await placeColorGameBet(req.user!.userId, duration, betType, betValue, amount);
    res.status(201).json(bet);
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
