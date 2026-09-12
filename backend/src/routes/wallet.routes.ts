import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { paymentProvider } from "../services/paymentService";
import { assertCanTransact, assertWithinDepositLimits } from "../services/responsibleGamblingService";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: req.user!.userId } });
    res.json(wallet);
  })
);

const amountSchema = z.object({ amount: z.number().positive() });

router.post(
  "/deposit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    const userId = req.user!.userId;

    await assertCanTransact(userId);
    await assertWithinDepositLimits(userId, amount);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const result = await paymentProvider.deposit({ userId, amount, currency: wallet.currency });

    if (result.status !== "COMPLETED") {
      await prisma.transaction.create({
        data: {
          userId,
          type: "DEPOSIT",
          amount,
          status: result.status,
          provider: result.provider,
          providerReferenceId: result.providerReferenceId,
        },
      });
      throw new ApiError(402, "Deposit could not be completed by the payment provider.");
    }

    const [, updatedWallet] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          type: "DEPOSIT",
          amount,
          status: "COMPLETED",
          provider: result.provider,
          providerReferenceId: result.providerReferenceId,
        },
      }),
      prisma.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      }),
    ]);

    res.json(updatedWallet);
  })
);

router.post(
  "/withdraw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    const userId = req.user!.userId;

    await assertCanTransact(userId);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    if (Number(wallet.balance) < amount) {
      throw new ApiError(400, "Insufficient balance");
    }

    const result = await paymentProvider.withdraw({ userId, amount, currency: wallet.currency });
    if (result.status !== "COMPLETED") {
      throw new ApiError(502, "Withdrawal could not be completed by the payment provider.");
    }

    const [, updatedWallet] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          type: "WITHDRAWAL",
          amount,
          status: "COMPLETED",
          provider: result.provider,
          providerReferenceId: result.providerReferenceId,
        },
      }),
      prisma.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      }),
    ]);

    res.json(updatedWallet);
  })
);

router.get(
  "/transactions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(transactions);
  })
);

export default router;
