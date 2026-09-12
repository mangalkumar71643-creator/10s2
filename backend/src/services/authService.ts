import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { comparePassword, hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { isAtLeast18 } from "../utils/age";
import { phoneVerifier } from "./phoneAuthService";

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

export interface PhoneVerifyInput {
  idToken: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  country?: string;
}

/**
 * Verifies the phone via `phoneVerifier` (mock or real Firebase Admin),
 * then either logs in the matching existing user or creates a new one.
 * New users must supply profile fields so age (18+) can be enforced
 * server-side — the mobile app collects these in a one-time "complete
 * your profile" step the first time a phone number is seen.
 */
export async function verifyPhoneAndAuth(input: PhoneVerifyInput) {
  const phone = await phoneVerifier.verifyIdToken(input.idToken);

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    const token = signToken({ userId: existing.id, role: existing.role });
    return { user: sanitizeUser(existing), token, isNewUser: false };
  }

  if (!input.firstName || !input.lastName || !input.dateOfBirth || !input.country) {
    throw new ApiError(428, "profile_required");
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

  const token = signToken({ userId: user.id, role: user.role });
  return { user: sanitizeUser(user), token, isNewUser: true };
}
