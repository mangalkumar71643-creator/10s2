// End-to-end over HTTP: admin setup -> bank + phone + website -> order -> SMS -> signed webhook.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { createApp, init } = require('../src/server');
const webhooks = require('../src/webhooks');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

test('full payment flow', async (t) => {
  await init({ memory: true });
  const appServer = http.createServer(createApp());
  const base = await listen(appServer);

  // A fake product website that records webhooks.
  const received = [];
  const shop = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.end('ok');
    });
  });
  const shopUrl = await listen(shop);
  t.after(() => {
    appServer.close();
    shop.close();
  });

  let cookie = '';
  const admin = async (path, method = 'GET', body) => {
    const r = await fetch(base + '/admin/api' + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'stockpay', cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json() };
  };

  // CSRF guard
  const noHeader = await fetch(base + '/admin/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);

  assert.equal((await admin('/setup', 'POST', { username: 'owner', password: 'supersecret1', business_name: 'Test Store' })).status, 200);
  assert.equal((await admin('/setup', 'POST', { username: 'x', password: 'supersecret1' })).status, 409);

  // Minimum order is ₹100 by default; check it, then lower it for the small test amounts below.
  const low = await admin('/orders', 'POST', { amount: '50' });
  assert.equal(low.status, 400);
  assert.match(low.data.error, /minimum amount is ₹100/);
  await admin('/settings', 'PUT', { min_order_amount: '1' });
  const dev = (await admin('/devices', 'POST', { name: 'Phone 1' })).data;
  const acc = await admin('/accounts', 'POST', {
    label: 'Kotak Main', bank: 'kotak', upi_id: 'shop@kotak', payee_name: 'Test Store', account_last4: '1234',
    sender_hints: 'KOTAKB', device_id: dev.id, weight: 1, live: true,
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));

  const site = (await admin('/sites', 'POST', { name: 'Shop', webhook_url: shopUrl + '/hook', return_url: 'https://shop.example/thanks' })).data;
  assert.match(site.api_key, /^sk_live_/);

  // Product website creates an order.
  const api = (path, method = 'GET', body, key = site.api_key) =>
    fetch(base + '/api/v1' + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: body && JSON.stringify(body) });
  assert.equal((await api('/orders', 'POST', { amount: 10 }, 'wrong')).status, 401);
  const created = await api('/orders', 'POST', { amount: 499, reference: 'P-101', customer: { name: 'Rahul' } });
  assert.equal(created.status, 201);
  const order = await created.json();
  assert.equal(order.status, 'pending');
  assert.ok(Number(order.amount_payable) > 499 && Number(order.amount_payable) < 500);

  // Payment page data.
  const page = await (await fetch(`${base}/pay/${order.id}/data`)).json();
  assert.equal(page.payee.upi_id, 'shop@kotak');
  assert.match(page.payee.upi_uri, new RegExp(`am=${order.amount_payable}`));
  assert.match(page.payee.qr, /^data:image\/png;base64,/);

  // A fake SMS from a phone number is rejected.
  const fake = await (await fetch(`${base}/ingest/sms/${dev.token}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: '+919876543210', text: `Received Rs.${order.amount_payable} in your Kotak Bank AC X1234. UPI Ref:427500000001` }),
  })).json();
  assert.ok(fake.ignored);

  // The real bank SMS confirms it.
  const sms = await (await fetch(`${base}/ingest/sms/${dev.token}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'AX-KOTAKB', text: `Received Rs.${order.amount_payable} in your Kotak Bank AC X1234 from rahul@okaxis. UPI Ref:427512345678` }),
  })).json();
  assert.equal(sms.matched_order, order.id);

  const status = await (await fetch(`${base}/pay/${order.id}/status`)).json();
  assert.equal(status.status, 'paid');
  assert.match(status.return_url, /status=paid/);

  // Webhook arrives, correctly signed.
  for (let i = 0; i < 50 && !received.length; i++) await new Promise((r) => setTimeout(r, 20));
  await webhooks.processDue();
  assert.equal(received.length, 1);
  const { headers, body } = received[0];
  const expected = 'sha256=' + crypto.createHmac('sha256', site.webhook_secret).update(`${headers['x-stockpay-timestamp']}.${body}`).digest('hex');
  assert.equal(headers['x-stockpay-signature'], expected);
  const event = JSON.parse(body);
  assert.equal(event.event, 'order.paid');
  assert.equal(event.order.reference, 'P-101');
  assert.equal(event.order.utr, '427512345678');

  // API shows paid; asking again with the same reference returns the same order.
  const again = await (await api('/orders', 'POST', { amount: 499, reference: 'P-101' })).json();
  assert.equal(again.id, order.id);
  assert.equal(again.status, 'paid');

  // Email path: a spoofed email (no DKIM) is ignored, an authenticated one is accepted.
  const settings = (await admin('/settings')).data;
  const order2 = await (await api('/orders', 'POST', { amount: 99, reference: 'P-102' })).json();
  const mail = (auth) => [
    'From: Kotak Alerts <alerts@kotak.com>',
    ...(auth ? ['ARC-Authentication-Results: i=1; mx.cloudflare.net; dkim=pass header.d=kotak.com; dmarc=pass'] : []),
    'Subject: Credit',
    'Content-Type: text/plain',
    '',
    `Rs.${order2.amount_payable} credited to your account XX1234 via UPI. UPI Ref No 427599999999`,
  ].join('\r\n');
  const spoof = await (await fetch(settings.email_url.replace(/^https?:\/\/[^/]+/, base), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: 'alerts@kotak.com', raw: mail(false) }),
  })).json();
  assert.ok(spoof.ignored);
  const real = await (await fetch(settings.email_url.replace(/^https?:\/\/[^/]+/, base), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: 'alerts@kotak.com', raw: mail(true) }),
  })).json();
  assert.equal(real.matched_order, order2.id);

  // Bank switch: turning the only bank OFF stops new orders.
  await admin(`/accounts/${acc.data.id}/live`, 'POST', { live: false });
  assert.equal((await api('/orders', 'POST', { amount: 10 })).status, 503);

  const dash = (await admin('/dashboard')).data;
  assert.equal(dash.today.count, 2);
});

