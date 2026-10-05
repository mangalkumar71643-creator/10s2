// JSON API behind the admin panel. Everything except setup/login needs a session.
const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const auth = require('../auth');
const orders = require('../orders');
const webhooks = require('../webhooks');
const { parseBankMessage } = require('../parser');
const { qrSvg } = require('../qr');
const { alert, notify } = require('../notify');
const { publicOrder } = require('../serialize');
const { background } = require('../background');
const { sha256, ukDayStart, toPence, pounds, isHttpUrl } = require('../util');

const router = express.Router();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

// Wrap handlers so thrown errors become JSON responses.
const h = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError || err instanceof orders.OrderError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const admin = () => db.get('SELECT * FROM admin WHERE id = 1');
const count = async (sql, ...params) => (await db.get(sql, ...params)).n;
const mapAll = (rows, fn) => Promise.all(rows.map(fn));

// Custom header blocks cross-site form posts (CSRF); the session cookie is also SameSite=Strict.
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'apnapay') {
    return res.status(403).json({ error: 'Missing X-Requested-With header' });
  }
  next();
});

// ---------- Setup & login ----------------------------------------------------------------------

router.get('/state', h(async (req) => {
  const a = await admin();
  return { setup_needed: !a, logged_in: await auth.sessionValid(req), totp: !!a?.totp_enabled };
}));

router.post('/setup', h(async (req, res) => {
  if (await admin()) throw new HttpError(409, 'Admin already exists');
  const username = str(req.body.username, 40);
  const password = String(req.body.password || '');
  if (username.length < 3) throw bad('Username must be at least 3 characters');
  if (password.length < 8) throw bad('Password must be at least 8 characters');
  await db.run('INSERT INTO admin (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)', username, auth.hashPassword(password), Date.now());
  if (req.body.business_name) await db.setSetting('business_name', str(req.body.business_name, 80));
  auth.setSessionCookie(req, res, await auth.createSession());
  await db.logActivity('info', 'Admin account created');
}));

router.post('/login', h(async (req, res) => {
  const key = `login:${req.ip}`;
  if (await auth.tooManyAttempts(key)) throw new HttpError(429, 'Too many wrong attempts. Try again in 15 minutes.');
  const a = await admin();
  if (!a) throw bad('Run setup first');
  const okUser = a.username === str(req.body.username, 40) && auth.verifyPassword(req.body.password || '', a.password_hash);
  if (!okUser) {
    await auth.recordAttempt(key);
    throw new HttpError(401, 'Wrong username or password');
  }
  if (a.totp_enabled) {
    if (!req.body.totp) return { need_totp: true };
    if (!auth.verifyTotp(a.totp_secret, req.body.totp)) {
      await auth.recordAttempt(key);
      throw new HttpError(401, 'Wrong 2FA code');
    }
  }
  await auth.resetAttempts(key);
  auth.setSessionCookie(req, res, await auth.createSession());
  await alert('info', `Admin login from ${req.ip}`, { telegram: true });
}));

router.post('/logout', h(async (req, res) => await auth.clearSession(req, res)));

router.use(async (req, res, next) => {
  if (!(await auth.sessionValid(req))) return res.status(401).json({ error: 'Please log in' });
  next();
});

// ---------- Dashboard ----------------------------------------------------------------------------

async function accountView(a) {
  const usage = await orders.usageToday(a.id);
  return {
    id: a.id,
    label: a.label,
    bank: a.bank,
    holder_name: a.holder_name,
    sort_code: a.sort_code.replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3'),
    account_number: a.account_number,
    live: !!a.live,
    weight: a.weight,
    daily_limit: a.daily_limit ? pounds(a.daily_limit) : '',
    today_paid: pounds(usage.paid),
    today_pending: pounds(usage.pending),
    limit_used_pct: a.daily_limit ? Math.min(100, Math.round(((usage.paid + usage.pending) / a.daily_limit) * 100)) : null,
  };
}

async function orderRow(o) {
  const acc = o.account_id ? await db.get('SELECT label FROM accounts WHERE id = ?', o.account_id) : null;
  const site = o.site_id ? await db.get('SELECT name FROM sites WHERE id = ?', o.site_id) : null;
  return { ...publicOrder(o), account: acc ? acc.label : null, site: site ? site.name : 'Payment link' };
}

