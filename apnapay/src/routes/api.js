// API used by your product websites (server to server). Auth: "Authorization: Bearer <api key>".
const express = require('express');
const db = require('../db');
const orders = require('../orders');
const { publicOrder } = require('../serialize');
const { sha256, toPaise, isHttpUrl } = require('../util');

const router = express.Router();

router.use(async (req, res, next) => {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  const site = m && await db.get('SELECT * FROM sites WHERE api_key_hash = ? AND active = 1', sha256(m[1]));
  if (!site) return res.status(401).json({ error: { code: 'unauthorized', message: 'missing or invalid API key' } });
  req.site = site;
  next();
});

const fail = (res, err) => {
  if (err instanceof orders.OrderError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'server_error', message: 'something went wrong' } });
};

router.post('/orders', async (req, res) => {
  const body = req.body || {};
  const basePaise = toPaise(body.amount);
  if (basePaise === null) return res.status(400).json({ error: { code: 'bad_request', message: 'amount is required, e.g. 499 or "499.00"' } });
  if (body.return_url && !isHttpUrl(body.return_url)) {
    return res.status(400).json({ error: { code: 'bad_request', message: 'return_url must be an http(s) URL' } });
  }
  try {
    const order = await orders.createOrder({
      siteId: req.site.id,
      basePaise,
      reference: body.reference,
      customer: body.customer || {},
      note: body.note,
      returnUrl: body.return_url || req.site.return_url,
    });
    res.status(201).json(publicOrder(order));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/orders', async (req, res) => {
  if (!req.query.reference) return res.status(400).json({ error: { code: 'bad_request', message: 'use ?reference=' } });
  await orders.expireStale();
  const list = await db.all(
    'SELECT * FROM orders WHERE site_id = ? AND reference = ? ORDER BY created_at DESC LIMIT 20',
    req.site.id,
    String(req.query.reference),
  );
  res.json({ data: list.map(publicOrder) });
});

router.get('/orders/:id', async (req, res) => {
  const order = await orders.getOrder(req.params.id);
  if (!order || order.site_id !== req.site.id) return res.status(404).json({ error: { code: 'not_found', message: 'order not found' } });
  res.json(publicOrder(order));
});

router.post('/orders/:id/cancel', async (req, res) => {
  const order = await orders.getOrder(req.params.id);
  if (!order || order.site_id !== req.site.id) return res.status(404).json({ error: { code: 'not_found', message: 'order not found' } });
  try {
    res.json(publicOrder(await orders.cancelOrder(order.id)));
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
