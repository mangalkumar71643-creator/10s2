import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { prisma } from "../db/prismaClient";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const sports = await prisma.sport.findMany({ orderBy: { name: "asc" } });
    res.json(sports);
  })
);

router.get(
  "/:sportId/events",
  asyncHandler(async (req, res) => {
    const events = await prisma.event.findMany({
      where: { sportId: req.params.sportId, status: { in: ["SCHEDULED", "LIVE"] } },
      orderBy: { startTime: "asc" },
      include: { markets: { include: { selections: true } } },
    });
    res.json(events);
  })
);

router.get(
  "/events/:eventId",
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: req.params.eventId },
      include: { sport: true, markets: { include: { selections: true } } },
    });
    res.json(event);
  })
);

export default router;
