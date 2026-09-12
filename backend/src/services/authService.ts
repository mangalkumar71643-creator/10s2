import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { comparePassword, hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { isAtLeast18 } from "../utils/age";
import { consumeOtp, isRecentlyVerified, requestOtp as requestOtpCode, verifyOtp as verifyOtpCode } from "./otpService";

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
}

export async function registerUser(input: RegisterInput) {
  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new ApiError(400, "Invalid date of birth");
  }
  if (!isAtLeast18(dob)) {
    throw new ApiError(403, "You must be at least 18 years old to register.");
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: dob,
      country: input.country,
      wallet: { create: { balance: 0 } },
    },
  });

  const token = signToken({ userId: user.id, role: user.role });
  return { user: sanitizeUser(user), token };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await comparePassword(password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }
  const token = signToken({ userId: user.id, role: user.role });
  return { user: sanitizeUser(user), token };
}

export function sanitizeUser<T extends { passwordHash: string | null }>(user: T) {
  const { passwordHash, ...rest } = user;
  return rest;
}

/** India-only for now — mirrors the mobile app's 10-digit local input. */
function toE164(phone: string): string {
  return phone.startsWith("+") ? phone : `+91${phone}`;
}

/** Step 1: generates and sends (or, in mock mode, returns) an OTP for a
 * phone number. Same endpoint for both login and registration — which
 * one it turns into is decided in `verifyOtpAndAuth` once the code is
 * confirmed. */
export async function sendPhoneOtp(phone: string) {
  return requestOtpCode(toE164(phone));
}

/** Step 2: verifies the OTP. If the phone belongs to an existing user,
 * logs them in directly. If it's brand new, leaves the phone in a
 * "verified" state and asks the caller to complete registration —
 * see `completePhoneRegistration`. */
export async function verifyOtpAndAuth(phoneInput: string, code: string) {
  const phone = toE164(phoneInput);
  await verifyOtpCode(phone, code);

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (!existing) {
    throw new ApiError(428, "profile_required");
  }

  await consumeOtp(phone);
  const token = signToken({ userId: existing.id, role: existing.role });
  return { user: sanitizeUser(existing), token, isNewUser: false };
}

export interface CompleteProfileInput {
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
}

/** Step 3 (new users only): creates the account once the phone has been
 * verified recently enough (see otpService.isRecentlyVerified) — the
 * mobile app doesn't need to re-collect the OTP code for this step. */
export async function completePhoneRegistration(input: CompleteProfileInput) {
  const phone = toE164(input.phone);
  if (!(await isRecentlyVerified(phone))) {
    throw new ApiError(401, "Phone verification expired. Please verify your number again.");
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    await consumeOtp(phone);
    const token = signToken({ userId: existing.id, role: existing.role });
    return { user: sanitizeUser(existing), token, isNewUser: false };
  }

  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new ApiError(400, "Invalid date of birth");
  }
  if (!isAtLeast18(dob)) {
    throw new ApiError(403, "You must be at least 18 years old to register.");
  }

  const user = await prisma.user.create({
    data: {
      phone,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: dob,
      country: input.country,
      wallet: { create: { balance: 0 } },
    },
  });

  await consumeOtp(phone);
  const token = signToken({ userId: user.id, role: user.role });
  return { user: sanitizeUser(user), token, isNewUser: true };
}
