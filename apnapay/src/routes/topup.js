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

router.post('/create', async (req, res) => {
  const t = await topupSettings();
  if (!t.enabled) return res.status(403).json({ error: 'Add money is turned off right now.' });
  const body = req.body || {};
  const user = cleanUser(body.user);
  if (user.length < 3) return res.status(400).json({ error: 'Apna mobile number / User ID daalo' });
  const paise = toPaise(String(body.amount ?? ''));
  if (paise === null) return res.status(400).json({ error: 'Amount chuno' });
  const rupeesAmt = paise / 100;
  const preset = t.amounts.includes(rupeesAmt);
  if (!preset && !(t.custom && rupeesAmt >= t.min && rupeesAmt <= t.max && Number.isInteger(rupeesAmt))) {
    return res.status(400).json({ error: t.custom ? `Amount ₹${t.min} se ₹${t.max} ke beech hona chahiye` : 'Ye amount allowed nahi hai' });
  }

  const key = `topup:${req.ip}`;
  if (await auth.tooManyAttempts(key, 12, 10 * 60000)) return res.status(429).json({ error: 'Bahut zyada try. 10 minute baad try karo.' });
  await auth.recordAttempt(key);

  try {
    // Same person tapping the same amount again gets the bill that is already open.
    await orders.expireStale();
    const open = await db.get(
      "SELECT * FROM orders WHERE note = 'Add money' AND customer_phone = ? AND base_amount = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      user, paise,
    );
    const pendingCount = (await db.get("SELECT COUNT(*) AS n FROM orders WHERE note = 'Add money' AND customer_phone = ? AND status = 'pending'", user)).n;
    if (!open && pendingCount >= 3) {
      return res.status(429).json({ error: 'Aapke 3 bill pehle se khule hain. Unhe pay karo ya 15 minute ruko.' });
    }
    const site = t.siteId ? await db.get('SELECT * FROM sites WHERE id = ? AND active = 1', t.siteId) : null;
    const order = open || await orders.createOrder({
      siteId: site ? site.id : null,
      basePaise: paise,
      reference: `TOPUP-${user.replace(/\s+/g, '')}-${Date.now().toString(36).toUpperCase()}`.slice(0, 80),
      customer: { name: cleanUser(body.name), phone: user },
      note: 'Add money',
      returnUrl: isHttpUrl(t.returnUrl) ? t.returnUrl : '',
    });
    res.json({ payment_url: `/pay/${order.id}`, amount: rupees(order.amount) });
  } catch (err) {
    if (err instanceof orders.OrderError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Kuch gadbad hui, dobara try karo' });
  }
});

module.exports = router;
