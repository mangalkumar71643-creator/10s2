import { randomInt } from "crypto";

/** Cryptographically-random float in [0, 1). Not a substitute for an
 * independently certified RNG — see GameRound model comment. */
export function secureRandomFloat(): number {
  const RESOLUTION = 1_000_000_000;
  return randomInt(0, RESOLUTION) / RESOLUTION;
}
