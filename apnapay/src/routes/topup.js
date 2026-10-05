// Public "Add money" page: customer taps a ready amount (₹100 / ₹200 / …) and the payment bill opens at once.
// No API key needed, so it can be opened from any shop app. Amounts are limited to what the admin allows.
const path = require('node:path');
const express = require('express');
const config = require('../config');
const db = require('../db');
const orders = require('../orders');
const auth = require('../auth');
const { toPaise, rupees, isHttpUrl } = require('../util');

const router = express.Router();

function parseAmounts(text) {
  return [...new Set(String(text || '').split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
}

async function topupSettings() {
  const s = await db.getSettings();
  const min = Math.max(1, Number(s.min_order_amount) || 1);
  return {
    enabled: s.topup_enabled === '1',
    title: s.topup_title || 'Add money',
    amounts: parseAmounts(s.topup_amounts).filter((a) => a >= min),
    custom: s.topup_custom === '1',
    min,
    max: Math.max(min, Number(s.topup_max) || 10000),
    business: s.business_name,
    siteId: s.topup_site_id ? Number(s.topup_site_id) : null,
    returnUrl: s.topup_return_url || '',
  };
}

const cleanUser = (v) => String(v ?? '').replace(/[^\w@.+\- ]/g, '').trim().slice(0, 60);

router.get('/', (req, res) => res.sendFile(path.join(config.publicDir, 'topup.html')));

router.get('/config', async (req, res) => {
  const t = await topupSettings();
  res.set('Cache-Control', 'no-store').json({
    enabled: t.enabled, title: t.title, amounts: t.amounts, custom: t.custom, min: t.min, max: t.max, business: t.business,
  });
});

class TopupError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Validates the request and returns the bill (an open one for the same person + amount is reused).
async function createBill(ip, { amount, user, name }) {
  const t = await topupSettings();
  if (!t.enabled) throw new TopupError(403, 'Add money is turned off right now.');
  user = cleanUser(user);
  if (user.length < 3) throw new TopupError(400, 'Apna mobile number / User ID daalo');
  const paise = toPaise(String(amount ?? ''));
  if (paise === null) throw new TopupError(400, 'Amount chuno');
  const rupeesAmt = paise / 100;
  const preset = t.amounts.includes(rupeesAmt);
  if (!preset && !(t.custom && rupeesAmt >= t.min && rupeesAmt <= t.max && Number.isInteger(rupeesAmt))) {
    throw new TopupError(400, t.custom ? `Amount ₹${t.min} se ₹${t.max} ke beech hona chahiye` : 'Ye amount allowed nahi hai');
  }

  await orders.expireStale();
  // Same person tapping the same amount again gets the bill that is already open.
  const open = await db.get(
    "SELECT * FROM orders WHERE note = 'Add money' AND customer_phone = ? AND base_amount = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    user, paise,
  );
  if (open) return open;

  const key = `topup:${ip}`;
  if (await auth.tooManyAttempts(key, 12, 10 * 60000)) throw new TopupError(429, 'Bahut zyada try. 10 minute baad try karo.');
  await auth.recordAttempt(key);
  const pendingCount = (await db.get("SELECT COUNT(*) AS n FROM orders WHERE note = 'Add money' AND customer_phone = ? AND status = 'pending'", user)).n;
  if (pendingCount >= 3) throw new TopupError(429, 'Aapke 3 bill pehle se khule hain. Unhe pay karo ya 15 minute ruko.');

  const site = t.siteId ? await db.get('SELECT * FROM sites WHERE id = ? AND active = 1', t.siteId) : null;
  return orders.createOrder({
    siteId: site ? site.id : null,
    basePaise: paise,
    reference: `TOPUP-${user.replace(/\s+/g, '')}-${Date.now().toString(36).toUpperCase()}`.slice(0, 80),
    customer: { name: cleanUser(name), phone: user },
    note: 'Add money',
    returnUrl: isHttpUrl(t.returnUrl) ? t.returnUrl : '',
  });
}

const failStatus = (err) => (err instanceof TopupError || err instanceof orders.OrderError ? err.status : 500);
const failMessage = (err) => (err instanceof TopupError || err instanceof orders.OrderError ? err.message : 'Kuch gadbad hui, dobara try karo');

router.post('/create', async (req, res) => {
  try {
    const order = await createBill(req.ip, req.body || {});
    res.json({ payment_url: `/pay/${order.id}`, amount: rupees(order.amount) });
  } catch (err) {
    if (failStatus(err) === 500) console.error(err);
    res.status(failStatus(err)).json({ error: failMessage(err) });
  }
});

// Direct link for a shop button: /add-money/go?amount=200&user=98xxxxxxxx -> straight to the payment page (QR).
router.get('/go', async (req, res) => {
  try {
    const order = await createBill(req.ip, { amount: req.query.amount, user: req.query.user || req.query.phone || req.query.id, name: req.query.name });
    res.set('Cache-Control', 'no-store').redirect(302, `/pay/${order.id}`);
  } catch (err) {
    if (failStatus(err) === 500) console.error(err);
    const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    res.status(failStatus(err)).type('html').send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;max-width:420px;margin:60px auto;padding:0 16px;text-align:center">
<h2>Payment shuru nahi hua</h2><p style="color:#64748b">${esc(failMessage(err))}</p>
<a href="/add-money" style="color:#5b4cf0;font-weight:600">Amount dobara chuno</a></body>`);
  }
});

module.exports = router;
