import { prisma } from "../db/prismaClient";
import { generateClientSeed, generateServerSeed, hashServerSeed } from "../utils/rng";

export interface FairnessStatus {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

/** Lazily mints a fresh server/client seed pair the first time a user
 * touches anything fairness-related (fetching status or playing a game). */
export async function ensureFairnessSeed(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.fairnessServerSeed && user.fairnessServerSeedHash && user.fairnessClientSeed) {
    return user;
  }
  const serverSeed = generateServerSeed();
  return prisma.user.update({
    where: { id: userId },
    data: {
      fairnessServerSeed: serverSeed,
      fairnessServerSeedHash: hashServerSeed(serverSeed),
      fairnessClientSeed: user.fairnessClientSeed ?? generateClientSeed(),
      fairnessNonce: 0,
    },
  });
}

export async function getFairnessStatus(userId: string): Promise<FairnessStatus> {
  const user = await ensureFairnessSeed(userId);
  return {
    serverSeedHash: user.fairnessServerSeedHash!,
    clientSeed: user.fairnessClientSeed!,
    nonce: user.fairnessNonce,
  };
}

export async function setClientSeed(userId: string, clientSeed: string): Promise<FairnessStatus> {
  await ensureFairnessSeed(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { fairnessClientSeed: clientSeed, fairnessNonce: 0 },
  });
  return getFairnessStatus(userId);
}

/** Reveals the current server seed (so past rounds played under its hash
 * can be independently verified) and replaces it with a fresh one. */
export async function rotateServerSeed(userId: string) {
  const user = await ensureFairnessSeed(userId);
  const revealedServerSeed = user.fairnessServerSeed!;
  const revealedServerSeedHash = user.fairnessServerSeedHash!;

  await prisma.revealedServerSeed.create({
    data: { userId, serverSeed: revealedServerSeed, serverSeedHash: revealedServerSeedHash },
  });

  const nextServerSeed = generateServerSeed();
  await prisma.user.update({
    where: { id: userId },
    data: {
      fairnessServerSeed: nextServerSeed,
      fairnessServerSeedHash: hashServerSeed(nextServerSeed),
      fairnessNonce: 0,
    },
  });

  return {
    revealedServerSeed,
    revealedServerSeedHash,
    newServerSeedHash: hashServerSeed(nextServerSeed),
  };
}

export function listRevealedSeeds(userId: string) {
  return prisma.revealedServerSeed.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Consumes the next nonce for a round, returning everything needed to
 * both compute and later independently verify the outcome. */
export async function nextRoundSeedMaterial(userId: string) {
  const user = await ensureFairnessSeed(userId);
  const nonce = user.fairnessNonce;
  await prisma.user.update({ where: { id: userId }, data: { fairnessNonce: { increment: 1 } } });
  return {
    serverSeed: user.fairnessServerSeed!,
    serverSeedHash: user.fairnessServerSeedHash!,
    clientSeed: user.fairnessClientSeed!,
    nonce,
  };
}
