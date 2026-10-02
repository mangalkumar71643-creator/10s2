const crypto = require('node:crypto');

const IST_OFFSET_MS = 330 * 60 * 1000;

function randomId(prefix, bytes = 10) {
  return `${prefix}_${crypto.randomBytes(bytes).toString('base64url')}`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Start of the current day in India (midnight IST) as a UTC timestamp.
function istDayStart(now = Date.now()) {
  const shifted = now + IST_OFFSET_MS;
  return shifted - (shifted % 86400000) - IST_OFFSET_MS;
}

// "1,234.50" / 1234.5 / "₹ 99" -> paise integer, or null when invalid.
function toPaise(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[₹,\s]|rs\.?|inr/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function rupees(paise) {
  return (paise / 100).toFixed(2);
}

function formatINR(paise) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

module.exports = { randomId, sha256, istDayStart, toPaise, rupees, formatINR, timingSafeEqual, isHttpUrl };
