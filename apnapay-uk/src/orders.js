const db = require('./db');
const crypto = require('node:crypto');
const { randomId, ukDayStart, formatGBP } = require('./util');
const { parseBankMessage, findOurRef } = require('./parser');
const webhooks = require('./webhooks');
const { alert, notify } = require('./notify');

const MAX_BASE_PENCE = 50_000_00; // demo cap; real Faster Payments limits depend on the bank
const MIN_BASE_PENCE = 1_00;
// Reference alphabet without look-alikes (no I, L, O, 0, 1).
const REF_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

class OrderError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function expireStale(now = Date.now()) {
  return db.run("UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?", now);
}

// Money already taken today plus money still expected from open orders, per account.
async function usageToday(accountId, now = Date.now()) {
  const row = await db.get(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= ? THEN COALESCE(paid_amount, amount) END), 0) AS paid,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) AS pending
     FROM orders WHERE account_id = ?`,
    ukDayStart(now),
    accountId,
  );
  return { paid: row.paid, pending: row.pending };
}

async function eligibleAccounts(amount, now = Date.now()) {
  const out = [];
  for (const a of await db.all('SELECT * FROM accounts WHERE live = 1 AND weight > 0 ORDER BY id')) {
    if (!a.daily_limit) {
      out.push(a);
      continue;
    }
    const u = await usageToday(a.id, now);
    if (u.paid + u.pending + amount <= a.daily_limit) out.push(a);
  }
  return out;
}

async function pickAccount(amount, now = Date.now(), random = Math.random) {
  const list = await eligibleAccounts(amount, now);
  if (!list.length) return null;
  const total = list.reduce((s, a) => s + a.weight, 0);
  let roll = random() * total;
  for (const a of list) {
    roll -= a.weight;
    if (roll < 0) return a;
  }
  return list[list.length - 1];
}

// Bank transfer reference the customer types, e.g. AP7KQ2XM. Unique across all orders.
async function newPayRef() {
  for (let i = 0; i < 20; i++) {
    const bytes = crypto.randomBytes(6);
    const ref = 'AP' + [...bytes].map((b) => REF_CHARS[b % REF_CHARS.length]).join('');
    if (!/\d/.test(ref)) continue; // must contain a digit (see parser.findOurRef)
    if (!(await db.get('SELECT id FROM orders WHERE pay_ref = ?', ref))) return ref;
  }
  throw new OrderError('could not create a payment reference, try again', 503, 'busy');
}

const getById = (id) => db.get('SELECT * FROM orders WHERE id = ?', id);

async function createOrder({ siteId = null, basePence, reference = '', customer = {}, note = '', returnUrl = '' }, now = Date.now()) {
  if (!Number.isInteger(basePence) || basePence < MIN_BASE_PENCE || basePence > MAX_BASE_PENCE) {
    throw new OrderError('amount must be between 1.00 and 50000.00');
  }
  reference = String(reference || '').slice(0, 80);
  const settings = await db.getSettings();
  const minPence = Math.max(MIN_BASE_PENCE, Math.round(Number(settings.min_order_amount || 0) * 100) || MIN_BASE_PENCE);
  if (basePence < minPence) {
    throw new OrderError(`minimum amount is ${formatGBP(minPence)}`, 400, 'amount_too_low');
  }
  const expiryMs = Math.max(2, Number(settings.order_expiry_minutes) || 30) * 60000;

  return db.tx(async () => {
    await expireStale(now);

    // Same reference from the same website: hand back the open/paid order instead of making a new one.
    if (siteId && reference) {
      const existing = await db.get(
        `SELECT * FROM orders WHERE site_id = ? AND reference = ? AND status IN ('pending', 'paid')
         ORDER BY created_at DESC LIMIT 1`,
        siteId,
        reference,
      );
      if (existing) {
        if (existing.status === 'pending' && existing.base_amount !== basePence) {
          throw new OrderError('an open order with this reference has a different amount', 409, 'reference_conflict');
        }
        return existing;
      }
    }

    const account = await pickAccount(basePence, now);
    if (!account) throw new OrderError('no bank account is live right now', 503, 'no_account');

    const id = randomId('ord', 9);
    await db.run(
      `INSERT INTO orders (id, site_id, reference, base_amount, amount, pay_ref, account_id, status, customer_name,
         customer_phone, customer_email, note, return_url, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
      id, siteId, reference, basePence, basePence, await newPayRef(), account.id,
      String(customer.name || '').slice(0, 100), String(customer.phone || '').slice(0, 20),
      String(customer.email || '').slice(0, 120), String(note || '').slice(0, 200), returnUrl || '',
      now + expiryMs, now,
    );
    return getById(id);
  });
}

