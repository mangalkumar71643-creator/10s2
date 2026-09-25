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
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        payoutAccountHolderName: true,
        payoutAccountNumber: true,
        payoutIfsc: true,
        firstDepositBonusClaimed: true,
      },
    }),
    prisma.transaction.aggregate({
      // PENDING counts too so a still-unapproved withdrawal already
      // earmarked against the daily limit — otherwise a user could
      // submit several pending requests to bypass it before any are
      // approved.
      where: { userId, type: "WITHDRAWAL", status: { in: ["PENDING", "COMPLETED"] }, createdAt: { gte: startOfDay() } },
      _sum: { amount: true },
    }),
  ]);

  const withdrawnToday = Number(todaysWithdrawals._sum.amount ?? 0);
  const remainingWithdrawalLimit = Math.max(0, env.wallet.dailyWithdrawalLimit - withdrawnToday);
  const withdrawable = Math.max(0, Number(wallet.balance) - Number(wallet.lockedBonus));

  return {
    ...wallet,
    payoutAccountHolderName: user.payoutAccountHolderName,
    payoutAccountNumber: user.payoutAccountNumber,
    payoutIfsc: user.payoutIfsc,
    hasPayoutAccount: Boolean(user.payoutAccountHolderName && user.payoutAccountNumber && user.payoutIfsc),
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
    // wageringMultiplier x the bonus has been staked in games — each game
    // service (e.g. vortexService.ts, andarBaharService.ts) advances
    // wageringProgress and releases the lock.
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

const payoutAccountSchema = z.object({
  accountHolderName: z.string().trim().min(2, "Enter the account holder's name").max(120),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, "Enter a valid account number"),
  ifsc: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Enter a valid 11-character IFSC code")
    .transform((v) => v.toUpperCase()),
});

router.put(
  "/payout-account",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { accountHolderName, accountNumber, ifsc } = payoutAccountSchema.parse(req.body);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { payoutAccountHolderName: accountHolderName, payoutAccountNumber: accountNumber, payoutIfsc: ifsc },
    });
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

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { payoutAccountHolderName: true, payoutAccountNumber: true, payoutIfsc: true },
    });
    if (!user.payoutAccountHolderName || !user.payoutAccountNumber || !user.payoutIfsc) {
      throw new ApiError(400, "Add your bank account before withdrawing.");
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

    // Withdrawals now require manual admin approval (see admin.routes.ts
    // PATCH /admin/withdrawals/:id/approve|reject) rather than completing
    // instantly — the amount is deducted right away so the funds are
    // earmarked and can't be double-spent while the request is pending.
    await prisma.$transaction([
      prisma.transaction.create({
        data: { userId, type: "WITHDRAWAL", amount, status: "PENDING" },
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
