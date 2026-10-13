import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { integration } from "./integrationSettings";
import { completeDeposit } from "./depositService";

/**
 * Card / wallet deposits through a hosted payment page — Stripe Checkout,
 * PayPal Checkout or Checkout.com Hosted Payments — whichever the admin
 * picked in the panel (Payment & SMS keys), with that company's keys.
 *
 * Flow: the app asks for a checkout -> the gateway's page is created and a
 * PENDING DEPOSIT row is written with its id -> the player pays there -> the
 * app (or a later visit to Deposit) asks to confirm -> the payment is looked
 * up with the gateway itself, and only when the gateway says it is paid, in
 * this amount and currency, is the PENDING row claimed and the wallet
 * credited (once). The row's id was created server-side for this player, so
 * a player can only ever settle their own payments.
 *
 * Only TEST / SANDBOX keys are accepted for now: taking real money for
 * gambling needs a gambling licence and the payment company's gambling
 * approval first. In test mode only the phone numbers listed in the panel
 * may deposit, so test cards can't put play money in real players' wallets.
 */

export const MIN_CARD_DEPOSIT = 100;
export const MAX_CARD_DEPOSIT = 5000;

export const GATEWAYS = ["stripe", "paypal", "checkout"] as const;
export type Gateway = (typeof GATEWAYS)[number];
const GATEWAY_NAMES: Record<Gateway, string> = { stripe: "Stripe", paypal: "PayPal", checkout: "Checkout.com" };

type Check = { state: "paid" | "pending" | "failed"; amountMinor?: number; currency?: string };
interface GatewayClient {
  configured(): boolean;
  create(amount: number, currency: string, returnBase: string, userId: string): Promise<{ id: string; url: string }>;
  check(id: string): Promise<Check>;
}

