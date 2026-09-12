import { createHash, createHmac, randomBytes, randomInt } from "crypto";

/** Cryptographically-random float in [0, 1). Only used to mint fresh
 * seeds — actual game outcomes use `fairRandomFloat` below so they're
 * independently verifiable. */
export function secureRandomFloat(): number {
  const RESOLUTION = 1_000_000_000;
  return randomInt(0, RESOLUTION) / RESOLUTION;
}

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function hashServerSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

export function generateClientSeed(): string {
  return randomBytes(8).toString("hex");
}

/**
 * The standard "provably fair" construction used by dice/crash-style
 * games: a float in [0, 1) derived deterministically from a secret
 * server seed, a player-chosen client seed, and a per-round nonce via
 * HMAC-SHA256. The server commits to serverSeedHash = sha256(serverSeed)
 * *before* any round is played; once the seed is later rotated out and
 * revealed, anyone can recompute this function and confirm every round
 * played under that seed was not tampered with. This proves the
 * *process* is fair — it is not the same as accredited RNG certification.
 */
export function fairRandomFloat(serverSeed: string, clientSeed: string, nonce: number): number {
  const digest = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`).digest("hex");
  const intVal = parseInt(digest.slice(0, 8), 16);
  return intVal / 0x100000000;
}