test('add money page: ready amounts open a bill', async (t) => {
  const db = require('../src/db');
  const server = http.createServer(createApp());
  const base = await listen(server);
  t.after(() => server.close());
  await db.run('UPDATE accounts SET live = 1');
  const cfg = await (await fetch(base + '/add-money/config')).json();
  assert.equal(cfg.enabled, true);
  assert.ok(cfg.amounts.includes(200));
  const create = (body) => fetch(base + '/add-money/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await create({ amount: 200 })).status, 400); // no user
  const r1 = await (await create({ amount: 200, user: '9876543210' })).json();
  assert.match(r1.payment_url, /^\/pay\/ord_/);
  assert.ok(Number(r1.amount) > 200 && Number(r1.amount) < 201);
  // Tapping the same amount again reuses the open bill.
  const r2 = await (await create({ amount: 200, user: '9876543210' })).json();
  assert.equal(r2.payment_url, r1.payment_url);
  const o = await db.get('SELECT * FROM orders WHERE id = ?', r1.payment_url.split('/').pop());
  assert.equal(o.note, 'Add money');
  assert.equal(o.customer_phone, '9876543210');

  // Custom amounts only when allowed.
  await db.setSetting('topup_custom', '0');
  assert.equal((await create({ amount: 333, user: '9876543210' })).status, 400);
  await db.setSetting('topup_custom', '1');
  assert.equal((await create({ amount: 333, user: '9876543210' })).status, 200);
  // Turned off -> refused.
  await db.setSetting('topup_enabled', '0');
  assert.equal((await create({ amount: 200, user: '1111111' })).status, 403);
  await db.setSetting('topup_enabled', '1');
});

test('add money direct link goes straight to the payment page', async (t) => {
  const db = require('../src/db');
  const server = http.createServer(createApp());
  const base = await listen(server);
  t.after(() => server.close());
  await db.run('UPDATE accounts SET live = 1');
  const r = await fetch(`${base}/add-money/go?amount=400&user=9000000001`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /^\/pay\/ord_/);
  const again = await fetch(`${base}/add-money/go?amount=400&user=9000000001`, { redirect: 'manual' });
  assert.equal(again.headers.get('location'), r.headers.get('location'));
  const bad = await fetch(`${base}/add-money/go?amount=400`, { redirect: 'manual' });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /mobile number/);
});

