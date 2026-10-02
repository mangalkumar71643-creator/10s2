const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBankMessage, extractEmailText } = require('../src/parser');

test('Kotak style credit SMS', () => {
  const p = parseBankMessage('Received Rs.499.37 in your Kotak Bank AC X1234 from rahul@okaxis on 02-10-26.UPI Ref:427512345678.');
  assert.equal(p.type, 'credit');
  assert.equal(p.amount, 49937);
  assert.equal(p.utr, '427512345678');
  assert.equal(p.last4, '1234');
  assert.equal(p.payer, 'rahul@okaxis');
});

test('Central Bank style credit SMS', () => {
  const p = parseBankMessage(
    'Your a/c no. XXXXXXXX5678 is credited by Rs.1,250.05 on 02-10-2026 by a/c linked to VPA abc@ybl (UPI Ref no 612345678901).-CBoI',
  );
  assert.equal(p.type, 'credit');
  assert.equal(p.amount, 125005);
  assert.equal(p.utr, '612345678901');
  assert.equal(p.last4, '5678');
});

test('Fino style credit SMS with INR', () => {
  const p = parseBankMessage('Dear Customer, A/c XX9012 credited with INR 75.12 on 02-OCT-26 via UPI. RRN 700011112222. Avl Bal INR 1,500.00 - Fino Payments Bank');
  assert.equal(p.type, 'credit');
  assert.equal(p.amount, 7512);
  assert.equal(p.utr, '700011112222');
  assert.equal(p.last4, '9012');
});

test('debit messages are not treated as payments', () => {
  const p = parseBankMessage('Sent Rs.500.00 from Kotak Bank AC X1234 to shop@ybl on 02-10-26.UPI Ref 427512345679. Not you, call 18602662666');
  assert.equal(p.type, 'debit');
  const q = parseBankMessage('Rs 200 debited from A/c XX1234 and credited to friend@upi. UPI Ref 123456789012');
  assert.equal(q.type, 'debit');
});

test('OTP and collect requests are ignored', () => {
  assert.equal(parseBankMessage('OTP for your transaction of Rs 500 is 123456').type, 'ignore');
  assert.equal(parseBankMessage('abc@ybl has requested money Rs 300 from you').type, 'ignore');
});

test('credit without amount is ignored', () => {
  assert.equal(parseBankMessage('Your account has been credited').type, 'ignore');
});

test('email: quoted-printable HTML alert', () => {
  const raw = [
    'From: Kotak Alerts <alerts@kotak.com>',
    'Subject: Credit alert',
    'Content-Type: multipart/alternative; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<p>Rs.499.37 has been credited to your account XX1234 =',
    'via UPI. UPI Ref No 427512345678</p>',
    '--b1--',
  ].join('\r\n');
  const text = extractEmailText(raw);
  const p = parseBankMessage(text);
  assert.equal(p.type, 'credit');
  assert.equal(p.amount, 49937);
  assert.equal(p.utr, '427512345678');
});

test('email: base64 plain text', () => {
  const body = Buffer.from('INR 10.01 credited to A/c XX1234. UPI Ref 111122223333').toString('base64');
  const raw = `From: a@centralbank.co.in\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}`;
  const p = parseBankMessage(extractEmailText(raw));
  assert.equal(p.amount, 1001);
  assert.equal(p.utr, '111122223333');
});
