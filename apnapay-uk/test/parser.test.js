const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBankMessage, findOurRef } = require('../src/parser');

test('reads UK money-in notifications', () => {
  const a = parseBankMessage('You received £25.00 from John Smith. Reference: AP7KQ2XM. Payment ID: FP4A9C2E71');
  assert.deepEqual([a.type, a.amount, a.reference, a.payer, a.payment_id], ['credit', 2500, 'AP7KQ2XM', 'John Smith', 'FP4A9C2E71']);

  const b = parseBankMessage('John Smith sent you £1,250.50 – ap 7kq 2xm');
  assert.deepEqual([b.type, b.amount, b.reference, b.payer], ['credit', 125050, 'AP7KQ2XM', 'John Smith']);

  const c = parseBankMessage('Faster Payment of GBP 49.99 credited to account ending 5678 from J SMITH ref INV 2231');
  assert.deepEqual([c.type, c.amount, c.last4, c.reference], ['credit', 4999, '5678', 'INV 2231']);
});

test('ignores money going out and junk', () => {
  assert.equal(parseBankMessage('You sent £10.00 to Tesco').type, 'debit');
  assert.equal(parseBankMessage('Card payment of £3.20 at Pret').type, 'debit');
  assert.equal(parseBankMessage('Your statement is ready').type, 'ignored');
  assert.equal(parseBankMessage('').type, 'ignored');
});

test('finds our reference even when typed with spaces or dashes', () => {
  assert.equal(findOurRef('Ref: AP-7KQ-2XM'), 'AP7KQ2XM');
  assert.equal(findOurRef('payment for order ap7kq2xm thanks'), 'AP7KQ2XM');
  assert.equal(findOurRef('APPLE PAY'), null);
  assert.equal(findOurRef('paid via APPLE PAY ref AP2BC3DE'), 'AP2BC3DE');
});
