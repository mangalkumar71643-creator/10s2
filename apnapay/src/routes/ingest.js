// Receives bank alerts: SMS from the forwarder app on your phones, and emails from the email worker.
const express = require('express');
const db = require('../db');
const orders = require('../orders');
const { extractEmailText } = require('../parser');
const webhooks = require('../webhooks');
const { background } = require('../background');
const { timingSafeEqual } = require('../util');

const router = express.Router();

const pick = (obj, keys) => {
  for (const k of keys) if (obj && typeof obj[k] === 'string' && obj[k].trim()) return obj[k];
  return '';
};

async function findDevice(token) {
  const device = await db.get('SELECT * FROM devices WHERE token = ? AND active = 1', String(token));
  if (device) await db.run('UPDATE devices SET last_seen_at = ? WHERE id = ?', Date.now(), device.id);
  return device;
}

// Real bank SMS come from alphanumeric sender ids (AX-KOTAKB, VM-CBIBNK ...). A phone number means
// a person typed it, so it could be fake.
async function senderAllowed(device, sender) {
  const s = String(sender || '').trim().toUpperCase();
  if (!s) return { ok: false, reason: 'sender missing' };
  if (/^\+?[\d\s-]{6,}$/.test(s)) return { ok: false, reason: `sender ${s} is a phone number, not a bank` };
  const hints = (await db.all('SELECT sender_hints FROM accounts WHERE device_id = ?', device.id))
    .flatMap((a) => a.sender_hints.split(','))
    .map((h) => h.trim().toUpperCase())
    .filter(Boolean);
  if (hints.length && !hints.some((h) => s.includes(h))) {
    return { ok: false, reason: `sender ${s} is not in this phone's bank sender list (${hints.join(', ')})` };
  }
  return { ok: true };
}

const flag = (v) => (v === '1' || v === 'true' ? 1 : v === '0' || v === 'false' ? 0 : null);

