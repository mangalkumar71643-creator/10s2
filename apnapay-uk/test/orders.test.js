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
  await db.run('TRUNCATE settings, accounts, sites, orders, transactions, webhook_deliveries, activity, attempts RESTART IDENTITY CASCADE');
  const now = Date.now();
  await db.run(
    `INSERT INTO accounts (id, label, bank, holder_name, sort_code, account_number, live, weight, daily_limit, created_at, updated_at)
     VALUES (1, 'Monzo', 'monzo', 'Demo Ltd', '123456', '12345678', 1, 1, 0, ?, ?),
            (2, 'Barclays', 'barclays', 'Demo Ltd', '654321', '87654321', 0, 1, 0, ?, ?)`,
    now, now, now, now,
  );
}

const credit = (pounds, ref = '', id = 'FP' + Math.random().toString(16).slice(2, 10)) =>
  `You received £${pounds} from John Smith.${ref ? ` Reference: ${ref}.` : ''} Payment ID: ${id}`;

test('every order gets its own reference and the exact price', async () => {
  await fresh();
  const refs = new Set();
  for (let i = 0; i < 20; i++) {
    const o = await orders.createOrder({ basePence: 2499 });
    assert.equal(o.amount, 2499);
    assert.match(o.pay_ref, /^AP[A-HJ-NP-Z2-9]{6}$/);
    assert.match(o.pay_ref.slice(2), /\d/);
    assert.ok(!refs.has(o.pay_ref));
    refs.add(o.pay_ref);
  }
});

test('only LIVE accounts get orders; none live -> error; minimum enforced', async () => {
  await fresh();
  for (let i = 0; i < 10; i++) assert.equal((await orders.createOrder({ basePence: 1000 })).account_id, 1);
  await db.setSetting('min_order_amount', '5');
  await assert.rejects(() => orders.createOrder({ basePence: 499 }), /minimum amount is £5.00/);
  await db.run('UPDATE accounts SET live = 0');
  await assert.rejects(() => orders.createOrder({ basePence: 1000 }), /no bank account is live/);
});

test('matches by reference, even with many orders of the same amount', async () => {
  await fresh();
  const a = await orders.createOrder({ basePence: 1000 });
  const b = await orders.createOrder({ basePence: 1000 });
  const r = await orders.ingestMessage({ source: 'demo', text: credit('10.00', b.pay_ref.slice(0, 2) + '-' + b.pay_ref.slice(2)) });
  assert.equal(r.order.id, b.id);
  assert.equal(r.order.matched_by, 'reference');
  assert.equal((await orders.getOrder(a.id)).status, 'pending');
});

test('no reference: matched only when one open order has that amount', async () => {
  await fresh();
  const a = await orders.createOrder({ basePence: 1500 });
  const r = await orders.ingestMessage({ source: 'demo', text: credit('15.00') });
  assert.equal(r.order.id, a.id);
  assert.equal(r.order.matched_by, 'amount');

  await orders.createOrder({ basePence: 2000 });
  await orders.createOrder({ basePence: 2000 });
  const r2 = await orders.ingestMessage({ source: 'demo', text: credit('20.00') });
  assert.equal(r2.order, null);
  assert.equal(r2.transaction.status, 'unmatched');
});

test('underpaid with reference is not confirmed; duplicates are ignored', async () => {
  await fresh();
  const o = await orders.createOrder({ basePence: 5000 });
  const low = await orders.ingestMessage({ source: 'demo', text: credit('40.00', o.pay_ref) });
  assert.equal(low.order, null);
  const ok = await orders.ingestMessage({ source: 'demo', text: credit('50.00', o.pay_ref, 'FPSAME001') });
  assert.equal(ok.order.status, 'paid');
  const dup = await orders.ingestMessage({ source: 'demo', text: credit('50.00', o.pay_ref, 'FPSAME001') });
  assert.ok(dup.duplicate);
});

test('late transfer with reference still confirms an expired order', async () => {
  await fresh();
  const o = await orders.createOrder({ basePence: 3000 }, Date.now() - 2 * 3600000);
  assert.equal((await orders.getOrder(o.id)).status, 'expired');
  const r = await orders.ingestMessage({ source: 'demo', text: credit('30.00', o.pay_ref) });
  assert.equal(r.order.status, 'paid');
});

test('daily limit pauses an account', async () => {
  await fresh();
  await db.run('UPDATE accounts SET live = 1, daily_limit = 5000 WHERE id = 1');
  await db.run('UPDATE accounts SET weight = 0 WHERE id = 2');
  await orders.createOrder({ basePence: 4000 });
  await assert.rejects(() => orders.createOrder({ basePence: 2000 }), /no bank account is live/);
});
