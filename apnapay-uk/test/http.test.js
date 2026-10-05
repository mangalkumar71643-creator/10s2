// End-to-end over HTTP: admin setup -> website + API -> order -> simulated transfer -> signed webhook.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { createApp, init } = require('../src/server');
const webhooks = require('../src/webhooks');
const db = require('../src/db');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

test('full payment flow', async (t) => {
  await init({ memory: true });
  const appServer = http.createServer(createApp());
  const base = await listen(appServer);

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
      headers: { 'content-type': 'application/json', 'x-requested-with': 'apnapay', cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json() };
  };

  const noHeader = await fetch(base + '/admin/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  assert.equal((await admin('/setup', 'POST', { username: 'owner', password: 'supersecret1', business_name: 'Test Store' })).status, 200);

  // Demo data is ready: two accounts and the built-in shop website.
  const dash0 = (await admin('/dashboard')).data;
  assert.equal(dash0.accounts.length, 2);
  assert.equal(dash0.sites, 1);

  // Account validation.
  assert.equal((await admin('/accounts', 'POST', { label: 'X', holder_name: 'X', sort_code: '12-34', account_number: '12345678' })).status, 400);
  const acc = await admin('/accounts', 'POST', { label: 'Starling', bank: 'starling', holder_name: 'Test Store Ltd', sort_code: '60-83-71', account_number: '11223344', weight: 1, live: true });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));
  assert.equal(acc.data.sort_code, '60-83-71');
  // Only the new account stays live, so we know where orders go.
  for (const a of dash0.accounts) await admin(`/accounts/${a.id}/live`, 'POST', { live: false });

  const site = (await admin('/sites', 'POST', { name: 'Shop', webhook_url: shopUrl + '/hook', return_url: 'https://shop.example/thanks' })).data;
  assert.match(site.api_key, /^ak_demo_/);

  const api = (path, method = 'GET', body, key = site.api_key) =>
    fetch(base + '/api/v1' + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: body && JSON.stringify(body) });
  assert.equal((await api('/orders', 'POST', { amount: 10 }, 'wrong')).status, 401);
  const created = await api('/orders', 'POST', { amount: 24.99, reference: 'INV-1', customer: { name: 'John Smith' } });
  assert.equal(created.status, 201);
  const order = await created.json();
  assert.deepEqual([order.status, order.amount_payable, order.currency, order.demo], ['pending', '24.99', 'GBP', true]);
  assert.match(order.payment_reference, /^AP/);

  const page = await (await fetch(`${base}/pay/${order.id}/data`)).json();
  assert.deepEqual([page.payee.sort_code, page.payee.account_number, page.payee.name], ['60-83-71', '11223344', 'Test Store Ltd']);
  assert.equal(page.order.pay_ref, order.payment_reference);

  // Customer taps "Simulate bank transfer".
  const sim = await (await fetch(`${base}/pay/${order.id}/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  assert.equal(sim.status, 'paid');
  assert.match(sim.return_url, /status=paid/);

  for (let i = 0; i < 50 && !received.length; i++) await new Promise((r) => setTimeout(r, 20));
  await webhooks.processDue();
  assert.equal(received.length, 1);
  const { headers, body } = received[0];
  const expected = 'sha256=' + crypto.createHmac('sha256', site.webhook_secret).update(`${headers['x-apnapay-timestamp']}.${body}`).digest('hex');
  assert.equal(headers['x-apnapay-signature'], expected);
  const event = JSON.parse(body);
  assert.equal(event.event, 'order.paid');
  assert.equal(event.order.reference, 'INV-1');
  assert.match(event.order.bank_payment_id, /^FP/);

  const again = await (await api('/orders', 'POST', { amount: 24.99, reference: 'INV-1' })).json();
  assert.equal(again.id, order.id);
  assert.equal(again.status, 'paid');

  // Admin simulator without reference: one open order with that amount -> matched.
  const o2 = await (await api('/orders', 'POST', { amount: 7, reference: 'INV-2' })).json();
  const r2 = (await admin('/tools/simulate', 'POST', { text: 'You received £7.00 from Jane Doe. Payment ID: FPX12345' })).data;
  assert.equal(r2.order.id, o2.id);

  // Built-in demo shop: buy -> simulate -> webhook to /shop/webhook -> product SOLD.
  await db.run("UPDATE sites SET webhook_url = ? WHERE name = 'Demo Shop (built-in)'", `${base}/shop/webhook`);
  for (const a of dash0.accounts) await admin(`/accounts/${a.id}/live`, 'POST', { live: true });
  const buy = await (await fetch(`${base}/shop/buy/mug`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Ann"}' })).json();
  const shopOrderId = buy.payment_url.split('/').pop();
  assert.equal((await (await fetch(`${base}/pay/${shopOrderId}/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).status, 'paid');
  let mug;
  for (let i = 0; i < 100; i++) {
    await webhooks.processDue();
    mug = (await (await fetch(`${base}/shop/data`)).json()).products.find((p) => p.id === 'mug');
    if (mug.sold) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(mug.sold, 'mug should be SOLD after the webhook');
  assert.equal((await fetch(`${base}/shop/buy/mug`, { method: 'POST' })).status, 409);
  // A forged webhook is rejected.
  const forged = await fetch(`${base}/shop/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-apnapay-timestamp': String(Math.floor(Date.now() / 1000)), 'x-apnapay-signature': 'sha256=00' }, body: '{"event":"order.paid","order":{"reference":"SHOP-tee-1"}}' });
  assert.equal(forged.status, 401);

  // Bank switch: all accounts OFF stops new orders.
  for (const a of (await admin('/accounts')).data.accounts) await admin(`/accounts/${a.id}/live`, 'POST', { live: false });
  assert.equal((await api('/orders', 'POST', { amount: 10 })).status, 503);

  const dash = (await admin('/dashboard')).data;
  assert.equal(dash.today.count, 3);
});
