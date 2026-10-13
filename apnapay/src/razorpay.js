// Razorpay for currencies UPI can't take (e.g. GBP from UK customers): we create a Razorpay
// Payment Link, send the customer there, and mark our order paid when Razorpay confirms.
const crypto = require('node:crypto');
const db = require('./db');

const apiBase = () => (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/+$/, '');

function currencies(settings) {
  return String(settings.razorpay_currencies || '').toUpperCase().split(/[\s,]+/).filter((c) => /^[A-Z]{3}$/.test(c) && c !== 'INR');
}

// Live keys for live orders, test keys (rzp_test_…) for orders made with a StockPay test key.
async function credentials(test) {
  const s = await db.getSettings();
  const id = test ? s.razorpay_test_key_id : s.razorpay_key_id;
  const secret = test ? s.razorpay_test_key_secret : s.razorpay_key_secret;
  return id && secret ? { id, secret } : null;
}

async function request(creds, method, path, body) {
  const res = await fetch(apiBase() + path, {
    method,
    headers: {
      authorization: 'Basic ' + Buffer.from(`${creds.id}:${creds.secret}`).toString('base64'),
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.description) || `Razorpay error HTTP ${res.status}`);
  return data;
}

function createPaymentLink(creds, { amountMinor, currency, referenceId, description, customer, callbackUrl, expireBy }) {
  const c = {};
  if (customer.name) c.name = customer.name;
  if (customer.email) c.email = customer.email;
  if (customer.phone) c.contact = customer.phone;
  return request(creds, 'POST', '/payment_links', {
    amount: amountMinor,
    currency,
    accept_partial: false,
    reference_id: referenceId,
    description: (description || 'Order ' + referenceId).slice(0, 2048),
    ...(Object.keys(c).length ? { customer: c } : {}),
    notify: { sms: false, email: false },
    reminder_enable: false,
    callback_url: callbackUrl,
    callback_method: 'get',
    expire_by: Math.floor(expireBy / 1000),
  });
}

const fetchPaymentLink = (creds, id) => request(creds, 'GET', '/payment_links/' + encodeURIComponent(id));
const checkKeys = (creds) => request(creds, 'GET', '/payment_links?count=1');

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// X-Razorpay-Signature = HMAC_SHA256(webhook_secret, raw_body), hex.
function verifyWebhook(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  return safeEqualHex(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'), signature);
}

// Redirect back after paying: signature over "link_id|reference_id|status|payment_id" with the key secret.
function verifyCallback(q, keySecret) {
  const payload = `${q.razorpay_payment_link_id}|${q.razorpay_payment_link_reference_id}|${q.razorpay_payment_link_status}|${q.razorpay_payment_id}`;
  return safeEqualHex(crypto.createHmac('sha256', keySecret).update(payload).digest('hex'), q.razorpay_signature);
}

module.exports = { currencies, credentials, createPaymentLink, fetchPaymentLink, checkKeys, verifyWebhook, verifyCallback };
