import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { runtimeSettings } from "../config/runtimeSettings";

/** Re-read the Setting table at most this often per server instance. */
const REFRESH_MS = 15_000;
let loadedAt = 0;

export const MIN_MAX_PAYOUT = 1000;
export const MAX_MAX_PAYOUT = 10_000_000;

async function load() {
  const rows = await prisma.setting.findMany({ where: { key: { in: ["maxPayout"] } } });
  const maxPayout = Number(rows.find((r) => r.key === "maxPayout")?.value);
  runtimeSettings.maxPayout = Number.isFinite(maxPayout) && maxPayout > 0 ? maxPayout : undefined;
  loadedAt = Date.now();
}

/** Keeps runtimeSettings fresh; called before every request. A failed read keeps the last known values. */
export async function refreshSettingsIfStale() {
  if (Date.now() - loadedAt < REFRESH_MS) return;
  try {
    await load();
  } catch (err) {
    loadedAt = Date.now();
    console.error("Settings refresh failed", err);
  }
}

export function getGameSettings() {
  return { maxPayout: env.games.maxPayout, maxStake: env.games.maxStake, minMaxPayout: MIN_MAX_PAYOUT, maxMaxPayout: MAX_MAX_PAYOUT };
}

export async function setMaxPayout(value: number) {
  await prisma.setting.upsert({ where: { key: "maxPayout" }, update: { value: String(value) }, create: { key: "maxPayout", value: String(value) } });
  await load();
  return getGameSettings();
}
