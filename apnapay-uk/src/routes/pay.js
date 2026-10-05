// Public payment page data for customers.
const express = require('express');
const path = require('node:path');
const db = require('../db');
const orders = require('../orders');
const auth = require('../auth');
const { pounds } = require('../util');

const router = express.Router();
const config = require('../config');
const PUBLIC = config.publicDir;

function returnUrlFor(order) {
  if (!order.return_url) return null;
  const u = new URL(order.return_url);
  u.searchParams.set('order_id', order.id);
  if (order.reference) u.searchParams.set('reference', order.reference);
  u.searchParams.set('status', order.status);
  return u.toString();
}

function statusPayload(order) {
  return {
    status: order.status,
    seconds_left: Math.max(0, Math.round((order.expires_at - Date.now()) / 1000)),
    paid_at: order.paid_at ? new Date(order.paid_at).toISOString() : null,
    payment_id: order.status === 'paid' ? order.payment_id : null,
    return_url: returnUrlFor(order),
  };
}

const sortCode = (s) => String(s).replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3');

router.get('/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'pay.html')));

router.get('/:id/data', async (req, res) => {
  const order = await orders.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const settings = await db.getSettings();
  const account = order.account_id ? await db.get('SELECT * FROM accounts WHERE id = ?', order.account_id) : null;
  const out = {
    business: { name: settings.business_name, support_email: settings.support_email },
    order: {
      id: order.id,
      reference: order.reference,
      note: order.note,
      customer_name: order.customer_name,
      amount: pounds(order.amount),
      pay_ref: order.pay_ref,
    },
    ...statusPayload(order),
    payee: null,
  };
  if (account && order.status === 'pending') {
    out.payee = {
      name: account.holder_name || settings.business_name,
      bank: account.bank,
      sort_code: sortCode(account.sort_code),
      account_number: account.account_number,
    };
  }
  res.set('Cache-Control', 'no-store').json(out);
});

router.get('/:id/status', async (req, res) => {
  const order = await orders.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.set('Cache-Control', 'no-store').json(statusPayload(order));
});

// DEMO ONLY: pretend the customer's bank sent the transfer. Feeds a fake "money in" notification
// through the same matching pipeline a real bank notification would use.
router.post('/:id/simulate', async (req, res) => {
  const key = `sim:${req.ip}`;
  if (await auth.tooManyAttempts(key, 40, 10 * 60000)) {
    return res.status(429).json({ error: 'Too many demo payments. Please wait a few minutes.' });
  }
  await auth.recordAttempt(key);
  const order = await orders.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'pending') return res.json(statusPayload(order));
  const body = req.body || {};
  const payer = String(order.customer_name || 'Demo Customer').replace(/[^A-Za-z .'&-]/g, '').slice(0, 40) || 'Demo Customer';
  const paymentId = 'FP' + require('node:crypto').randomBytes(5).toString('hex').toUpperCase();
  // mode "no_ref": the customer forgot the reference (matched by amount only, if unambiguous).
  const ref = body.mode === 'no_ref' ? '' : ` Reference: ${order.pay_ref}.`;
  const text = `You received £${pounds(order.amount)} from ${payer}.${ref} Payment ID: ${paymentId}`;
  await orders.ingestMessage({ source: 'demo', text, accountId: order.account_id });
  res.json(statusPayload(await orders.getOrder(order.id)));
});

module.exports = router;
