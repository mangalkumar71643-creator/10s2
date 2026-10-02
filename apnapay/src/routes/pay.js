// Public payment page data for customers.
const express = require('express');
const path = require('node:path');
const db = require('../db');
const orders = require('../orders');
const auth = require('../auth');
const { buildUpiUri, qrPng, isMerchant } = require('../upi');
const { rupees } = require('../util');

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
    utr: order.status === 'paid' ? order.utr : null,
    utr_submitted: !!order.customer_utr,
    return_url: returnUrlFor(order),
  };
}

router.get('/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'pay.html')));

router.get('/:id/data', async (req, res) => {
  const order = await orders.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const settings = await db.getSettings();
  const account = order.account_id ? await db.get('SELECT * FROM accounts WHERE id = ?', order.account_id) : null;
  const out = {
    business: { name: settings.business_name, support_phone: settings.support_phone },
    order: {
      id: order.id,
      reference: order.reference,
      note: order.note,
      customer_name: order.customer_name,
      base_amount: rupees(order.base_amount),
      amount: rupees(order.amount),
      extra_paise: order.amount - order.base_amount,
    },
    ...statusPayload(order),
    payee: null,
  };
  if (account && order.status === 'pending') {
    const upiUri = buildUpiUri(account, order);
    // UPI apps block amount-filled QRs/links to personal UPI IDs, but always accept the owner's own QR.
    // So personal accounts with an uploaded QR show that QR; the customer types the exact amount.
    const staticQr = account.qr_image && (account.qr_mode === 'static' || !isMerchant(account));
    out.payee = {
      name: account.payee_name || account.holder_name || settings.business_name,
      upi_id: account.upi_id,
      bank: account.bank,
      upi_uri: upiUri,
      qr_mode: staticQr ? 'static' : 'dynamic',
      qr: staticQr ? account.qr_image : await qrPng(upiUri),
      merchant: isMerchant(account),
    };
  }
  res.set('Cache-Control', 'no-store').json(out);
});

router.get('/:id/status', async (req, res) => {
  const order = await orders.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.set('Cache-Control', 'no-store').json(statusPayload(order));
});

router.post('/:id/utr', async (req, res) => {
  const key = `utr:${req.ip}`;
  if (await auth.tooManyAttempts(key, 10, 30 * 60000)) {
    return res.status(429).json({ error: 'Too many tries. Please wait a few minutes.' });
  }
  await auth.recordAttempt(key);
  try {
    const order = await orders.claimUtr(req.params.id, String((req.body || {}).utr || '').replace(/\s/g, ''));
    res.json(statusPayload(order));
  } catch (err) {
    if (err instanceof orders.OrderError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
