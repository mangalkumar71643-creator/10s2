const path = require('node:path');
const fs = require('node:fs');

// Load a simple .env file (KEY=value per line) if present, without overriding real env vars.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const port = Number(process.env.PORT || 3000);

// This computer's WiFi/LAN address, so phones on the same WiFi can open payment links while testing.
function lanAddress() {
  for (const list of Object.values(require('node:os').networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && /^(192\.168|10|172\.(1[6-9]|2\d|3[01]))\./.test(a.address)) return a.address;
    }
  }
  return null;
}
const lan = lanAddress();
const lanUrl = lan ? `http://${lan}:${port}` : null;

module.exports = {
  port,
  // Public address of this payment website, used to build payment links.
  // Without BASE_URL (local testing) links use the WiFi address so they also work on phones.
  // On Vercel the production domain is used automatically.
  baseUrl: (
    process.env.BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    lanUrl ||
    `http://localhost:${port}`
  ).replace(/\/+$/, ''),
  // Neon / any Postgres. Without it a local PGlite database in DATA_DIR is used.
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || '',
  lanUrl,
  // Static files (admin panel, payment page). Kept here so bundled builds resolve it correctly.
  publicDir: path.join(__dirname, '..', 'public'),
  // On Vercel without a database the demo keeps its data in /tmp (resets now and then — connect Neon to keep it).
  dataDir: process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/apnapay-uk' : path.join(__dirname, '..', 'data')),
  // Set TRUST_PROXY=1 when running behind Nginx/Caddy/Cloudflare so HTTPS is detected.
  trustProxy: process.env.TRUST_PROXY === '1' || !!process.env.VERCEL,
  webhookWorkerIntervalMs: Number(process.env.WEBHOOK_INTERVAL_MS || 10000),
};
