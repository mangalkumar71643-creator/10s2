const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const orders = require('./orders');
const webhooks = require('./webhooks');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (!req.path.startsWith('/pay/')) res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Wait for the database (first request after a cold start) before handling anything.
  app.use((req, res, next) => {
    db.ready().then(() => next(), (err) => {
      console.error('database error', err);
      res.status(503).json({ error: 'Database not reachable. Check DATABASE_URL (Neon) in your hosting settings.' });
    });
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(express.text({ type: ['text/*', 'message/rfc822'], limit: '1mb' }));

  // CORS so the Android admin app's setup screen can check the address.
  app.get('/health', (req, res) => res.set('Access-Control-Allow-Origin', '*').json({ ok: true, app: 'apnapay' }));
  // Vercel Cron (daily) safety net for webhook retries. Vercel sends "Authorization: Bearer $CRON_SECRET".
  app.get('/cron/webhooks', async (req, res) => {
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    await orders.expireStale();
    await webhooks.processDue();
    res.json({ ok: true });
  });
  app.use('/api/v1', require('./routes/api'));
  app.use('/ingest', require('./routes/ingest'));
  app.use('/pay', require('./routes/pay'));
  app.use('/admin/api', require('./routes/admin'));

  const pub = config.publicDir;
  app.use(express.static(pub, { index: false, maxAge: '1h' }));
  app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(pub, 'admin.html')));
  app.get('/', (req, res) => res.redirect('/admin'));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });
  return app;
}

// opts.memory = true gives a throwaway in-memory database (tests).
function init({ memory = false } = {}) {
  const ready = db.init({ url: memory ? '' : config.databaseUrl, dataDir: memory ? null : path.join(config.dataDir, 'pgdata') });
  return ready.then(async () => {
    if (!(await db.getSettings()).email_token) await db.setSetting('email_token', crypto.randomBytes(18).toString('base64url'));
  });
}

if (require.main === module) {
  init().catch((err) => {
    console.error('Could not open the database:', err.message);
    process.exit(1);
  });
  const app = createApp();
  webhooks.startWorker(config.webhookWorkerIntervalMs);
  setInterval(() => orders.expireStale().catch(() => {}), 60000).unref();
  app.listen(config.port, () => {
    console.log(`ApnaPay running on ${config.baseUrl}`);
    console.log(`Admin panel (computer): http://localhost:${config.port}/admin`);
    if (config.lanUrl) console.log(`Phone se kholo (same WiFi): ${config.lanUrl}  <- ApnaPay Admin app mein ye daalein`);
  });
}

module.exports = { createApp, init };
