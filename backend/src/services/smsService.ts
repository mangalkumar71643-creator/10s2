import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

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
 * Placeholder for SMS_PROVIDER_MODE=live with no gateway configured: every
 * OTP request fails with a clear error rather than silently not sending.
 */
class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = "unconfigured";

  async sendOtp(): Promise<void> {
    throw new Error("No live SMS provider is configured — set SMS_API_KEY (Fast2SMS) before setting SMS_PROVIDER_MODE=live.");
  }
}

/**
 * Fast2SMS (India, +91 numbers only), POST https://www.fast2sms.com/dev/bulkV2
 * with the account's API key in the Authorization header. Three routes:
 * - "dlt": the DLT-approved OTP template (SMS_TEMPLATE_ID = its Message ID
 *   from Fast2SMS DLT Manager, SMS_SENDER_ID = the approved sender), the
 *   code filling its {#var#}. The proper route for live use.
 * - "otp": Fast2SMS's own fixed OTP message ("Your OTP: 123456"), the code
 *   in variables_values; no template of our own.
 * - "q" (Quick SMS): free text, no DLT setup needed — handy for a first
 *   test, but the dearest per SMS (about ₹5).
 * SMS_ROUTE picks one; by default "dlt" when a template is set, else "q".
 */
export type Fast2SmsRoute = "dlt" | "otp" | "q";
export const FAST2SMS_ROUTES: Fast2SmsRoute[] = ["dlt", "otp", "q"];

export class Fast2SmsProvider implements SmsProvider {
  readonly name = "fast2sms";

  constructor(
    private readonly apiKey: string,
    readonly route: Fast2SmsRoute,
    private readonly senderId: string,
    private readonly templateId: string
  ) {}

  /** The 10-digit Indian number Fast2SMS wants. */
  static toLocal(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(local)) throw new ApiError(400, "SMS can only be sent to Indian (+91) mobile numbers for now.");
    return local;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const numbers = Fast2SmsProvider.toLocal(phone);
    const body =
      this.route === "dlt"
        ? { route: "dlt", sender_id: this.senderId, message: this.templateId, variables_values: code, numbers }
        : this.route === "otp"
          ? { route: "otp", variables_values: code, numbers }
          : { route: "q", message: `Your NovaPlay OTP is ${code}. It is valid for 5 minutes. Do not share it with anyone.`, numbers };

    let res: Response;
    try {
      res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: { Authorization: this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.error("[Fast2SMS] request failed:", err);
      throw new ApiError(502, "Could not send the SMS. Please try again.");
    }
    const json = (await res.json().catch(() => ({}))) as { return?: boolean; message?: unknown; status_code?: number };
    if (!res.ok || json.return !== true) {
      const reason = Array.isArray(json.message) ? json.message.join(" ") : String(json.message ?? `HTTP ${res.status}`);
      console.error(`[Fast2SMS] ${this.route} route refused: ${reason}`);
      throw new ApiError(502, `Could not send the SMS (${reason}).`);
    }
  }
}

/** The Fast2SMS sender built from the environment (or for `routeOverride`), or null if no key is set. */
export function fast2SmsFromEnv(routeOverride?: Fast2SmsRoute): Fast2SmsProvider | null {
  const apiKey = (process.env.SMS_API_KEY ?? "").trim();
  if (!apiKey) return null;
  const templateId = (process.env.SMS_TEMPLATE_ID ?? "").trim();
  const senderId = (process.env.SMS_SENDER_ID ?? "").trim();
  const configured = FAST2SMS_ROUTES.find((r) => r === process.env.SMS_ROUTE);
  const route: Fast2SmsRoute = routeOverride ?? configured ?? (templateId ? "dlt" : "q");
  if (route === "dlt" && (!templateId || !senderId)) throw new Error("SMS_ROUTE=dlt needs SMS_SENDER_ID and SMS_TEMPLATE_ID.");
  return new Fast2SmsProvider(apiKey, route, senderId, templateId);
}

function liveProvider(): SmsProvider {
  try {
    return fast2SmsFromEnv() ?? new UnconfiguredSmsProvider();
  } catch (err) {
    // A half-set configuration must not take the whole server down; OTP requests report it instead.
    console.error("[sms]", (err as Error).message);
    return new UnconfiguredSmsProvider();
  }
}

export const smsProvider: SmsProvider = env.smsProviderMode === "live" ? liveProvider() : new MockSmsProvider();
