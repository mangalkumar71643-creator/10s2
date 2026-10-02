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
      headers: { 'content-type': 'application/json', 'x-requested-with': 'apnapay', cookie },
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

  const dev = (await admin('/devices', 'POST', { name: 'Phone 1' })).data;
  const acc = await admin('/accounts', 'POST', {
    label: 'Kotak Main', bank: 'kotak', upi_id: 'shop@kotak', payee_name: 'Test Store', account_last4: '1234',
    sender_hints: 'KOTAKB', device_id: dev.id, weight: 1, live: true,
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));

  const site = (await admin('/sites', 'POST', { name: 'Shop', webhook_url: shopUrl + '/hook', return_url: 'https://shop.example/thanks' })).data;
  assert.match(site.api_key, /^ak_live_/);

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
  const expected = 'sha256=' + crypto.createHmac('sha256', site.webhook_secret).update(`${headers['x-apnapay-timestamp']}.${body}`).digest('hex');
  assert.equal(headers['x-apnapay-signature'], expected);
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
