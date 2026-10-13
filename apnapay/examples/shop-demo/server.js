// Demo PRODUCT WEBSITE that takes payments through StockPay.
// No dependencies — copy the 3 marked parts into your real shop (any language works the same way).
//
//   STOCKPAY_URL=http://localhost:3000 STOCKPAY_API_KEY=sk_live_... STOCKPAY_WEBHOOK_SECRET=whsec_... node examples/shop-demo/server.js
//
// In StockPay → Websites, set Webhook URL = http://localhost:4000/webhooks/stockpay

const http = require('node:http');
const crypto = require('node:crypto');

const STOCKPAY_URL = (process.env.STOCKPAY_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.STOCKPAY_API_KEY || '';
const WEBHOOK_SECRET = process.env.STOCKPAY_WEBHOOK_SECRET || '';
const PORT = Number(process.env.SHOP_PORT || 4000);
const SHOP_URL = process.env.SHOP_URL || `http://localhost:${PORT}`;

// Your database would hold these.
const products = new Map([
  ['kurta', { id: 'kurta', name: 'Cotton Kurta', price: 499, stock: 3 }],
  ['earbuds', { id: 'earbuds', name: 'Wireless Earbuds', price: 1299, stock: 2 }],
  ['mug', { id: 'mug', name: 'Coffee Mug', price: 149, stock: 10 }],
]);
const shopOrders = new Map(); // reference -> { productId, status, stockpayId }

// ---- PART 1: create the payment on StockPay (server side, keeps the API key secret) -------------
async function createPayment(product, reference, customerName) {
  const res = await fetch(`${STOCKPAY_URL}/api/v1/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      amount: product.price,
      reference,
      note: product.name,
      customer: { name: customerName },
      return_url: `${SHOP_URL}/thanks`,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ? data.error.message : 'payment service error');
  return data; // { id, payment_url, amount_payable, ... }
}

// ---- PART 2: verify the webhook really came from StockPay ------------------------------------
function verifySignature(rawBody, timestamp, signature) {
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // older than 5 min = replay
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- PART 3: mark the product sold (safe to run twice) --------------------------------------
function fulfil(reference, payment) {
  const order = shopOrders.get(reference);
  if (!order || order.status === 'paid') return; // unknown or already done -> do nothing
  order.status = 'paid';
  order.utr = payment.utr;
  const p = products.get(order.productId);
  p.stock -= 1;
  console.log(`✅ SOLD ${p.name} (order ${reference}, UTR ${payment.utr || '-'}) — stock left ${p.stock}. Start shipping!`);
}

// ---- tiny web server ----------------------------------------------------------------------------
const page = (body) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<title>Demo Shop</title><style>body{font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px;color:#0f172a}
.p{display:flex;justify-content:space-between;align-items:center;border:1px solid #e5e7f0;border-radius:14px;padding:16px;margin:10px 0}
button{background:#5b4cf0;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:600;cursor:pointer}
button:disabled{background:#cbd2e0}.ok{color:#14a35a}.muted{color:#64748b}</style>${body}`;

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, SHOP_URL);
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const list = [...products.values()]
          .map((p) => `<div class=p><div><b>${p.name}</b><div class=muted>₹${p.price} · ${p.stock} in stock</div></div>
            <form method=post action="/buy/${p.id}"><button ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Sold out' : 'Buy now'}</button></form></div>`)
          .join('');
        return res.end(page(`<h1>🛍️ Demo Shop</h1>${list}`));
      }

      if (req.method === 'POST' && url.pathname.startsWith('/buy/')) {
        const product = products.get(url.pathname.split('/')[2]);
        if (!product || product.stock < 1) return res.writeHead(400).end('Sold out');
        const reference = 'SHOP-' + Date.now().toString(36).toUpperCase();
        shopOrders.set(reference, { productId: product.id, status: 'pending' });
        const payment = await createPayment(product, reference, 'Demo customer');
        shopOrders.get(reference).stockpayId = payment.id;
        res.writeHead(303, { location: payment.payment_url }); // send the customer to pay
        return res.end();
      }

      if (req.method === 'POST' && url.pathname === '/webhooks/stockpay') {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers['x-stockpay-timestamp'], req.headers['x-stockpay-signature'])) {
          console.warn('❌ Rejected webhook with bad signature');
          return res.writeHead(401).end('bad signature');
        }
        const event = JSON.parse(raw);
        if (event.event === 'order.paid') fulfil(event.order.reference, event.order);
        return res.writeHead(200).end('ok'); // any 2xx = received; otherwise StockPay retries
      }

      if (req.method === 'GET' && url.pathname === '/thanks') {
        // Never trust ?status= in the URL — ask StockPay (or rely on the webhook).
        const reference = url.searchParams.get('reference');
        const order = shopOrders.get(reference);
        if (order && order.stockpayId && order.status !== 'paid') {
          const r = await fetch(`${STOCKPAY_URL}/api/v1/orders/${order.stockpayId}`, { headers: { authorization: `Bearer ${API_KEY}` } });
          const data = await r.json();
          if (data.status === 'paid') fulfil(reference, data);
        }
        const paid = order && order.status === 'paid';
        return res.end(page(paid
          ? `<h1 class=ok>Thank you! 🎉</h1><p>Order <b>${reference}</b> is paid. We are packing it now.</p><a href="/">Shop more</a>`
          : `<h1>Waiting for payment…</h1><p class=muted>If you paid, this updates within a minute.</p><a href="/thanks?reference=${encodeURIComponent(reference || '')}">Refresh</a>`));
      }

      res.writeHead(404).end('Not found');
    } catch (err) {
      console.error(err);
      res.writeHead(500).end('Error: ' + err.message);
    }
  })
  .listen(PORT, () => console.log(`Demo shop on ${SHOP_URL} (talking to ${STOCKPAY_URL})`));
