const crypto = require('node:crypto');

function randomId(prefix, bytes = 10) {
  return `${prefix}_${crypto.randomBytes(bytes).toString('base64url')}`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Midnight in the UK (Europe/London, so GMT or BST) as a UTC timestamp.
function ukDayStart(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const offset = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(now / 1000) * 1000;
  return Date.UTC(g('year'), g('month') - 1, g('day')) - offset;
}

// "1,234.50" / 1234.5 / "£ 99" -> pence integer, or null when invalid.
function toPence(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[£,\s]|gbp/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function pounds(pence) {
  return (pence / 100).toFixed(2);
}

function formatGBP(pence) {
  return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = { randomId, sha256, ukDayStart, toPence, pounds, formatGBP, timingSafeEqual, isHttpUrl };