async function getOrder(id) {
  await expireStale();
  return (await getById(id)) || null;
}

// Must be called inside db.tx. Returns the updated order.
async function markPaid(order, { utr = null, matchedBy, transactionId = null, paidAmount = null }, now = Date.now()) {
  const late = order.status === 'expired';
  await db.run(
    `UPDATE orders SET status = 'paid', utr = COALESCE(?, utr), matched_by = ?, transaction_id = ?,
       paid_amount = ?, paid_at = ? WHERE id = ? AND status IN ('pending', 'expired')`,
    utr, matchedBy, transactionId, paidAmount ?? order.amount, now, order.id,
  );
  if (transactionId) await db.run("UPDATE transactions SET status = 'matched', order_id = ? WHERE id = ?", order.id, transactionId);
  const updated = await getById(order.id);
  await webhooks.enqueue(updated, 'order.paid', now);
  const msg = `Payment received ${formatGBP(updated.paid_amount)} for order ${updated.reference || updated.pay_ref}` +
    `${late ? ' — paid after the order expired' : ''}`;
  await db.logActivity('success', msg);
  db.afterCommit(() => notify('✅ ' + msg));
  return updated;
}

async function lateCutoff(now) {
  const hours = Math.max(1, Number((await db.getSettings()).late_match_hours) || 24);
  return now - hours * 3600000;
}

// Narrow several candidate orders down to one: prefer open orders, then the account the money hit.
function pickCandidate(candidates, accountId) {
  if (candidates.length <= 1) return candidates[0] || null;
  const open = candidates.filter((o) => o.status === 'pending');
  if (open.length === 1) return open[0];
  const pool = open.length ? open : candidates;
  if (accountId) {
    const same = pool.filter((o) => o.account_id === accountId);
    if (same.length === 1) return same[0];
  }
  return null;
}

// Must be called inside db.tx. Tries to find the order a bank credit belongs to.
async function matchTransaction(txn, now = Date.now()) {
  const cutoff = await lateCutoff(now);
  const settings = await db.getSettings();

  // 1) Our payment reference (AP……) in the transfer reference.
  const ref = findOurRef(txn.reference) || findOurRef(txn.raw_text);
  if (ref) {
    const order = await db.get(
      `SELECT * FROM orders WHERE pay_ref = ? AND status IN ('pending', 'expired') AND created_at >= ?`,
      ref,
      cutoff,
    );
    if (order) {
      if (txn.amount >= order.base_amount) {
        return markPaid(order, { utr: txn.utr, matchedBy: 'reference', transactionId: txn.id, paidAmount: txn.amount }, now);
      }
      await alert('alert', `Underpaid: order ${order.reference || order.pay_ref} needs ${formatGBP(order.amount)} but ${formatGBP(txn.amount)} arrived`);
      return null;
    }
  }

  // 2) No (or a mistyped) reference: accept only when exactly one open order has this amount.
  if (settings.accept_amount_only === '1') {
    const same = await db.all(
      `SELECT * FROM orders WHERE amount = ? AND status = 'pending' AND created_at <= ?`,
      txn.amount,
      txn.received_at + 120000,
    );
    const pick = pickCandidate(same, txn.account_id);
    if (pick) return markPaid(pick, { utr: txn.utr, matchedBy: 'amount', transactionId: txn.id, paidAmount: txn.amount }, now);
    if (same.length > 1) await alert('alert', `Payment of ${formatGBP(txn.amount)} without our reference matches ${same.length} orders — please link it manually`);
  }
  return null;
}

