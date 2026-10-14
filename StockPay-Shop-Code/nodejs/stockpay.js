// StockPay "Add Money" for your shop server (Node.js + Express).
//
// Setup (3 steps):
//   1. Put this file next to your server code.
//   2. In your main server file add:
//        app.use('/stockpay', require('./stockpay'));
//      (Best placed before app.use(express.json()), but it works after it too.)
//   3. Add these settings (environment variables) on your server:
//        STOCKPAY_KEY             sk_test_...   (later sk_live_...)   StockPay admin → API Keys
//        STOCKPAY_WEBHOOK_SECRET  whsec_...                            StockPay admin → API Keys
//
// Then edit only the two functions marked "EDIT 1" and "EDIT 2" below.
//
// Routes this adds:
//   POST /stockpay/add-money     { "amount": 200 }  →  { "payment_url": "...", "order_id": "..." }
//   GET  /stockpay/status/:id    →  { "status": "pending" | "paid" | "expired" | "cancelled" }
//   POST /stockpay/webhook       StockPay calls this when a payment is received.

const crypto = require('node:crypto');
const express = require('express');

const API = process.env.STOCKPAY_API || 'https://stockpay-in.vercel.app/api/v1';
const KEY = process.env.STOCKPAY_KEY;
const WEBHOOK_SECRET = process.env.STOCKPAY_WEBHOOK_SECRET;

// The amounts your app shows. Only these can be added (nobody can send amount: 1 or 999999).
const AMOUNTS = [200, 400, 600, 800, 1000];

// Where the customer lands after paying. Leave null to stay on the StockPay "Payment received" screen.
const RETURN_URL = null; // e.g. 'https://yourshop.com/wallet'

// ─────────────────────────────────────────────────────────────────────────────
// EDIT 1: return the logged-in user's id (the same way your other routes do it).
// Return null if nobody is logged in.
function getUserId(req) {
  return (req.user && (req.user.id || req.user._id)) || (req.session && req.session.userId) || null;
}

// EDIT 2: add money to the user's wallet in YOUR database.
// IMPORTANT: save orderId with the transaction and do nothing if that orderId was already credited
// (StockPay may send the same webhook more than once). Throw an error if saving fails —
// StockPay will then retry later.
async function creditWallet({ userId, amount, orderId }) {
  // Example (MongoDB / mongoose):
  //   const done = await Transaction.findOne({ orderId });
  //   if (done) return;
  //   await Transaction.create({ orderId, userId, amount, type: 'add_money' });
  //   await User.updateOne({ _id: userId }, { $inc: { balance: amount } });
  //
  // Example (SQL):
  //   INSERT INTO wallet_txn (order_id, user_id, amount) VALUES (?, ?, ?)   -- order_id UNIQUE
  //   UPDATE users SET balance = balance + ? WHERE id = ?
  throw new Error('creditWallet() is not connected to your database yet');
}
// ─────────────────────────────────────────────────────────────────────────────

async function stockpay(path, method = 'GET', body) {
  if (!KEY) throw new Error('STOCKPAY_KEY is not set');
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `StockPay error ${res.status}`);
  return data;
}

// Reference = "ADD-<userId>-<random>", so the webhook knows whose wallet to credit.
const makeReference = (userId) => `ADD-${userId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const userFromReference = (ref) => {
  const m = /^ADD-(.+)-[0-9A-F]{8}$/.exec(ref || '');
  return m ? m[1] : null;
};

const router = express.Router();

// 1) App button "₹200" → create a payment and get the link to open.
router.post('/add-money', express.json(), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Please log in' });
    const amount = Number((req.body || {}).amount);
    if (!AMOUNTS.includes(amount)) return res.status(400).json({ error: 'Choose one of: ' + AMOUNTS.join(', ') });
    const order = await stockpay('/orders', 'POST', {
      amount,
      reference: makeReference(String(userId)),
      note: `Add money ₹${amount}`,
      ...(RETURN_URL ? { return_url: RETURN_URL } : {}),
    });
    res.json({ payment_url: order.payment_url, order_id: order.id });
  } catch (err) {
    console.error('StockPay add-money:', err.message);
    res.status(502).json({ error: 'Payment could not be started, please try again' });
  }
});

// 2) Optional: the app can ask "is it paid yet?"
router.get('/status/:id', async (req, res) => {
  try {
    const order = await stockpay('/orders/' + encodeURIComponent(req.params.id));
    if (userFromReference(order.reference) !== String(getUserId(req))) return res.status(404).json({ error: 'Not found' });
    res.json({ status: order.status, amount: Number(order.amount) });
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// 3) StockPay → your server when money arrives. Adds the balance automatically.
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  // Raw body if we got it; if express.json() already ran, StockPay's compact JSON re-serialises the same.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8')
    : req.rawBody ? String(req.rawBody) : JSON.stringify(req.body || {});
  const ts = req.get('x-stockpay-timestamp');
  const sig = req.get('x-stockpay-signature') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET || '').update(`${ts}.${raw}`).digest('hex');
  const fresh = ts && Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
  const ok = WEBHOOK_SECRET && fresh && sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return res.status(401).json({ error: 'bad signature' });

  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'bad json' }); }
  if (event.event !== 'order.paid') return res.json({ ok: true }); // nothing to do for other events

  try {
    // Double-check with StockPay itself before giving money.
    const order = await stockpay('/orders/' + encodeURIComponent(event.order.id));
    const userId = userFromReference(order.reference);
    if (order.status !== 'paid' || !userId) return res.json({ ok: true });
    await creditWallet({ userId, amount: Number(order.amount), orderId: order.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('StockPay webhook:', err.message);
    res.status(500).json({ error: 'try again later' }); // StockPay retries automatically
  }
});

module.exports = router;
