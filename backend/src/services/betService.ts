import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { assertCanTransact } from "./responsibleGamblingService";

export async function placeBet(userId: string, selectionId: string, stake: number) {
  await assertCanTransact(userId);

  const selection = await prisma.selection.findUnique({
    where: { id: selectionId },
    include: { market: { include: { event: true } } },
  });
  if (!selection) throw new ApiError(404, "Selection not found");
  if (selection.market.status !== "OPEN") throw new ApiError(400, "This market is not open for betting");
  if (selection.market.event.status !== "SCHEDULED" && selection.market.event.status !== "LIVE") {
    throw new ApiError(400, "This event is not open for betting");
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  if (Number(wallet.balance) < stake) throw new ApiError(400, "Insufficient balance");

  const odds = Number(selection.odds);
  const potentialPayout = Math.round(stake * odds * 100) / 100;

  const [bet] = await prisma.$transaction([
    prisma.bet.create({
      data: {
        userId,
        selectionId,
        stake,
        odds,
        potentialPayout,
        status: "PENDING",
      },
    }),
    prisma.wallet.update({ where: { userId }, data: { balance: { decrement: stake } } }),
  ]);

  await prisma.transaction.create({
    data: {
      userId,
      type: "BET_STAKE",
      amount: stake,
      status: "COMPLETED",
      betId: bet.id,
    },
  });

  return bet;
}

/** Admin: settle a market by marking the winning selection, paying out winners. */
export async function settleMarket(marketId: string, winningSelectionId: string) {
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    include: { selections: { include: { bets: true } } },
  });
  if (!market) throw new ApiError(404, "Market not found");
  if (market.status === "SETTLED") throw new ApiError(400, "Market already settled");

  const winningSelection = market.selections.find((s) => s.id === winningSelectionId);
  if (!winningSelection) throw new ApiError(400, "Winning selection does not belong to this market");

  for (const selection of market.selections) {
    await prisma.selection.update({
      where: { id: selection.id },
      data: { isWinner: selection.id === winningSelectionId },
    });

    for (const bet of selection.bets) {
      if (bet.status !== "PENDING") continue;
      const won = selection.id === winningSelectionId;

      await prisma.bet.update({
        where: { id: bet.id },
        data: { status: won ? "WON" : "LOST", settledAt: new Date() },
      });

      if (won) {
        await prisma.$transaction([
          prisma.wallet.update({
            where: { userId: bet.userId },
            data: { balance: { increment: Number(bet.potentialPayout) } },
          }),
          prisma.transaction.create({
            data: {
              userId: bet.userId,
              type: "BET_PAYOUT",
              amount: bet.potentialPayout,
              status: "COMPLETED",
              betId: bet.id,
            },
          }),
        ]);
      }
    }
  }

  return prisma.market.update({ where: { id: marketId }, data: { status: "SETTLED" } });
}
