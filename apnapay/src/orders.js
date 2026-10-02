const db = require('./db');
const { randomId, istDayStart, formatINR } = require('./util');
const { parseBankMessage } = require('./parser');
const webhooks = require('./webhooks');
const { alert, notify } = require('./notify');

const MAX_BASE_PAISE = 99999_00; // UPI allows ₹1,00,000 per payment; keep room for the extra paise
const MIN_BASE_PAISE = 1_00;
const MAX_EXTRA_PAISE = 99;
// An expired order keeps its unique amount reserved this long, so a late payment is not confused
// with a newer order.
const RESERVE_AFTER_EXPIRY_MS = 60 * 60 * 1000;

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
    istDayStart(now),
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

// Smallest base + n paise (n = 1..99) not used by any open or recently expired order.
// Amounts are unique across ALL accounts, so the amount alone identifies the order.
async function uniqueAmount(base, now = Date.now()) {
  const rows = await db.all(
    `SELECT amount FROM orders
     WHERE amount BETWEEN ? AND ?
       AND (status = 'pending' OR (status = 'expired' AND expires_at > ?))`,
    base + 1,
    base + MAX_EXTRA_PAISE,
    now - RESERVE_AFTER_EXPIRY_MS,
  );
  const taken = new Set(rows.map((r) => r.amount));
  for (let extra = 1; extra <= MAX_EXTRA_PAISE; extra++) {
    if (!taken.has(base + extra)) return base + extra;
  }
  return null;
}

const getById = (id) => db.get('SELECT * FROM orders WHERE id = ?', id);