// Works out which of our bank accounts a notification is about.
async function identifyAccount({ accountId, last4 }) {
  if (accountId) {
    const a = await db.get('SELECT * FROM accounts WHERE id = ?', accountId);
    if (a) return a;
  }
  const all = await db.all('SELECT * FROM accounts');
  if (all.length === 1) return all[0];
  if (last4) {
    const byDigits = all.filter((a) => a.account_number.endsWith(last4.slice(-4)));
    if (byDigits.length === 1) return byDigits[0];
  }
  return null;
}

/**
 * Entry point for every bank "money in" notification. Stores the credit and confirms the matching order.
 * @returns {{ parsed, transaction: object|null, order: object|null, duplicate?: boolean }}
 */
async function ingestMessage({ source, text, accountId = null, receivedAt = Date.now() }, now = Date.now()) {
  const parsed = parseBankMessage(text);
  if (parsed.type !== 'credit') return { parsed, transaction: null, order: null };

  return db.tx(async () => {
    await expireStale(now);
    const account = await identifyAccount({ accountId, last4: parsed.last4 });

    // The same notification can arrive twice. Keep only the first (by bank payment id).
    const dup = parsed.utr
      ? await db.get("SELECT id FROM transactions WHERE utr = ? AND status IN ('matched', 'unmatched')", parsed.utr)
      : null;

    const [inserted] = await db.all(
      `INSERT INTO transactions (source, account_id, sender, raw_text, amount, utr, reference, payer, status, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      source, account ? account.id : null, account ? account.bank : '', String(text).slice(0, 2000),
      parsed.amount, parsed.utr, String(parsed.reference || '').slice(0, 40), parsed.payer || '', dup ? 'duplicate' : 'unmatched', receivedAt,
    );
    if (dup) return { parsed, transaction: inserted, order: null, duplicate: true };

    const order = await matchTransaction(inserted, now);
    if (!order) {
      await alert('alert', `Money received but no order matched: ${formatGBP(parsed.amount)}${parsed.reference ? ` (ref ${parsed.reference})` : ''}. See Bank Notifications.`);
    }
    const transaction = await db.get('SELECT * FROM transactions WHERE id = ?', inserted.id);
    return { parsed, transaction, order };
  });
}

// Admin: confirm by hand (e.g. you checked the bank app yourself).
async function manualPay(orderId, { utr = null, transactionId = null } = {}, now = Date.now()) {
  return db.tx(async () => {
    const order = await getById(orderId);
    if (!order) throw new OrderError('order not found', 404, 'not_found');
    if (!['pending', 'expired'].includes(order.status)) throw new OrderError(`order is already ${order.status}`, 409, 'conflict');
    let paidAmount = order.amount;
    if (transactionId) {
      const txn = await db.get('SELECT * FROM transactions WHERE id = ?', transactionId);
      if (!txn) throw new OrderError('transaction not found', 404, 'not_found');
      if (txn.status === 'matched') throw new OrderError('transaction is already linked to an order', 409, 'conflict');
      utr = utr || txn.utr;
      paidAmount = txn.amount;
    }
    return markPaid(order, { utr, matchedBy: 'manual', transactionId, paidAmount }, now);
  });
}

async function cancelOrder(orderId) {
  const rows = await db.all(
    "UPDATE orders SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'expired') RETURNING *",
    orderId,
  );
  if (!rows.length) throw new OrderError('only pending or expired orders can be cancelled', 409, 'conflict');
  return rows[0];
}

module.exports = {
  OrderError,
  createOrder,
  getOrder,
  expireStale,
  pickAccount,
  eligibleAccounts,
  usageToday,
  ingestMessage,
  manualPay,
  cancelOrder,
  identifyAccount,
};
