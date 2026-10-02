const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const orders = require('../src/orders');

let started = false;
async function fresh() {
  if (!started) {
    await db.init({ dataDir: null });
    started = true;
  }
  await db.run('TRUNCATE settings, devices, accounts, sites, orders, transactions, webhook_deliveries, activity, attempts RESTART IDENTITY CASCADE');
  const now = Date.now();
  await db.run(`INSERT INTO devices (id, name, token, created_at) VALUES (1, 'Phone 1', 'tok1', ?)`, now);
  await db.run(
    `INSERT INTO accounts (id, label, bank, upi_id, account_last4, sender_hints, live, weight, daily_limit, device_id, created_at, updated_at)
     VALUES (1, 'Kotak', 'kotak', 'me@kotak', '1234', 'KOTAKB', 1, 1, 0, 1, ?, ?),
            (2, 'CBI', 'cbi', 'me@cbin', '5678', 'CBIBNK', 0, 1, 0, 1, ?, ?)`,
    now, now, now, now,
  );
}

const credit = (amount, utr) => `Received Rs.${amount} in your Kotak Bank AC X1234 from x@ybl. UPI Ref:${utr}`;

test('unique amounts never repeat while orders are open', async () => {
  await fresh();
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const o = await orders.createOrder({ basePaise: 49900 });
    assert.ok(o.amount > 49900 && o.amount < 50000);
    assert.ok(!seen.has(o.amount));
    seen.add(o.amount);
  }
});

test('only LIVE accounts get orders; none live -> error', async () => {
  await fresh();
  for (let i = 0; i < 10; i++) assert.equal((await orders.createOrder({ basePaise: 10000 })).account_id, 1);
  await db.run('UPDATE accounts SET live = 0');
  await assert.rejects(() => orders.createOrder({ basePaise: 10000 }), /no bank account is live/);
});

test('daily limit pauses an account and moves orders to the next', async () => {
  await fresh();
  await db.run('UPDATE accounts SET live = 1');
  await db.run('UPDATE accounts SET daily_limit = 25000 WHERE id = 1'); // ₹250
  await db.run('UPDATE accounts SET weight = 100 WHERE id = 1');
  const a = await orders.createOrder({ basePaise: 20000 });
  assert.equal(a.account_id, 1);
  const b = await orders.createOrder({ basePaise: 20000 });
  assert.equal(b.account_id, 2, 'Kotak is over its limit, so CBI takes it');
});

test('SMS with the exact amount confirms the order', async () => {
  await fresh();
  const o = await orders.createOrder({ basePaise: 49900 });
  const r = await orders.ingestMessage({ source: 'sms', text: credit((o.amount / 100).toFixed(2), '427512345678'), sender: 'AX-KOTAKB', deviceId: 1 });
  assert.equal(r.order.id, o.id);
  const after = await orders.getOrder(o.id);
  assert.equal(after.status, 'paid');
  assert.equal(after.utr, '427512345678');
});

test('same payment by SMS and email is counted once', async () => {
  await fresh();
  const o = await orders.createOrder({ basePaise: 10000 });
  const text = credit((o.amount / 100).toFixed(2), '427512345600');
  await orders.ingestMessage({ source: 'sms', text, sender: 'KOTAKB', deviceId: 1 });
  const second = await orders.ingestMessage({ source: 'email', text });
  assert.equal(second.duplicate, true);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM transactions WHERE status = 'matched'")).n, 1);
});

test('round amount is accepted only when one open order has it', async () => {
  await fresh();
  const o = await orders.createOrder({ basePaise: 30000 });
  const r = await orders.ingestMessage({ source: 'sms', text: credit('300.00', '427512345601'), sender: 'KOTAKB', deviceId: 1 });
  assert.equal(r.order.id, o.id);

  await orders.createOrder({ basePaise: 30000 });
  await orders.createOrder({ basePaise: 30000 });
  const r2 = await orders.ingestMessage({ source: 'sms', text: credit('300.00', '427512345602'), sender: 'KOTAKB', deviceId: 1 });
  assert.equal(r2.order, null, 'ambiguous, so it waits for the admin');
  assert.equal(r2.transaction.status, 'unmatched');
});

test('customer UTR links a wrong-amount payment', async () => {
  await fresh();
  await orders.createOrder({ basePaise: 30000 });
  const o = await orders.createOrder({ basePaise: 30000 });
  await orders.createOrder({ basePaise: 30000 });
  await orders.ingestMessage({ source: 'sms', text: credit('300.00', '999988887777'), sender: 'KOTAKB', deviceId: 1 });
  const after = await orders.claimUtr(o.id, '999988887777');
  assert.equal(after.status, 'paid');
  assert.equal(after.matched_by, 'utr');
});

test('UTR given before the SMS arrives is used when it arrives', async () => {
  await fresh();
  const o = await orders.createOrder({ basePaise: 30000 });
  await orders.claimUtr(o.id, '123412341234');
  const r = await orders.ingestMessage({ source: 'sms', text: credit('300.00', '123412341234'), sender: 'KOTAKB', deviceId: 1 });
  assert.equal(r.order.id, o.id);
});

test('underpayment is not confirmed', async () => {
  await fresh();
  const o = await orders.createOrder({ basePaise: 30000 });
  await orders.claimUtr(o.id, '555566667777');
  const r = await orders.ingestMessage({ source: 'sms', text: credit('10.00', '555566667777'), sender: 'KOTAKB', deviceId: 1 });
  assert.equal(r.order, null);
  assert.equal((await orders.getOrder(o.id)).status, 'pending');
});

test('a UTR cannot be reused for a second order', async () => {
  await fresh();
  const a = await orders.createOrder({ basePaise: 30000 });
  const b = await orders.createOrder({ basePaise: 30000 });
  await orders.claimUtr(a.id, '121212121212');
  await assert.rejects(() => orders.claimUtr(b.id, '121212121212'), /already used/);
});

test('late payment after expiry still confirms', async () => {
  await fresh();
  const created = Date.now() - 30 * 60000;
  const o = await orders.createOrder({ basePaise: 12300 }, created);
  await orders.expireStale();
  assert.equal((await orders.getOrder(o.id)).status, 'expired');
  const r = await orders.ingestMessage({ source: 'sms', text: credit((o.amount / 100).toFixed(2), '427512345603'), sender: 'KOTAKB', deviceId: 1 });
  assert.equal(r.order.id, o.id);
  assert.equal((await orders.getOrder(o.id)).status, 'paid');
});

test('idempotent by website reference', async () => {
  await fresh();
  await db.run(`INSERT INTO sites (id, name, api_key_hash, api_key_hint, webhook_secret, created_at) VALUES (1, 'Shop', 'h', 'x', 's', 0)`);
  const a = await orders.createOrder({ siteId: 1, basePaise: 10000, reference: 'P-1' });
  const b = await orders.createOrder({ siteId: 1, basePaise: 10000, reference: 'P-1' });
  assert.equal(a.id, b.id);
  await assert.rejects(() => orders.createOrder({ siteId: 1, basePaise: 20000, reference: 'P-1' }), /different amount/);
});