function logSms(device, { sender = '', text = '', status, reason = '', amount = null, orderId = null, smsAt = null }) {
  return db.run(
    `INSERT INTO sms_events (device_id, sender, text, status, reason, amount, order_id, sms_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    device.id, String(sender).slice(0, 40), String(text).slice(0, 1000), status, String(reason).slice(0, 200),
    amount, orderId, smsAt, Date.now(),
  );
}

// Heartbeat, so the admin panel can show whether the phone is online (call it from MacroDroid/Tasker).
// The ApnaPay app also reports its SMS permission and queue here (?perm=1&read=1&on=1&queue=0&v=1.3).
router.all('/ping/:token', async (req, res) => {
  const device = await findDevice(req.params.token);
  if (!device) return res.status(404).json({ ok: false });
  if (req.query.v) {
    await db.run(
      `UPDATE devices SET sms_permission = ?, read_permission = ?, reader_enabled = ?, reader_queue = ?, app_version = ? WHERE id = ?`,
      flag(req.query.perm), flag(req.query.read), flag(req.query.on),
      Number.isFinite(Number(req.query.queue)) ? Number(req.query.queue) : null, String(req.query.v).slice(0, 20), device.id,
    );
  }
  // Heartbeats arrive every 15 min, which also drives webhook retries on serverless hosting.
  background(() => webhooks.processDue());
  res.json({ ok: true, device: device.name });
});

router.post('/sms/:token', async (req, res) => {
  const device = await findDevice(req.params.token);
  if (!device) return res.status(404).json({ ok: false, error: 'unknown device token' });

  const body = typeof req.body === 'string' ? { text: req.body } : req.body || {};
  const text = pick(body, ['text', 'message', 'msg', 'body', 'content', 'sms']);
  const sender = pick(body, ['from', 'sender', 'address', 'phone', 'number']) || String(req.query.from || '');
  if (!text) return res.status(400).json({ ok: false, error: 'no SMS text found (send it as "text")' });

  const stamp = Number(body.receivedStamp || body.timestamp) || Date.now();
  const receivedAt = Math.abs(stamp - Date.now()) < 7 * 86400000 ? stamp : Date.now();

  const allowed = await senderAllowed(device, sender);
  if (!allowed.ok) {
    await db.logActivity('alert', `Ignored SMS on ${device.name}: ${allowed.reason}`);
    await logSms(device, { sender, text, status: 'rejected', reason: allowed.reason, smsAt: receivedAt });
    return res.json({ ok: true, ignored: allowed.reason });
  }

  const result = await orders.ingestMessage({ source: 'sms', text, sender, deviceId: device.id, receivedAt });
  await logSms(device, {
    sender,
    text,
    smsAt: receivedAt,
    amount: result.parsed.amount,
    orderId: result.order ? result.order.id : null,
    status: result.parsed.type !== 'credit' ? 'not_credit' : result.duplicate ? 'duplicate' : result.order ? 'matched' : 'unmatched',
    reason: result.parsed.type !== 'credit' ? result.parsed.reason || `${result.parsed.type} message` : '',
  });
  res.json({
    ok: true,
    type: result.parsed.type,
    duplicate: !!result.duplicate,
    matched_order: result.order ? result.order.id : null,
  });
});

// SMS the phone saw but did not forward (personal, OTP, debit...). Only for the activity view.
router.post('/seen/:token', async (req, res) => {
  const device = await findDevice(req.params.token);
  if (!device) return res.status(404).json({ ok: false });
  const body = req.body || {};
  const stamp = Number(body.receivedStamp) || Date.now();
  await logSms(device, {
    sender: pick(body, ['from']) || 'unknown',
    text: pick(body, ['text']),
    status: 'skipped',
    reason: pick(body, ['reason']) || 'not a bank credit SMS',
    smsAt: Math.abs(stamp - Date.now()) < 7 * 86400000 ? stamp : Date.now(),
  });
  res.json({ ok: true });
});

function emailDomainAllowed(from, settings) {
  const domain = (/@([a-z0-9.-]+)/i.exec(String(from)) || [, ''])[1].toLowerCase();
  const allowed = (settings.email_allowed_domains || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return { domain, ok: !!domain && allowed.some((d) => domain === d || domain.endsWith('.' + d)) };
}

router.post('/email/:token', async (req, res) => {
  const settings = await db.getSettings();
  if (!settings.email_token || !timingSafeEqual(req.params.token, settings.email_token)) {
    return res.status(404).json({ ok: false });
  }
  const body = typeof req.body === 'string' ? { raw: req.body } : req.body || {};
  const raw = pick(body, ['raw']);
  const from = pick(body, ['from', 'sender']) || (/^from:\s*(.+)$/im.exec(raw) || [, ''])[1];

  // Anyone can write "From: alerts@kotak.com", so require the mail server's proof (DKIM/DMARC pass)
  // that the bank really sent it. Cloudflare and Gmail add these Authentication-Results headers.
  const headers = (raw.split(/\r?\n\r?\n/)[0] || '').replace(/\r?\n[ \t]+/g, ' ');
  const authLines = headers.split(/\r?\n/).filter((l) => /^(arc-)?authentication-results:/i.test(l)).join(' ');
  const fromDomain = (/@([a-z0-9.-]+)/i.exec(String(from)) || [, ''])[1].toLowerCase();
  // DKIM must be signed by the bank's own domain, not just any domain.
  const dkimForSender = [...authLines.matchAll(/\bdkim=pass\b[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/gi)]
    .some((m) => fromDomain && (fromDomain === m[1].toLowerCase() || fromDomain.endsWith('.' + m[1].toLowerCase())));
  const authenticated = /\bdmarc=pass\b/i.test(authLines) || dkimForSender;
  if (/\bdmarc=fail\b/i.test(authLines) || (settings.email_require_auth !== '0' && !authenticated)) {
    await db.logActivity('alert', `Ignored email from ${from || 'unknown sender'}: no DKIM/DMARC pass, it may be fake`);
    return res.json({ ok: true, ignored: 'sender authentication missing or failed' });
  }
  const domain = emailDomainAllowed(from, settings);
  if (!domain.ok) {
    await db.logActivity('alert', `Ignored email from ${from || 'unknown sender'}: domain ${domain.domain || '?'} is not in Settings → allowed bank email domains`);
    return res.json({ ok: true, ignored: 'sender domain not allowed' });
  }

  const text = raw ? extractEmailText(raw) : [pick(body, ['subject']), extractEmailText(pick(body, ['text', 'html', 'body']))].join('\n');
  const result = await orders.ingestMessage({ source: 'email', text, sender: from });
  res.json({
    ok: true,
    type: result.parsed.type,
    duplicate: !!result.duplicate,
    matched_order: result.order ? result.order.id : null,
  });
});

module.exports = router;
