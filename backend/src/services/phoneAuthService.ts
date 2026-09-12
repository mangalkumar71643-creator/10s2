import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

export interface PhoneVerifier {
  readonly name: string;
  /** Returns the verified E.164 phone number, or throws if the token is invalid. */
  verifyIdToken(idToken: string): Promise<string>;
}

/**
 * Local-development stand-in only. It trusts whatever phone number the
 * client claims without verifying anything — never use this in production.
 * The mobile app already runs Firebase Phone Auth client-side; this mode
 * just skips the server-side check while you don't have Firebase Admin
 * credentials configured yet.
 */
class MockPhoneVerifier implements PhoneVerifier {
  readonly name = "mock";

  async verifyIdToken(idToken: string): Promise<string> {
    // In mock mode the mobile app sends the raw phone number in place of a
    // real Firebase ID token (see mobile/src/api/backendAuth.ts).
    if (!idToken.startsWith("+")) {
      throw new ApiError(400, "Expected an E.164 phone number in mock phone-auth mode.");
    }
    return idToken;
  }
}

/**
 * Verifies a real Firebase ID token server-side using Firebase Admin.
 * Requires `firebase-admin` and a service account — see README for setup.
 */
class LiveFirebasePhoneVerifier implements PhoneVerifier {
  readonly name = "firebase";

  async verifyIdToken(_idToken: string): Promise<string> {
    throw new ApiError(
      501,
      "LiveFirebasePhoneVerifier is not wired up yet. Install `firebase-admin`, set " +
        "FIREBASE_SERVICE_ACCOUNT_JSON, and implement verifyIdToken() using " +
        "admin.auth().verifyIdToken() before setting PHONE_AUTH_MODE=live."
    );
  }
}

export const phoneVerifier: PhoneVerifier =
  env.phoneAuthMode === "live" ? new LiveFirebasePhoneVerifier() : new MockPhoneVerifier();
