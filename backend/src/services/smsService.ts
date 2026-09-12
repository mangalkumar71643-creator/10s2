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
 * Sends a real SMS via Fast2SMS's OTP route
 * (https://www.fast2sms.com/dev/bulkV2?route=otp) — an Indian SMS
 * gateway that accepts UPI, unlike Firebase's Blaze plan which requires
 * an international card. Requires FAST2SMS_API_KEY.
 */
class Fast2SmsProvider implements SmsProvider {
  readonly name = "fast2sms";

  async sendOtp(phone: string, code: string): Promise<void> {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
      throw new Error("FAST2SMS_API_KEY is not set — required when SMS_PROVIDER_MODE=live.");
    }

    // Fast2SMS expects a bare 10-digit Indian number, not E.164.
    const bareNumber = phone.replace(/^\+91/, "");

    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "otp",
        variables_values: code,
        numbers: bareNumber,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Fast2SMS request failed (${res.status}): ${body}`);
    }
    const data = (await res.json().catch(() => null)) as { return?: boolean; message?: string[] } | null;
    if (!data?.return) {
      throw new Error(`Fast2SMS did not confirm delivery: ${JSON.stringify(data)}`);
    }
  }
}

export const smsProvider: SmsProvider =
  env.smsProviderMode === "live" ? new Fast2SmsProvider() : new MockSmsProvider();