async function callJson<T>(label: string, url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    console.error(`[${label}] request failed:`, err);
    throw new ApiError(502, "Could not reach the payment service. Please try again.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string; message?: string; error_type?: string };
  if (!res.ok) {
    const err = json.error;
    const reason = (typeof err === "object" ? err?.message : err) ?? json.message ?? json.error_type ?? `HTTP ${res.status}`;
    console.error(`[${label}] ${init.method ?? "GET"} ${url} -> ${res.status}: ${reason}`);
    throw new ApiError(502, `Payment service error: ${reason}`);
  }
  return json;
}

const returnUrls = (base: string) => ({ success: `${base}/wallet/card/return?status=success`, cancel: `${base}/wallet/card/return?status=cancel` });

// --- Stripe Checkout (secret key sk_test_...) ---
const stripeKey = () => {
  const k = integration("stripeSecretKey");
  return k.startsWith("sk_test_") || k.startsWith("rk_test_") ? k : "";
};
const stripe: GatewayClient = {
  configured: () => Boolean(stripeKey()),
  async create(amount, currency, base, userId) {
    const urls = returnUrls(base);
    const s = await callJson<{ id: string; url: string | null }>("stripe", "https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey()}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        mode: "payment",
        "payment_method_types[]": "card",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": currency,
        "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
        "line_items[0][price_data][product_data][name]": "NovaPlay wallet deposit",
        client_reference_id: userId,
        success_url: urls.success,
        cancel_url: urls.cancel,
      }).toString(),
    });
    if (!s.url) throw new ApiError(502, "The payment service did not return a payment page.");
    return { id: s.id, url: s.url };
  },
  async check(id) {
    const s = await callJson<{ status: string; payment_status: string; amount_total: number | null; currency: string | null }>(
      "stripe",
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${stripeKey()}` } }
    );
    if (s.payment_status === "paid") return { state: "paid", amountMinor: s.amount_total ?? -1, currency: s.currency ?? "" };
    return { state: s.status === "expired" ? "failed" : "pending" };
  },
};

// --- PayPal Checkout, sandbox only (Client ID + Secret from developer.paypal.com) ---
const PAYPAL = "https://api-m.sandbox.paypal.com";
async function paypalToken(): Promise<string> {
  const id = integration("paypalClientId");
  const secret = integration("paypalSecret");
  const t = await callJson<{ access_token: string }>("paypal", `${PAYPAL}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  return t.access_token;
}
type PaypalOrder = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { payments?: { captures?: { status: string; amount: { currency_code: string; value: string } }[] } }[];
};
const paypal: GatewayClient = {
  configured: () => Boolean(integration("paypalClientId") && integration("paypalSecret")),
  async create(amount, currency, base, userId) {
    const urls = returnUrls(base);
    const order = await callJson<PaypalOrder>("paypal", `${PAYPAL}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await paypalToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ custom_id: userId, description: "NovaPlay wallet deposit", amount: { currency_code: currency.toUpperCase(), value: amount.toFixed(2) } }],
        application_context: { brand_name: "NovaPlay", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: urls.success, cancel_url: urls.cancel },
      }),
    });
    const url = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
    if (!url) throw new ApiError(502, "The payment service did not return a payment page.");
    return { id: order.id, url };
  },
  async check(id) {
    const token = await paypalToken();
    let order = await callJson<PaypalOrder>("paypal", `${PAYPAL}/v2/checkout/orders/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (order.status === "APPROVED") {
      // The buyer approved on PayPal's page; take the money now. The request
      // id makes a repeated capture (two confirms at once) return the same result.
      order = await callJson<PaypalOrder>("paypal", `${PAYPAL}/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `capture-${id}` },
        body: "{}",
      });
    }
    if (order.status === "COMPLETED") {
      const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
      if (cap?.status === "COMPLETED") return { state: "paid", amountMinor: Math.round(Number(cap.amount.value) * 100), currency: cap.amount.currency_code.toLowerCase() };
      return { state: cap && ["DECLINED", "FAILED"].includes(cap.status) ? "failed" : "pending" };
    }
    return { state: order.status === "VOIDED" ? "failed" : "pending" };
  },
};

// --- Checkout.com Hosted Payments Page, sandbox only (secret key sk_sbox_...) ---
const ckoKey = () => {
  const k = integration("checkoutSecretKey");
  return k.startsWith("sk_sbox_") ? k : "";
};
const ckoBase = () => {
  const prefix = integration("checkoutPrefix").replace(/[^a-z0-9-]/gi, "");
  return prefix ? `https://${prefix}.api.sandbox.checkout.com` : "https://api.sandbox.checkout.com";
};
const checkout: GatewayClient = {
  configured: () => Boolean(ckoKey()),
  async create(amount, currency, base, userId) {
    const urls = returnUrls(base);
    const hpp = await callJson<{ id: string; _links?: { redirect?: { href: string } } }>("checkout.com", `${ckoBase()}/hosted-payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ckoKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: currency.toUpperCase(),
        reference: `np-${userId.slice(0, 8)}-${Date.now()}`,
        description: "NovaPlay wallet deposit",
        billing: { address: { country: "GB" } },
        success_url: urls.success,
        failure_url: urls.cancel,
        cancel_url: urls.cancel,
      }),
    });
    const url = hpp._links?.redirect?.href;
    if (!url) throw new ApiError(502, "The payment service did not return a payment page.");
    return { id: hpp.id, url };
  },
  async check(id) {
    const h = await callJson<{ status: string; amount: number; currency: string }>("checkout.com", `${ckoBase()}/hosted-payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${ckoKey()}` },
    });
    if (h.status === "Payment Received") return { state: "paid", amountMinor: h.amount, currency: (h.currency ?? "").toLowerCase() };
    return { state: h.status === "Expired" ? "failed" : "pending" };
  },
};

const CLIENTS: Record<Gateway, GatewayClient> = { stripe, paypal, checkout };

/** Refuses live keys when the admin saves them. */
export function assertSandboxKeys(patch: { stripeSecretKey?: string; checkoutSecretKey?: string }) {
  const s = patch.stripeSecretKey?.trim();
  if (s) {
    if (!/^(sk|rk)_/.test(s)) throw new ApiError(400, "That doesn't look like a Stripe secret key (it should start with sk_test_).");
    if (!/^(sk|rk)_test_/.test(s)) throw new ApiError(400, "Live Stripe keys are switched off: real-money payments need a gambling licence and the payment company's approval first. Use the sk_test_ key.");
  }
  const c = patch.checkoutSecretKey?.trim();
  if (c && !c.startsWith("sk_sbox_")) throw new ApiError(400, "Only Checkout.com SANDBOX secret keys (sk_sbox_...) are allowed for now.");
}

/** The gateway in use: the one picked in the panel, else the first one with keys. */
function activeGateway(): Gateway | null {
  const picked = GATEWAYS.find((g) => g === integration("paymentGateway"));
  if (picked) return CLIENTS[picked].configured() ? picked : null;
  return GATEWAYS.find((g) => CLIENTS[g].configured()) ?? null;
}

// Stripe test accounts take INR; PayPal and Checkout.com sandboxes need e.g. GBP.
const currencyFor = (g: Gateway) => (integration("paymentCurrency") || (g === "stripe" ? "inr" : "gbp")).toLowerCase();

function testPhones(): string[] {
  return integration("paymentTestPhones")
    .split(/[\s,]+/)
    .map((p) => p.replace(/\D/g, "").slice(-10))
    .filter((p) => p.length === 10);
}

/** What the app needs to know to offer card deposits to this player. */
export async function cardDepositStatus(userId: string) {
  const gateway = activeGateway();
  if (!gateway) return { enabled: false, testMode: false, gateway: null, gatewayName: null, reason: "Card payments are not set up yet." };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  const phone = (user.phone ?? "").replace(/\D/g, "").slice(-10);
  const base = { testMode: true, gateway, gatewayName: GATEWAY_NAMES[gateway] };
  if (!testPhones().includes(phone)) {
    return { ...base, enabled: false, reason: `Card payments are in test mode. This account's number (…${phone.slice(-4) || "none"}) is not in the admin's allowed test numbers.` };
  }
  return { ...base, enabled: true, reason: null, min: MIN_CARD_DEPOSIT, max: MAX_CARD_DEPOSIT, currency: currencyFor(gateway) };
}

/** Opens the active gateway's payment page for `amount` and records the PENDING deposit. */
export async function createCardCheckout(userId: string, amount: number, returnBase: string) {
  const status = await cardDepositStatus(userId);
  if (!status.enabled || !status.gateway) throw new ApiError(403, status.reason ?? "Card payments are not available.");
  if (amount < MIN_CARD_DEPOSIT || amount > MAX_CARD_DEPOSIT) throw new ApiError(400, `Deposit must be between ${MIN_CARD_DEPOSIT} and ${MAX_CARD_DEPOSIT}.`);
  const gateway = status.gateway;
  const session = await CLIENTS[gateway].create(amount, currencyFor(gateway), returnBase, userId);
  await prisma.transaction.create({
    data: { userId, type: "DEPOSIT", amount, status: "PENDING", provider: gateway, providerReferenceId: session.id },
  });
  return { sessionId: session.id, url: session.url, gateway };
}

/** Checks one PENDING deposit with its gateway: paid -> credited (exactly once), failed -> FAILED, else left PENDING. */
async function settleCardDeposit(userId: string, tx: { id: string; amount: unknown; provider: string | null; providerReferenceId: string | null }) {
  const gateway = tx.provider as Gateway;
  const amount = Number(tx.amount);
  const client = CLIENTS[gateway];
  if (!client?.configured() || !tx.providerReferenceId) return { status: "PENDING" as const, amount, bonus: 0, alreadyCredited: false };
  const result = await client.check(tx.providerReferenceId);

  if (result.state === "paid") {
    if (result.amountMinor !== Math.round(amount * 100) || result.currency !== currencyFor(gateway)) {
      console.error(`[${gateway}] amount mismatch on ${tx.providerReferenceId}: ${result.amountMinor} ${result.currency} vs ${amount}`);
      throw new ApiError(400, "The paid amount does not match this deposit. Please contact support.");
    }
    const done = await completeDeposit(userId, amount, gateway, tx.providerReferenceId, tx.id);
    return { status: "COMPLETED" as const, amount, bonus: done.bonus, alreadyCredited: done.alreadyCompleted };
  }
  if (result.state === "failed") {
    await prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING" }, data: { status: "FAILED" } });
    return { status: "FAILED" as const, amount, bonus: 0, alreadyCredited: false };
  }
  return { status: "PENDING" as const, amount, bonus: 0, alreadyCredited: false };
}

/** Settles this player's open gateway deposits (most recent first); returns what changed. */
export async function confirmCardDeposits(userId: string, sessionId?: string) {
  const pending = await prisma.transaction.findMany({
    where: {
      userId,
      type: "DEPOSIT",
      provider: { in: [...GATEWAYS] },
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - 48 * 3600 * 1000) },
      ...(sessionId ? { providerReferenceId: sessionId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const results = [];
  for (const tx of pending) results.push(await settleCardDeposit(userId, tx));
  return { results };
}
