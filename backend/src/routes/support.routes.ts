import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";

const router = Router();

const escalateSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  message: z.string().trim().max(2000).optional(),
});

router.post(
  "/escalate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { topic, message } = escalateSchema.parse(req.body);
    const ticket = await prisma.supportTicket.create({
      data: { userId: req.user!.userId, topic, message: message || null },
    });
    res.status(201).json(ticket);
  })
);

export default router;