async function createOrder({ siteId = null, basePaise, reference = '', customer = {}, note = '', returnUrl = '' }, now = Date.now()) {
  if (!Number.isInteger(basePaise) || basePaise < MIN_BASE_PAISE || basePaise > MAX_BASE_PAISE) {
    throw new OrderError('amount must be between 1.00 and 99999.00');
  }
  reference = String(reference || '').slice(0, 80);
  const settings = await db.getSettings();
  const minPaise = Math.max(MIN_BASE_PAISE, Math.round(Number(settings.min_order_amount || 0) * 100) || MIN_BASE_PAISE);
  if (basePaise < minPaise) {
    throw new OrderError(`minimum amount is ₹${(minPaise / 100).toLocaleString('en-IN')}`, 400, 'amount_too_low');
  }
  const expiryMs = Math.max(2, Number(settings.order_expiry_minutes) || 15) * 60000;

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
        if (existing.status === 'pending' && existing.base_amount !== basePaise) {
          throw new OrderError('an open order with this reference has a different amount', 409, 'reference_conflict');
        }
        return existing;
      }
    }

    const amount = await uniqueAmount(basePaise, now);
    if (amount === null) throw new OrderError('too many open orders for this amount, try again shortly', 503, 'busy');
    const account = await pickAccount(amount, now);
    if (!account) throw new OrderError('no bank account is live right now', 503, 'no_account');

    const id = randomId('ord', 9);
    await db.run(
      `INSERT INTO orders (id, site_id, reference, base_amount, amount, account_id, status, customer_name,
         customer_phone, customer_email, note, return_url, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
      id, siteId, reference, basePaise, amount, account.id,
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
  const msg = `Payment received ${formatINR(updated.paid_amount)} for order ${updated.reference || updated.id}` +
    `${utr ? ` (UTR ${utr})` : ''}${late ? ' — paid after the order expired' : ''}`;
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

  // 1) The customer already told us their UTR.
  if (txn.utr) {
    const claimed = await db.get(
      `SELECT * FROM orders WHERE customer_utr = ? AND status IN ('pending', 'expired') AND created_at >= ?`,
      txn.utr,
      cutoff,
    );
    if (claimed) {
      if (txn.amount >= claimed.base_amount) {
        return markPaid(claimed, { utr: txn.utr, matchedBy: 'utr', transactionId: txn.id, paidAmount: txn.amount }, now);
      }
      await alert('alert', `Underpaid: order ${claimed.reference || claimed.id} needs ${formatINR(claimed.amount)} but UTR ${txn.utr} paid ${formatINR(txn.amount)}`);
      return null;
    }
  }

  // 2) Exact unique amount.
  const exact = await db.all(
    `SELECT * FROM orders WHERE amount = ? AND status IN ('pending', 'expired')
       AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC`,
    txn.amount,
    cutoff,
    txn.received_at + 120000,
  );
  const exactPick = pickCandidate(exact, txn.account_id);
  if (exactPick) {
    return markPaid(exactPick, { utr: txn.utr, matchedBy: 'amount', transactionId: txn.id, paidAmount: txn.amount }, now);
  }
  if (exact.length > 1) {
    await alert('alert', `Payment of ${formatINR(txn.amount)} matches ${exact.length} orders — please link it manually`);
    return null;
  }

  // 3) Customer paid the round price without the extra paise: only safe if exactly one open order has it.
  if (settings.accept_base_amount === '1') {
    const base = await db.all(
      `SELECT * FROM orders WHERE base_amount = ? AND status = 'pending' AND created_at <= ?`,
      txn.amount,
      txn.received_at + 120000,
    );
    if (base.length === 1) {
      return markPaid(base[0], { utr: txn.utr, matchedBy: 'amount', transactionId: txn.id, paidAmount: txn.amount }, now);
    }
  }
  return null;
}

// Works out which of our bank accounts an SMS/email is about.
async function identifyAccount({ deviceId, sender, last4 }) {
  let candidates = deviceId ? await db.all('SELECT * FROM accounts WHERE device_id = ?', deviceId) : [];
  if (!candidates.length) candidates = await db.all('SELECT * FROM accounts');
  if (candidates.length === 1) return candidates[0];
  if (last4) {
    const byDigits = candidates.filter((a) => a.account_last4 && a.account_last4.endsWith(last4.slice(-4)));
    if (byDigits.length === 1) return byDigits[0];
  }
  if (sender) {
    const s = sender.toUpperCase();
    const bySender = candidates.filter((a) =>
      a.sender_hints.split(',').map((h) => h.trim().toUpperCase()).filter(Boolean).some((h) => s.includes(h)),
    );
    if (bySender.length === 1) return bySender[0];
  }
  return null;
}

/**
 * Entry point for every bank SMS / email. Stores the credit and confirms the matching order.
 * @returns {{ parsed, transaction: object|null, order: object|null, duplicate?: boolean }}
 */
async function ingestMessage({ source, text, sender = '', deviceId = null, receivedAt = Date.now() }, now = Date.now()) {
  const parsed = parseBankMessage(text);
  if (parsed.type !== 'credit') return { parsed, transaction: null, order: null };

  return db.tx(async () => {
    await expireStale(now);
    const account = await identifyAccount({ deviceId, sender, last4: parsed.last4 });

    // The same payment often arrives twice (SMS + email). Keep only the first.
    const dup = parsed.utr
      ? await db.get("SELECT id FROM transactions WHERE utr = ? AND status IN ('matched', 'unmatched')", parsed.utr)
      : await db.get(
          `SELECT id FROM transactions WHERE utr IS NULL AND amount = ? AND source != ? AND received_at > ?
             AND status IN ('matched', 'unmatched')`,
          parsed.amount, source, receivedAt - 10 * 60000,
        );

    const [inserted] = await db.all(
      `INSERT INTO transactions (source, device_id, account_id, sender, raw_text, amount, utr, payer, status, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      source, deviceId, account ? account.id : null, String(sender).slice(0, 40), String(text).slice(0, 2000),
      parsed.amount, parsed.utr, parsed.payer || '', dup ? 'duplicate' : 'unmatched', receivedAt,
    );
    if (dup) return { parsed, transaction: inserted, order: null, duplicate: true };

    const order = await matchTransaction(inserted, now);
    if (!order) {
      await alert('alert', `Money received but no order matched: ${formatINR(parsed.amount)}${parsed.utr ? ` (UTR ${parsed.utr})` : ''}. See Bank Messages.`);
    }
    const transaction = await db.get('SELECT * FROM transactions WHERE id = ?', inserted.id);
    return { parsed, transaction, order };
  });
}

// Customer typed their UTR on the payment page.
async function claimUtr(orderId, utr, now = Date.now()) {
  if (!/^\d{12}$/.test(utr)) throw new OrderError('UTR / UPI reference is a 12 digit number');
  return db.tx(async () => {
    await expireStale(now);
    const order = await getById(orderId);
    if (!order) throw new OrderError('order not found', 404, 'not_found');
    if (order.status === 'paid' || order.status === 'cancelled') return order;
    const usedBy = await db.get('SELECT id FROM orders WHERE (customer_utr = ? OR utr = ?) AND id != ?', utr, utr, orderId);
    if (usedBy) throw new OrderError('this UTR is already used for another order', 409, 'utr_used');

    await db.run('UPDATE orders SET customer_utr = ? WHERE id = ?', utr, orderId);
    const txn = await db.get("SELECT * FROM transactions WHERE utr = ? AND status = 'unmatched'", utr);
    if (txn) {
      if (txn.amount >= order.base_amount) {
        return markPaid(order, { utr, matchedBy: 'utr', transactionId: txn.id, paidAmount: txn.amount }, now);
      }
      await alert('alert', `Underpaid: order ${order.reference || order.id} needs ${formatINR(order.amount)} but UTR ${utr} paid ${formatINR(txn.amount)}`);
    }
    return getById(orderId);
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
  uniqueAmount,
  usageToday,
  ingestMessage,
  claimUtr,
  manualPay,
  cancelOrder,
  identifyAccount,
};
