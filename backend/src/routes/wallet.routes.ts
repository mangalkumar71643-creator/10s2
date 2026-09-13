import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { paymentProvider } from "../services/paymentService";
import { assertCanTransact, assertWithinDepositLimits } from "../services/responsibleGamblingService";
import { env } from "../config/env";

const router = Router();

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Shared response shape for GET/deposit/withdraw so the mobile app always
 * sees the same fields: raw wallet columns plus the derived numbers it
 * actually needs (how much is really free to withdraw right now, and how
 * much of today's withdrawal limit is left). */
async function buildWalletView(userId: string) {
  const [wallet, user, todaysWithdrawals] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({ where: { userId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { payoutUpiId: true, firstDepositBonusClaimed: true } }),
    prisma.transaction.aggregate({
      where: { userId, type: "WITHDRAWAL", status: "COMPLETED", createdAt: { gte: startOfDay() } },
      _sum: { amount: true },
    }),
  ]);

  const withdrawnToday = Number(todaysWithdrawals._sum.amount ?? 0);
  const remainingWithdrawalLimit = Math.max(0, env.wallet.dailyWithdrawalLimit - withdrawnToday);
  const withdrawable = Math.max(0, Number(wallet.balance) - Number(wallet.lockedBonus));

  return {
    ...wallet,
    payoutUpiId: user.payoutUpiId,
    firstDepositBonusClaimed: user.firstDepositBonusClaimed,
    withdrawable,
    dailyWithdrawalLimit: env.wallet.dailyWithdrawalLimit,
    remainingWithdrawalLimit: Math.min(remainingWithdrawalLimit, withdrawable),
  };
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await buildWalletView(req.user!.userId));
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

    const [wallet, user] = await Promise.all([
      prisma.wallet.findUniqueOrThrow({ where: { userId } }),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstDepositBonusClaimed: true } }),
    ]);
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

    // First-deposit-only bonus: min(amount * percent, cap), credited into
    // balance (immediately playable) and locked from withdrawal until
    // wageringMultiplier x the bonus has been staked in games — see
    // gameEngineService.ts for where wageringProgress advances and the
    // lock is released.
    const bonus = user.firstDepositBonusClaimed
      ? 0
      : Math.round(Math.min(amount * env.wallet.firstDepositBonusPercent, env.wallet.firstDepositBonusCap) * 100) / 100;

    const ops: Prisma.PrismaPromise<unknown>[] = [
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
    ];

    if (bonus > 0) {
      ops.push(
        prisma.transaction.create({
          data: { userId, type: "DEPOSIT_BONUS", amount: bonus, status: "COMPLETED", provider: "novaplay-promo" },
        }),
        prisma.wallet.update({
          where: { userId },
          data: {
            balance: { increment: bonus },
            lockedBonus: { increment: bonus },
            wageringRequired: { increment: bonus * env.wallet.wageringMultiplier },
          },
        }),
        prisma.user.update({ where: { id: userId }, data: { firstDepositBonusClaimed: true } })
      );
    }

    await prisma.$transaction(ops);
    res.json({ ...(await buildWalletView(userId)), bonusGranted: bonus });
  })
);

const payoutAccountSchema = z.object({ upiId: z.string().min(3).max(64).regex(/^[\w.\-]+@[\w.\-]+$/, "Enter a valid UPI ID") });

router.put(
  "/payout-account",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { upiId } = payoutAccountSchema.parse(req.body);
    await prisma.user.update({ where: { id: req.user!.userId }, data: { payoutUpiId: upiId } });
    res.json(await buildWalletView(req.user!.userId));
  })
);

router.post(
  "/withdraw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    const userId = req.user!.userId;

    await assertCanTransact(userId);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { payoutUpiId: true } });
    if (!user.payoutUpiId) {
      throw new ApiError(400, "Add a UPI ID before withdrawing.");
    }

    const view = await buildWalletView(userId);
    if (amount > view.withdrawable) {
      const lockedBonus = Number(view.lockedBonus);
      throw new ApiError(
        400,
        lockedBonus > 0
          ? `Only ₹${view.withdrawable.toFixed(2)} is withdrawable right now — ₹${lockedBonus.toFixed(2)} bonus is still locked until its wagering requirement is met.`
          : "Insufficient balance"
      );
    }
    if (amount > view.remainingWithdrawalLimit) {
      throw new ApiError(400, `This would exceed today's withdrawal limit. Remaining today: ₹${view.remainingWithdrawalLimit.toFixed(2)}.`);
    }

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const result = await paymentProvider.withdraw({ userId, amount, currency: wallet.currency });
    if (result.status !== "COMPLETED") {
      throw new ApiError(502, "Withdrawal could not be completed by the payment provider.");
    }

    await prisma.$transaction([
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

    res.json(await buildWalletView(userId));
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
