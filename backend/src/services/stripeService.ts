import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { integration } from "./integrationSettings";
import { completeDeposit } from "./depositService";

/**
 * Card deposits through Stripe Checkout (Stripe's own hosted payment page),
 * called over Stripe's REST API with the secret key from the admin panel.
 *
 * Flow: the app asks for a checkout -> a PENDING DEPOSIT row is written with
 * the Checkout Session id -> the player pays on Stripe's page -> the app (or
 * a later wallet visit) asks to confirm -> the session is fetched back from
 * Stripe, and only if Stripe says it is paid, for this player and this
 * amount, is the PENDING row claimed and the wallet credited (once).
 *
 * Only TEST keys are accepted for now: taking real money for gambling needs
 * a gambling licence and the payment company's gambling approval first. In
 * test mode only the phone numbers listed in the panel may use it, so test
 * cards can't put play money in real players' wallets.
 */

export const MIN_CARD_DEPOSIT = 100;
export const MAX_CARD_DEPOSIT = 5000;

export function isTestKey(key: string) {
  return key.startsWith("sk_test_") || key.startsWith("rk_test_");
}

export function assertAllowedStripeKey(key: string) {
  if (!key) return;
  if (!key.startsWith("sk_") && !key.startsWith("rk_")) throw new ApiError(400, "That doesn't look like a Stripe secret key (it should start with sk_test_).");
  if (!isTestKey(key)) {
    throw new ApiError(400, "Live Stripe keys are switched off: real-money card payments need a gambling licence and Stripe's gambling approval first. Use the sk_test_ key.");
  }
}

function secretKey(): string | null {
  const key = integration("stripeSecretKey");
  return key && isTestKey(key) ? key : null;
}

const currency = () => (integration("stripeCurrency") || "inr").toLowerCase();

function testPhones(): string[] {
  return integration("stripeTestPhones")
    .split(/[\s,]+/)
    .map((p) => p.replace(/\D/g, "").slice(-10))
    .filter((p) => p.length === 10);
}

async function stripeRequest<T>(method: "GET" | "POST", path: string, form?: Record<string, string>): Promise<T> {
  const key = secretKey();
  if (!key) throw new ApiError(503, "Card payments are not set up yet.");
  let res: Response;
  try {
    res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error("[stripe] request failed:", err);
    throw new ApiError(502, "Could not reach the payment service. Please try again.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    console.error(`[stripe] ${method} ${path} -> ${res.status}: ${json.error?.message}`);
    throw new ApiError(502, `Payment service error: ${json.error?.message ?? res.status}`);
  }
  return json;
}

/** What the app needs to know to offer card deposits to this player. */
export async function cardDepositStatus(userId: string) {
  const key = secretKey();
  if (!key) return { enabled: false, testMode: false, reason: "Card payments are not set up yet." };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  const phone = (user.phone ?? "").replace(/\D/g, "").slice(-10);
  if (!testPhones().includes(phone)) {
    return { enabled: false, testMode: true, reason: "Card payments are in test mode and not open to this account." };
  }
  return { enabled: true, testMode: true, reason: null, min: MIN_CARD_DEPOSIT, max: MAX_CARD_DEPOSIT, currency: currency() };
}

type CheckoutSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
};

/** Opens a Stripe Checkout page for `amount` and records the PENDING deposit. */
export async function createCardCheckout(userId: string, amount: number, returnBase: string) {
  const status = await cardDepositStatus(userId);
  if (!status.enabled) throw new ApiError(403, status.reason ?? "Card payments are not available.");
  if (amount < MIN_CARD_DEPOSIT || amount > MAX_CARD_DEPOSIT) throw new ApiError(400, `Deposit must be between ${MIN_CARD_DEPOSIT} and ${MAX_CARD_DEPOSIT}.`);

  const minor = Math.round(amount * 100);
  const session = await stripeRequest<CheckoutSession>("POST", "checkout/sessions", {
    mode: "payment",
    "payment_method_types[]": "card",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency(),
    "line_items[0][price_data][unit_amount]": String(minor),
    "line_items[0][price_data][product_data][name]": "NovaPlay wallet deposit",
    client_reference_id: userId,
    "metadata[userId]": userId,
    success_url: `${returnBase}/wallet/card/return?status=success`,
    cancel_url: `${returnBase}/wallet/card/return?status=cancel`,
  });
  if (!session.url) throw new ApiError(502, "The payment service did not return a payment page.");

  await prisma.transaction.create({
    data: { userId, type: "DEPOSIT", amount, status: "PENDING", provider: "stripe", providerReferenceId: session.id },
  });
  return { sessionId: session.id, url: session.url };
}

/**
 * Checks one PENDING card deposit with Stripe and settles it: paid ->
 * credited (exactly once), expired -> FAILED, still open -> left PENDING.
 */
async function settleCardDeposit(userId: string, tx: { id: string; amount: unknown; providerReferenceId: string | null }) {
  const session = await stripeRequest<CheckoutSession>("GET", `checkout/sessions/${encodeURIComponent(tx.providerReferenceId!)}`);
  const amount = Number(tx.amount);
  if (session.client_reference_id !== userId) throw new ApiError(400, "This payment belongs to another account.");

  if (session.payment_status === "paid") {
    if (session.amount_total !== Math.round(amount * 100) || (session.currency ?? "") !== currency()) {
      console.error(`[stripe] amount mismatch on ${session.id}: ${session.amount_total} ${session.currency} vs ${amount}`);
      throw new ApiError(400, "The paid amount does not match this deposit. Please contact support.");
    }
    const result = await completeDeposit(userId, amount, "stripe", session.id, tx.id);
    return { status: "COMPLETED" as const, amount, bonus: result.bonus, alreadyCredited: result.alreadyCompleted };
  }
  if (session.status === "expired") {
    await prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING" }, data: { status: "FAILED" } });
    return { status: "FAILED" as const, amount, bonus: 0, alreadyCredited: false };
  }
  return { status: "PENDING" as const, amount, bonus: 0, alreadyCredited: false };
}

/** Settles this player's open card deposits (most recent first); returns what changed. */
export async function confirmCardDeposits(userId: string, sessionId?: string) {
  const pending = await prisma.transaction.findMany({
    where: {
      userId,
      type: "DEPOSIT",
      provider: "stripe",
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - 48 * 3600 * 1000) },
      ...(sessionId ? { providerReferenceId: sessionId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  if (pending.length === 0) return { results: [] };
  const results = [];
  for (const tx of pending) results.push(await settleCardDeposit(userId, tx));
  return { results };
}
