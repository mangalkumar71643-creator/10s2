import { env } from "../config/env";

export interface SmsProvider {
  readonly name: string;
  sendOtp(phone: string, code: string): Promise<void>;
}

/**
 * Local-development stand-in only — no real SMS is sent. The OTP is
 * returned to the caller (see otpService.ts) so the mobile app can show
 * it on-screen for testing, the same way the old Firebase dev-fallback
 * banner worked. Never use this with real users.
 */
class MockSmsProvider implements SmsProvider {
  readonly name = "mock";

  async sendOtp(phone: string, code: string): Promise<void> {
    console.log(`[MockSmsProvider] OTP for ${phone}: ${code}`);
  }
}

/**
 * Placeholder for SMS_PROVIDER_MODE=live: no live SMS gateway is wired in
 * yet. Plug a UK provider in here (e.g. Twilio or Vonage) before switching
 * to live mode — until then every OTP request fails with a clear error
 * rather than silently not sending.
 */
class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = "unconfigured";

  async sendOtp(): Promise<void> {
    throw new Error("No live SMS provider is configured — add one in smsService.ts before setting SMS_PROVIDER_MODE=live.");
  }
}

export const smsProvider: SmsProvider =
  env.smsProviderMode === "live" ? new UnconfiguredSmsProvider() : new MockSmsProvider();