router.get('/dashboard', h(async () => {
  await orders.expireStale();
  background(() => webhooks.processDue()); // admin visits also push pending webhook retries
  const start = ukDayStart();
  const today = await db.get(
    "SELECT COUNT(*) AS n, COALESCE(SUM(paid_amount), 0) AS sum FROM orders WHERE status = 'paid' AND paid_at >= ?",
    start,
  );
  const week = await db.all(
    `SELECT paid_at FROM orders WHERE status = 'paid' AND paid_at >= ?`,
    start - 6 * 86400000,
  );
  const days = Array.from({ length: 7 }, (_, i) => ({ start: ukDayStart(start - (6 - i) * 86400000 + 12 * 3600000), sum: 0 }));
  for (const row of await db.all("SELECT paid_at, paid_amount FROM orders WHERE status = 'paid' AND paid_at >= ?", days[0].start)) {
    const d = days.find((x) => row.paid_at >= x.start && row.paid_at < x.start + 86400000);
    if (d) d.sum += row.paid_amount;
  }
  return {
    business_name: (await db.getSettings()).business_name,
    min_order_amount: (await db.getSettings()).min_order_amount,
    today: { count: today.n, amount: pounds(today.sum) },
    week_count: week.length,
    pending: await count("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'"),
    unmatched: await count("SELECT COUNT(*) AS n FROM transactions WHERE status = 'unmatched'"),
    failed_webhooks: await count("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE status = 'failed'"),
    chart: days.map((d) => ({ date: new Date(d.start + 12 * 3600000).toISOString().slice(0, 10), amount: pounds(d.sum) })),
    accounts: await mapAll(await db.all('SELECT * FROM accounts ORDER BY id'), accountView),
    sites: await count('SELECT COUNT(*) AS n FROM sites WHERE active = 1'),
    recent: await mapAll(await db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8'), orderRow),
    alerts: await db.all("SELECT * FROM activity WHERE level = 'alert' AND seen = 0 ORDER BY id DESC LIMIT 5"),
  };
}));

// ---------- Bank accounts ------------------------------------------------------------------------

const BANKS = ['monzo', 'starling', 'barclays', 'hsbc', 'lloyds', 'natwest', 'santander', 'nationwide', 'revolut', 'other'];

async function readAccountBody(body, existing = {}) {
  const pick = (k, fallback) => (body[k] !== undefined ? body[k] : fallback);
  const label = str(pick('label', existing.label), 60);
  if (!label) throw bad('Give this account a name, e.g. "Monzo Business"');
  const bank = BANKS.includes(pick('bank', existing.bank)) ? pick('bank', existing.bank) : 'other';
  const sortCode = str(pick('sort_code', existing.sort_code), 12).replace(/\D/g, '');
  if (!/^\d{6}$/.test(sortCode)) throw bad('Sort code is 6 digits, e.g. 12-34-56');
  const accountNumber = str(pick('account_number', existing.account_number), 12).replace(/\D/g, '');
  if (!/^\d{8}$/.test(accountNumber)) throw bad('Account number is 8 digits');
  const holder = str(pick('holder_name', existing.holder_name), 80);
  if (!holder) throw bad('Enter the account name (what customers type as the payee name)');
  const limit = pick('daily_limit', existing.daily_limit != null ? pounds(existing.daily_limit) : '');
  const limitPence = limit === '' || limit === null || Number(limit) === 0 ? 0 : toPence(String(limit));
  if (limitPence === null) throw bad('Daily limit must be a number like 5000');
  const weight = Number(pick('weight', existing.weight ?? 1));
  if (!Number.isInteger(weight) || weight < 0 || weight > 100) throw bad('Share must be a whole number 0–100');
  return { label, bank, holder_name: holder, sort_code: sortCode, account_number: accountNumber, weight, daily_limit: limitPence };
}

router.get('/accounts', h(async () => ({
  accounts: await mapAll(await db.all('SELECT * FROM accounts ORDER BY id'), accountView),
})));

router.post('/accounts', h(async (req) => {
  const a = await readAccountBody(req.body || {});
  const now = Date.now();
  const live = req.body.live ? 1 : 0;
  const info = await db.run(
    `INSERT INTO accounts (label, bank, holder_name, sort_code, account_number, live, weight, daily_limit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    a.label, a.bank, a.holder_name, a.sort_code, a.account_number, live, a.weight, a.daily_limit, now, now,
  );
  await alert('alert', `New bank account added: ${a.label} (••${a.account_number.slice(-4)})`);
  return accountView(await db.get('SELECT * FROM accounts WHERE id = ?', info.rows[0].id));
}));

router.put('/accounts/:id', h(async (req) => {
  const existing = await db.get('SELECT * FROM accounts WHERE id = ?', Number(req.params.id));
  if (!existing) throw new HttpError(404, 'Account not found');
  const a = await readAccountBody(req.body || {}, existing);
  await db.run(
    `UPDATE accounts SET label = ?, bank = ?, holder_name = ?, sort_code = ?, account_number = ?, weight = ?, daily_limit = ?,
       updated_at = ? WHERE id = ?`,
    a.label, a.bank, a.holder_name, a.sort_code, a.account_number, a.weight, a.daily_limit, Date.now(), existing.id,
  );
  if (existing.sort_code !== a.sort_code || existing.account_number !== a.account_number) {
    await alert('alert', `⚠️ Bank details changed on ${a.label}: now ${a.sort_code} / ${a.account_number}. If this was not you, change your password now.`);
  }
  return accountView(await db.get('SELECT * FROM accounts WHERE id = ?', existing.id));
}));

router.post('/accounts/:id/live', h(async (req) => {
  const a = await db.get('SELECT * FROM accounts WHERE id = ?', Number(req.params.id));
  if (!a) throw new HttpError(404, 'Account not found');
  const live = req.body.live ? 1 : 0;
  await db.run('UPDATE accounts SET live = ?, updated_at = ? WHERE id = ?', live, Date.now(), a.id);
  await db.logActivity('info', `${a.label} is now ${live ? 'LIVE' : 'OFF'}`);
  return accountView(await db.get('SELECT * FROM accounts WHERE id = ?', a.id));
}));

router.delete('/accounts/:id', h(async (req) => {
  const a = await db.get('SELECT * FROM accounts WHERE id = ?', Number(req.params.id));
  if (!a) throw new HttpError(404, 'Account not found');
  if (await db.get("SELECT id FROM orders WHERE account_id = ? AND status = 'pending'", a.id)) {
    throw new HttpError(409, 'This account has open orders. Turn it OFF and wait for them to finish first.');
  }
  await db.run('DELETE FROM accounts WHERE id = ?', a.id);
  await alert('alert', `Bank account removed: ${a.label}`);
}));

// ---------- Websites (API keys) ------------------------------------------------------------------

async function siteView(s) {
  return {
    id: s.id,
    name: s.name,
    api_key_hint: s.api_key_hint,
    webhook_url: s.webhook_url,
    webhook_secret: s.webhook_secret,
    return_url: s.return_url,
    active: !!s.active,
    created_at: s.created_at,
    orders: await count('SELECT COUNT(*) AS n FROM orders WHERE site_id = ?', s.id),
    failed_webhooks: await count("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE site_id = ? AND status = 'failed'", s.id),
  };
}

function readSiteUrls(body, existing = {}) {
  const webhook = str(body.webhook_url ?? existing.webhook_url, 500);
  const ret = str(body.return_url ?? existing.return_url, 500);
  if (webhook && !isHttpUrl(webhook)) throw bad('Webhook URL must start with https://');
  if (ret && !isHttpUrl(ret)) throw bad('Return URL must start with https://');
  return { webhook, ret };
}

const newApiKey = () => 'ak_demo_' + crypto.randomBytes(24).toString('base64url');
const newSecret = () => 'whsec_' + crypto.randomBytes(24).toString('base64url');

router.get('/sites', h(async () => mapAll(await db.all('SELECT * FROM sites ORDER BY id'), siteView)));

router.post('/sites', h(async (req) => {
  const name = str(req.body.name, 60);
  if (!name) throw bad('Website name is required');
  const { webhook, ret } = readSiteUrls(req.body);
  const key = newApiKey();
  const info = await db.run(
    `INSERT INTO sites (name, api_key_hash, api_key_hint, webhook_url, webhook_secret, return_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    name, sha256(key), key.slice(0, 12) + '…' + key.slice(-4), webhook, newSecret(), ret, Date.now(),
  );
  await alert('alert', `New website connected: ${name}`);
  return { ...(await siteView(await db.get('SELECT * FROM sites WHERE id = ?', info.rows[0].id))), api_key: key };
}));

router.put('/sites/:id', h(async (req) => {
  const s = await db.get('SELECT * FROM sites WHERE id = ?', Number(req.params.id));
  if (!s) throw new HttpError(404, 'Website not found');
  const { webhook, ret } = readSiteUrls(req.body, s);
  const name = str(req.body.name ?? s.name, 60) || s.name;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : s.active;
  await db.run('UPDATE sites SET name = ?, webhook_url = ?, return_url = ?, active = ? WHERE id = ?', name, webhook, ret, active, s.id);
  return siteView(await db.get('SELECT * FROM sites WHERE id = ?', s.id));
}));

router.post('/sites/:id/new-key', h(async (req) => {
  const s = await db.get('SELECT * FROM sites WHERE id = ?', Number(req.params.id));
  if (!s) throw new HttpError(404, 'Website not found');
  const key = newApiKey();
  await db.run('UPDATE sites SET api_key_hash = ?, api_key_hint = ? WHERE id = ?', sha256(key), key.slice(0, 12) + '…' + key.slice(-4), s.id);
  await alert('alert', `API key changed for ${s.name}. The old key stopped working.`);
  return { ...(await siteView(await db.get('SELECT * FROM sites WHERE id = ?', s.id))), api_key: key };
}));

router.post('/sites/:id/new-secret', h(async (req) => {
  const s = await db.get('SELECT * FROM sites WHERE id = ?', Number(req.params.id));
  if (!s) throw new HttpError(404, 'Website not found');
  await db.run('UPDATE sites SET webhook_secret = ? WHERE id = ?', newSecret(), s.id);
  return siteView(await db.get('SELECT * FROM sites WHERE id = ?', s.id));
}));

router.post('/sites/:id/test-webhook', h(async (req) => {
  const s = await db.get('SELECT * FROM sites WHERE id = ?', Number(req.params.id));
  if (!s || !s.webhook_url) throw bad('Add a webhook URL first');
  const payload = JSON.stringify({ event: 'test', created_at: new Date().toISOString(), message: 'Hello from ApnaPay UK (demo)' });
  const ts = Math.floor(Date.now() / 1000).toString();
  try {
    const r = await fetch(s.webhook_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apnapay-event': 'test',
        'x-apnapay-timestamp': ts,
        'x-apnapay-signature': webhooks.sign(s.webhook_secret, ts, payload),
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}));

router.delete('/sites/:id', h(async (req) => {
  await db.run('UPDATE sites SET active = 0 WHERE id = ?', Number(req.params.id));
}));

// ---------- Orders ----------------------------------------------------------------------------

router.get('/orders', h(async (req) => {
  await orders.expireStale();
  const where = [];
  const params = [];
  if (['pending', 'paid', 'expired', 'cancelled'].includes(req.query.status)) {
    where.push('status = ?');
    params.push(req.query.status);
  }
  const q = str(req.query.q, 60);
  if (q) {
    where.push('(id ILIKE ? OR reference ILIKE ? OR pay_ref ILIKE ? OR customer_name ILIKE ? OR customer_email ILIKE ? OR payment_id ILIKE ? OR CAST(amount AS TEXT) LIKE ?)');
    const like = `%${q}%`;
    const amt = toPence(q);
    params.push(like, like, like.replace(/[\s-]/g, ''), like, like, like, amt ? String(amt) : like);
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const sql = `FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  return {
    total: await count(`SELECT COUNT(*) AS n ${sql}`, ...params),
    page,
    orders: await mapAll(await db.all(`SELECT * ${sql} ORDER BY created_at DESC LIMIT 30 OFFSET ?`, ...params, (page - 1) * 30), orderRow),
  };
}));

router.get('/orders/:id', h(async (req) => {
  const o = await orders.getOrder(req.params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  return {
    order: await orderRow(o),
    transaction: o.transaction_id ? await db.get('SELECT * FROM transactions WHERE id = ?', o.transaction_id) : null,
    deliveries: await db.all('SELECT id, event, status, attempts, last_status, last_error, next_attempt_at, updated_at FROM webhook_deliveries WHERE order_id = ? ORDER BY id DESC', o.id),
  };
}));

// Manual payment link (for WhatsApp / Instagram customers) — no website needed.
router.post('/orders', h(async (req) => {
  const basePence = toPence(String(req.body.amount ?? ''));
  if (basePence === null) throw bad('Enter an amount like 25 or 24.99');
  const o = await orders.createOrder({
    basePence,
    reference: str(req.body.reference, 80),
    note: str(req.body.note, 200),
    customer: { name: str(req.body.customer_name, 100), email: str(req.body.customer_email, 120) },
  });
  return orderRow(o);
}));

router.post('/orders/:id/mark-paid', h(async (req) => {
  const payment_id = str(req.body.payment_id, 40) || null;
  if (payment_id && !/^[A-Za-z0-9-]{4,40}$/.test(payment_id)) throw bad('Bank payment ID: letters and numbers only');
  const o = await orders.manualPay(req.params.id, { payment_id, transactionId: req.body.transaction_id ? Number(req.body.transaction_id) : null });
  return orderRow(o);
}));

router.post('/orders/:id/cancel', h(async (req) => orderRow(await orders.cancelOrder(req.params.id))));

router.post('/deliveries/:id/retry', h(async (req) => {
  if (!await webhooks.retryNow(Number(req.params.id))) throw new HttpError(404, 'Delivery not found');
}));

// ---------- Bank messages ------------------------------------------------------------------------

router.get('/transactions', h(async (req) => {
  const status = ['matched', 'unmatched', 'duplicate', 'ignored'].includes(req.query.status) ? req.query.status : null;
  const rows = status
    ? await db.all('SELECT * FROM transactions WHERE status = ? ORDER BY received_at DESC LIMIT 100', status)
    : await db.all('SELECT * FROM transactions ORDER BY received_at DESC LIMIT 100');
  const names = Object.fromEntries((await db.all('SELECT id, label FROM accounts')).map((a) => [a.id, a.label]));
  return rows.map((t) => ({ ...t, amount: t.amount != null ? pounds(t.amount) : null, account: names[t.account_id] || null }));
}));

router.post('/transactions/:id/ignore', h(async (req) => {
  await db.run("UPDATE transactions SET status = 'ignored' WHERE id = ? AND status = 'unmatched'", Number(req.params.id));
}));

// Try a bank notification without saving anything.
router.post('/tools/parse', h(async (req) => {
  const text = String(req.body.text || '');
  const parsed = parseBankMessage(text);
  const account = await orders.identifyAccount({ accountId: req.body.account_id ? Number(req.body.account_id) : null, last4: parsed.last4 });
  const byRef = parsed.reference
    ? await db.all("SELECT * FROM orders WHERE pay_ref = ? AND status IN ('pending', 'expired')", String(parsed.reference).replace(/[\s-]/g, '').toUpperCase())
    : [];
  const byAmount = parsed.amount && !byRef.length
    ? await db.all("SELECT * FROM orders WHERE amount = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 5", parsed.amount)
    : [];
  return {
    parsed: { ...parsed, amount: parsed.amount != null ? pounds(parsed.amount) : null },
    account: account ? account.label : null,
    candidates: await mapAll(byRef.length ? byRef : byAmount, orderRow),
  };
}));

// DEMO: feed a "money in" notification through the real matching pipeline.
router.post('/tools/simulate', h(async (req) => {
  const text = String(req.body.text || '');
  if (!text.trim()) throw bad('Write a bank notification first');
  const result = await orders.ingestMessage({ source: 'manual', text, accountId: req.body.account_id ? Number(req.body.account_id) : null });
  return {
    type: result.parsed.type,
    reason: result.parsed.reason || null,
    duplicate: !!result.duplicate,
    order: result.order ? await orderRow(result.order) : null,
  };
}));

// ---------- Activity -------------------------------------------------------------------------------

router.get('/activity', h(async () => await db.all('SELECT * FROM activity ORDER BY id DESC LIMIT 100')));
router.post('/activity/seen', h(async () => await db.run('UPDATE activity SET seen = 1 WHERE seen = 0')));

// ---------- Settings & security ------------------------------------------------------------------

const SETTING_KEYS = ['business_name', 'min_order_amount', 'order_expiry_minutes', 'late_match_hours', 'accept_amount_only', 'telegram_bot_token', 'telegram_chat_id', 'support_email'];

router.get('/settings', h(async () => {
  const s = (await db.getSettings());
  const a = await admin();
  return {
    settings: Object.fromEntries(SETTING_KEYS.map((k) => [k, s[k]])),
    username: a.username,
    totp_enabled: !!a.totp_enabled,
    base_url: config.baseUrl,
  };
}));

router.put('/settings', h(async (req) => {
  const body = req.body || {};
  for (const key of SETTING_KEYS) {
    if (body[key] === undefined) continue;
    let value = str(body[key], 300);
    if (key === 'min_order_amount') value = String(Math.min(50000, Math.max(1, Math.round(Number(value)) || 1)));
    if (key === 'order_expiry_minutes') value = String(Math.min(120, Math.max(2, parseInt(value, 10) || 30)));
    if (key === 'late_match_hours') value = String(Math.min(168, Math.max(1, parseInt(value, 10) || 24)));
    if (key === 'accept_amount_only') value = body[key] === true || value === '1' ? '1' : '0';
    await db.setSetting(key, value);
  }
  await db.logActivity('info', 'Settings updated');
}));

router.post('/settings/telegram-test', h(async () => {
  const ok = await notify('👋 ApnaPay UK (demo) test message — alerts are working!');
  if (!ok) throw bad('Could not send. Check the bot token and chat id, and send /start to your bot once.');
}));

router.post('/security/password', h(async (req, res) => {
  const a = await admin();
  if (!auth.verifyPassword(req.body.current || '', a.password_hash)) throw bad('Current password is wrong');
  if (String(req.body.next || '').length < 8) throw bad('New password must be at least 8 characters');
  await db.run('UPDATE admin SET password_hash = ? WHERE id = 1', auth.hashPassword(req.body.next));
  await auth.logoutEverywhere();
  auth.setSessionCookie(req, res, await auth.createSession());
  await alert('alert', 'Admin password changed. All other devices were logged out.');
}));

router.post('/security/2fa/start', h(async () => {
  const a = await admin();
  if (a.totp_enabled) throw bad('2FA is already on');
  const secret = auth.generateTotpSecret();
  await db.run('UPDATE admin SET totp_secret = ? WHERE id = 1', secret);
  const uri = auth.totpUri(secret, a.username, 'ApnaPay UK Demo');
  return { secret, qr: 'data:image/svg+xml;base64,' + Buffer.from(await qrSvg(uri)).toString('base64') };
}));

router.post('/security/2fa/enable', h(async (req) => {
  const a = await admin();
  if (!a.totp_secret || !auth.verifyTotp(a.totp_secret, req.body.code)) throw bad('Code did not match. Check the time on your phone and try again.');
  await db.run('UPDATE admin SET totp_enabled = 1 WHERE id = 1');
  await alert('alert', '2FA turned ON for admin login');
}));

router.post('/security/2fa/disable', h(async (req) => {
  const a = await admin();
  if (!auth.verifyPassword(req.body.password || '', a.password_hash)) throw bad('Password is wrong');
  if (!auth.verifyTotp(a.totp_secret, req.body.code)) throw bad('2FA code is wrong');
  await db.run('UPDATE admin SET totp_enabled = 0, totp_secret = NULL WHERE id = 1');
  await alert('alert', '2FA turned OFF for admin login');
}));

router.post('/security/logout-all', h(async (req, res) => {
  await auth.logoutEverywhere();
  await auth.clearSession(req, res);
}));

module.exports = router;
