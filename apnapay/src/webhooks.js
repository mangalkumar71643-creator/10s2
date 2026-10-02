const crypto = require('node:crypto');
const db = require('./db');
const { publicOrder } = require('./serialize');

// Wait before each retry: right away, 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h. Then give up.
// On Vercel there is no always-running worker: due retries are sent whenever the server gets traffic
// (phone heartbeats every 15 min, bank SMS, admin panel), plus the daily cron as a safety net.
const RETRY_DELAYS_MS = [0, 60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 6 * 3600e3, 12 * 3600e3, 24 * 3600e3];

function sign(secret, timestamp, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// Call inside db.tx (it is, from markPaid). Sending starts after the transaction commits.
async function enqueue(order, event, now = Date.now()) {
  if (!order.site_id) return;
  const site = await db.get('SELECT * FROM sites WHERE id = ?', order.site_id);
  if (!site || !site.webhook_url) return;
  const payload = JSON.stringify({ event, created_at: new Date(now).toISOString(), order: publicOrder(order) });
  await db.run(
    `INSERT INTO webhook_deliveries (order_id, site_id, event, payload, status, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    order.id, site.id, event, payload, now, now, now,
  );
  db.afterCommit(() => processDue());
}

async function deliver(delivery) {
  const site = await db.get('SELECT * FROM sites WHERE id = ?', delivery.site_id);
  const now = Date.now();
  let status = null;
  let error = null;

  if (!site || !site.webhook_url) {
    error = 'website removed or has no webhook URL';
  } else {
    const timestamp = Math.floor(now / 1000).toString();
    try {
      const res = await fetch(site.webhook_url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'ApnaPay-Webhook/1.0',
          'x-apnapay-event': delivery.event,
          'x-apnapay-delivery': String(delivery.id),
          'x-apnapay-timestamp': timestamp,
          'x-apnapay-signature': sign(site.webhook_secret, timestamp, delivery.payload),
        },
        body: delivery.payload,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      status = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err.name === 'TimeoutError' ? 'timed out after 10s' : err.message;
    }
  }

  const attempts = delivery.attempts + 1;
  if (!error) {
    await db.run(
      `UPDATE webhook_deliveries SET status = 'delivered', attempts = ?, last_status = ?, last_error = NULL, updated_at = ? WHERE id = ?`,
      attempts, status, now, delivery.id,
    );
    return true;
  }
  const giveUp = attempts >= RETRY_DELAYS_MS.length || !site;
  await db.run(
    `UPDATE webhook_deliveries SET status = ?, attempts = ?, last_status = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?`,
    giveUp ? 'failed' : 'pending', attempts, status, error, giveUp ? now : now + RETRY_DELAYS_MS[attempts], now, delivery.id,
  );
  if (giveUp) {
    await db.logActivity('alert', `Webhook to ${site ? site.name : 'deleted website'} failed for order ${delivery.order_id}: ${error}`);
  }
  return false;
}

let running = null;
// Sends every webhook that is due. Safe to call often; overlapping calls share one run.
function processDue() {
  if (running) return running;
  running = (async () => {
    try {
      // Claim due rows by pushing next_attempt_at forward, so two servers never send the same one twice.
      const now = Date.now();
      const due = await db.all(
        `UPDATE webhook_deliveries SET next_attempt_at = ?
         WHERE id IN (SELECT id FROM webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id LIMIT 20)
         RETURNING *`,
        now + 60000,
        now,
      );
      for (const d of due.sort((a, b) => a.id - b.id)) await deliver(d);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function retryNow(deliveryId) {
  const rows = await db.all(
    "UPDATE webhook_deliveries SET status = 'pending', next_attempt_at = ?, attempts = 0, updated_at = ? WHERE id = ? RETURNING id",
    Date.now(), Date.now(), deliveryId,
  );
  if (rows.length) db.afterCommit(() => processDue());
  return rows.length > 0;
}

// Long-running servers (computer, Termux, VPS) also check on a timer.
function startWorker(intervalMs) {
  const timer = setInterval(() => processDue().catch((e) => console.error('webhook worker', e)), intervalMs);
  timer.unref();
  return timer;
}

module.exports = { sign, enqueue, processDue, retryNow, startWorker, RETRY_DELAYS_MS };
