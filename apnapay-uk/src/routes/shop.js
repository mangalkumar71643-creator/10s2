// Built-in DEMO SHOP: plays the part of your product website.
// Buy → creates an order for the "Demo Shop" website → customer pays → ApnaPay sends a signed
// order.paid webhook to /shop/webhook → the shop verifies it and marks the product SOLD.
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const config = require('../config');
const db = require('../db');
const orders = require('../orders');
const auth = require('../auth');
const { demoShopSite } = require('../demo');
const { pounds, timingSafeEqual } = require('../util');

const router = express.Router();

router.get('/', (req, res) => res.sendFile(path.join(config.publicDir, 'shop.html')));

router.get('/data', async (req, res) => {
  const products = await db.all('SELECT * FROM shop_products ORDER BY price');
  const events = await db.all('SELECT * FROM shop_events ORDER BY id DESC LIMIT 12');
  res.set('Cache-Control', 'no-store').json({
    products: products.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, price: pounds(p.price), sold: !!p.sold, sold_at: p.sold_at })),
    events,
  });
});

router.post('/buy/:id', async (req, res) => {
  const key = `shop:${req.ip}`;
  if (await auth.tooManyAttempts(key, 30, 10 * 60000)) return res.status(429).json({ error: 'Too many orders, wait a few minutes.' });
  await auth.recordAttempt(key);
  const product = await db.get('SELECT * FROM shop_products WHERE id = ?', req.params.id);
  if (!product) return res.status(404).json({ error: 'No such product' });
  if (product.sold) return res.status(409).json({ error: 'Sorry, already sold! Tap "Restock" to reset the demo.' });
  const site = await demoShopSite();
  if (!site || !site.active) return res.status(503).json({ error: 'The demo shop website is disabled in the admin panel.' });
  try {
    // Same call your real website makes with POST /api/v1/orders.
    const order = await orders.createOrder({
      siteId: site.id,
      basePence: product.price,
      reference: `SHOP-${product.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      note: product.name,
      customer: { name: String((req.body || {}).name || '').slice(0, 60) },
      returnUrl: `${config.baseUrl}/shop`,
    });
    res.json({ payment_url: `/pay/${order.id}` });
  } catch (err) {
    if (err instanceof orders.OrderError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.post('/restock', async (req, res) => {
  await db.run('UPDATE shop_products SET sold = 0, order_id = NULL, sold_at = NULL');
  await db.run("INSERT INTO shop_events (event, verified, summary, created_at) VALUES ('restock', 1, 'Shop restocked', ?)", Date.now());
  res.json({ ok: true });
});

// The webhook receiver — exactly what your own website would run.
router.post('/webhook', async (req, res) => {
  const site = await demoShopSite();
  const ts = req.headers['x-apnapay-timestamp'];
  const sig = req.headers['x-apnapay-signature'];
  const raw = req.rawBody || '';
  const fresh = ts && Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
  const expected = site && 'sha256=' + crypto.createHmac('sha256', site.webhook_secret).update(`${ts}.${raw}`).digest('hex');
  const verified = !!(site && fresh && sig && timingSafeEqual(expected, sig));
  const body = req.body || {};
  const order = body.order || {};
  if (!verified) {
    await db.run("INSERT INTO shop_events (event, verified, summary, created_at) VALUES (?, 0, 'Rejected: bad or missing signature', ?)", String(body.event || 'unknown').slice(0, 40), Date.now());
    return res.status(401).json({ error: 'bad signature' });
  }
  let summary = 'Signature OK';
  if (body.event === 'order.paid' && /^SHOP-/.test(order.reference || '')) {
    const productId = order.reference.split('-')[1];
    // Safe to receive twice: only flips an unsold product.
    const { rows } = await db.run(
      'UPDATE shop_products SET sold = 1, order_id = ?, sold_at = ? WHERE id = ? AND sold = 0 RETURNING name',
      order.id, Date.now(), productId,
    );
    summary = rows.length ? `✅ ${rows[0].name} marked SOLD — £${order.amount_paid} received (ref ${order.payment_reference})` : 'Already sold — nothing to do';
  }
  await db.run('INSERT INTO shop_events (event, verified, order_id, summary, created_at) VALUES (?, 1, ?, ?, ?)', String(body.event).slice(0, 40), order.id || null, summary, Date.now());
  res.json({ ok: true });
});

module.exports = router;
