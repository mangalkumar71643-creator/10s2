import { createHash, randomInt } from "crypto";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { smsProvider } from "./smsService";
import { env } from "../config/env";

const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFIED_GRACE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Requests a fresh OTP for `phone`. Returns the raw code only in mock
 * mode (SMS_PROVIDER_MODE=mock) so the mobile app can display it for
 * local testing — in live mode it's sent via SMS and never returned. */
export async function requestOtp(phone: string): Promise<{ devCode: string | null }> {
  const recent = await prisma.phoneOtp.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "Please wait before requesting another code.");
  }

  const code = generateCode();
  await prisma.phoneOtp.create({
    data: {
      phone,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  await smsProvider.sendOtp(phone, code);
  return { devCode: env.smsProviderMode === "mock" ? code : null };
}

/** Verifies `code` against the latest unconsumed OTP for `phone`. On
 * success, marks it verified (but doesn't delete it yet — see
 * `isRecentlyVerified`, used by the complete-profile step for a
 * brand-new phone number) and returns. Throws on mismatch/expiry/too
 * many attempts. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new ApiError(400, "No code was requested for this number.");
  if (otp.expiresAt < new Date()) throw new ApiError(400, "Code expired. Please request a new one.");
  if (otp.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "Too many attempts. Please request a new code.");

  if (otp.codeHash !== hashCode(code)) {
    await prisma.phoneOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(400, "Incorrect code. Please try again.");
  }

  await prisma.phoneOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
}

/** Used by the complete-profile step: was this phone number verified
 * recently enough to trust it without asking for the code again? */
export async function isRecentlyVerified(phone: string): Promise<boolean> {
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, verifiedAt: { not: null } },
    orderBy: { verifiedAt: "desc" },
  });
  if (!otp || !otp.verifiedAt) return false;
  return Date.now() - otp.verifiedAt.getTime() < VERIFIED_GRACE_MS;
}

/** Call after a login/registration completes so the same code/verified
 * session can't be reused. */
export async function consumeOtp(phone: string): Promise<void> {
  await prisma.phoneOtp.deleteMany({ where: { phone } });
}
