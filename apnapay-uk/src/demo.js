// Demo data so the panel works on first open: two fake UK bank accounts and a built-in demo shop
// (a "product website" that uses the API and receives signed webhooks). No real money anywhere.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { sha256 } = require('./util');

const PRODUCTS = [
  ['tee', 'Organic Cotton T-shirt', '👕', 18_00],
  ['mug', 'London Skyline Mug', '☕', 9_50],
  ['headphones', 'Wireless Headphones', '🎧', 49_99],
  ['umbrella', 'Compact Umbrella', '☂️', 14_00],
];

async function seedDemo() {
  const now = Date.now();
  if (!(await db.get('SELECT id FROM accounts LIMIT 1'))) {
    await db.run(
      `INSERT INTO accounts (label, bank, holder_name, sort_code, account_number, live, weight, daily_limit, created_at, updated_at)
       VALUES ('Monzo Business', 'monzo', 'Demo Store Ltd', '123456', '12345678', 1, 2, 0, ?, ?),
              ('Barclays Current', 'barclays', 'Demo Store Ltd', '654321', '87654321', 1, 1, 500000, ?, ?)`,
      now, now, now, now,
    );
  }
  for (const [id, name, emoji, price] of PRODUCTS) {
    await db.run('INSERT INTO shop_products (id, name, emoji, price) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', id, name, emoji, price);
  }

  // The demo shop is a normal "website" with an API key and webhook secret, like any real one.
  const settings = await db.getSettings();
  let site = settings.demo_shop_site_id ? await db.get('SELECT * FROM sites WHERE id = ?', Number(settings.demo_shop_site_id)) : null;
  if (!site) {
    const key = 'ak_demo_' + crypto.randomBytes(24).toString('base64url');
    const { rows } = await db.run(
      `INSERT INTO sites (name, api_key_hash, api_key_hint, webhook_url, webhook_secret, return_url, created_at)
       VALUES ('Demo Shop (built-in)', ?, ?, '', ?, '', ?) RETURNING id`,
      sha256(key), key.slice(0, 12) + '…' + key.slice(-4), 'whsec_' + crypto.randomBytes(24).toString('base64url'), now,
    );
    await db.setSetting('demo_shop_site_id', String(rows[0].id));
    site = await db.get('SELECT * FROM sites WHERE id = ?', rows[0].id);
  }
  // Keep its URLs pointing at wherever this server currently lives.
  await db.run('UPDATE sites SET webhook_url = ?, return_url = ? WHERE id = ?', `${config.baseUrl}/shop/webhook`, `${config.baseUrl}/shop`, site.id);
}

async function demoShopSite() {
  const id = Number((await db.getSettings()).demo_shop_site_id);
  return id ? db.get('SELECT * FROM sites WHERE id = ?', id) : null;
}

module.exports = { seedDemo, demoShopSite };
