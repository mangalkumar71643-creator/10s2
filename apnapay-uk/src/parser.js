// Reads a UK bank "money in" notification (app push / email text), e.g.
//   "You received £25.00 from John Smith. Reference: AP7KQ2XM. Payment ID: FP4A9C2E71"
//   "John Smith sent you £25.00 – AP7KQ2XM"
//   "Faster Payment of GBP 25.00 credited to account ending 5678 from J SMITH ref AP7KQ2XM"
const { toPence } = require('./util');

const AMOUNT = /(?:£|\bGBP)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;
const CREDIT = /\b(received|sent you|paid you|credited|credit of|incoming|paid in|money in|deposit(?:ed)?)\b/i;
const DEBIT = /\b(you sent|you paid|you've paid|debited|spent|card payment|withdrawn|direct debit|payment to)\b/i;
const REFERENCE = /\bref(?:erence)?\b[\s:.#-]*([A-Za-z0-9][A-Za-z0-9 -]{1,17}[A-Za-z0-9])/i;
const PAYMENT_ID = /\b(?:payment id|transaction id|fps id|fpid)\b[\s:#-]*([A-Za-z0-9-]{6,40})/i;
const LAST4 = /\b(?:account|acc|a\/c)\b[^0-9]{0,20}(\d{4})\b/i;
const PAYER_FROM = /\bfrom\s+([A-Za-z][A-Za-z .'&-]{0,40}?)(?=\s*[.,;–-]|\s+(?:ref|reference|on|via|to|for)\b|$)/i;
const PAYER_SENT = /^([A-Za-z][A-Za-z .'&-]{0,40}?)\s+(?:sent you|paid you)\b/i;

// Our payment references look like AP + 6 letters/digits (always at least one digit, so words like
// "APPLE PAY" never match). Finds one anywhere in a text.
const OUR_REF = /\bAP[\s-]?([A-HJ-NP-Z2-9]{3})[\s-]?([A-HJ-NP-Z2-9]{3})\b/i;

const OUR_REF_ALL = new RegExp(OUR_REF.source, 'gi');

function findOurRef(text) {
  for (const m of String(text || '').matchAll(OUR_REF_ALL)) {
    const code = (m[1] + m[2]).toUpperCase();
    if (/\d/.test(code)) return 'AP' + code;
  }
  return null;
}

function parseBankMessage(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { type: 'ignored', reason: 'empty message' };
  const amountMatch = AMOUNT.exec(text);
  const amount = amountMatch ? toPence(amountMatch[1]) : null;
  const isCredit = CREDIT.test(text);
  const isDebit = DEBIT.test(text);
  const out = {
    type: 'ignored',
    amount,
    payment_id: (PAYMENT_ID.exec(text) || [])[1] || null,
    reference: findOurRef(text) || ((REFERENCE.exec(text) || [])[1] || '').trim() || '',
    payer: ((PAYER_SENT.exec(text) || PAYER_FROM.exec(text) || [])[1] || '').trim(),
    last4: (LAST4.exec(text) || [])[1] || null,
  };
  if (!amount) return { ...out, reason: 'no £ amount found' };
  if (isDebit && !/\b(sent you|paid you)\b/i.test(text)) return { ...out, type: 'debit', reason: 'money going out' };
  if (!isCredit) return { ...out, reason: 'not a money-in message' };
  return { ...out, type: 'credit' };
}

module.exports = { parseBankMessage, findOurRef };