test('live and test API keys: test orders never touch real money', async (t) => {
  const db = require('../src/db');
  const server = http.createServer(createApp());
  const base = await listen(server);
  const received = [];
  const hook = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { received.push(JSON.parse(b)); res.end('ok'); });
  });
  const hookUrl = await listen(hook);
  t.after(() => { server.close(); hook.close(); });

  let cookie = '';
  const admin = async (path, method = 'GET', body) => {
    const r = await fetch(base + '/admin/api' + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'stockpay', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json() };
  };
  assert.equal((await admin('/login', 'POST', { username: 'owner', password: 'supersecret1' })).status, 200);
  await db.run('UPDATE accounts SET live = 1');
  const site = (await admin('/sites', 'POST', { name: 'Keys Shop', webhook_url: hookUrl + '/h' })).data;
  assert.match(site.api_key, /^sk_live_/);
  assert.match(site.test_key, /^sk_test_/);
  // Both keys can be copied later from the Websites page.
  const listed = (await admin('/sites')).data.find((s) => s.id === site.id);
  assert.equal(listed.live_key, site.api_key);
  assert.equal(listed.test_key, site.test_key);

  const call = (key, path, method = 'GET', body) =>
    fetch(base + '/api/v1' + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: body && JSON.stringify(body) });
  const testOrder = await (await call(site.test_key, '/orders', 'POST', { amount: 250, reference: 'K-1' })).json();
  assert.equal(testOrder.test, true);
  assert.equal(testOrder.amount_payable, '250.00'); // no unique paise, no bank account
  const liveOrder = await (await call(site.api_key, '/orders', 'POST', { amount: 250, reference: 'K-1' })).json();
  assert.equal(liveOrder.test, false);
  assert.notEqual(liveOrder.id, testOrder.id);
  // A key only sees its own mode.
  assert.equal((await call(site.api_key, '/orders/' + testOrder.id)).status, 404);

  // Payment page offers the simulate button; live orders cannot be "test paid".
  const page = await (await fetch(`${base}/pay/${testOrder.id}/data`)).json();
  assert.equal(page.test, true);
  assert.equal(page.payee, null);
  assert.equal((await fetch(`${base}/pay/${liveOrder.id}/test-pay`, { method: 'POST' })).status, 400);
  const paid = await (await fetch(`${base}/pay/${testOrder.id}/test-pay`, { method: 'POST' })).json();
  assert.equal(paid.status, 'paid');
  await webhooks.processDue();
  for (let i = 0; i < 50 && !received.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(received[0].event, 'order.paid');
  assert.equal(received[0].order.test, true);

  // Test money never shows in the dashboard totals.
  const before = (await admin('/dashboard')).data.today.count;
  const orders = require('../src/orders');
  const t2 = await (await call(site.test_key, '/orders', 'POST', { amount: 300 })).json();
  await orders.simulateTestPayment(t2.id);
  assert.equal((await admin('/dashboard')).data.today.count, before);

  // New test key replaces the old one.
  const fresh = (await admin(`/sites/${site.id}/new-test-key`, 'POST')).data;
  assert.notEqual(fresh.test_key, site.test_key);
  assert.equal((await call(site.test_key, '/orders', 'POST', { amount: 100 })).status, 401);
  assert.equal((await call(fresh.test_key, '/orders', 'POST', { amount: 100 })).status, 201);
});

test('API Keys tab creates keys on first open', async (t) => {
  const db = require('../src/db');
  const server = http.createServer(createApp());
  const base = await listen(server);
  t.after(() => server.close());
  let cookie = '';
  const admin = async (path, method = 'GET', body) => {
    const r = await fetch(base + '/admin/api' + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'stockpay', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json() };
  };
  await admin('/login', 'POST', { username: 'owner', password: 'supersecret1' });
  await db.run('UPDATE sites SET active = 0');
  const first = (await admin('/keys')).data;
  assert.match(first.api_base, /\/api\/v1$/);
  assert.equal(first.sites.length, 1);
  assert.match(first.sites[0].live_key, /^sk_live_/);
  assert.match(first.sites[0].test_key, /^sk_test_/);
  // Opening again does not make more websites.
  assert.equal((await admin('/keys')).data.sites.length, 1);
  const r = await fetch(first.api_base.replace(/^https?:\/\/[^/]+/, base) + '/orders', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + first.sites[0].test_key }, body: '{"amount":200}',
  });
  assert.equal(r.status, 201);
});
