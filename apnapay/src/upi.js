const QRCode = require('qrcode');
const { rupees } = require('./util');

// Params copied from an uploaded merchant QR. Anything order specific (amount, note, ref)
// or a bank signature (which would break once we change the amount) is dropped.
const KEEP_PARAMS = ['mc', 'mode', 'purpose', 'orgid', 'mid', 'msid', 'mtid'];

function parseUpiUri(text) {
  const raw = String(text || '').trim();
  if (!/^upi:\/\/pay\?/i.test(raw)) return null;
  const params = new URLSearchParams(raw.slice(raw.indexOf('?') + 1));
  const pa = params.get('pa');
  if (!pa) return null;
  const extra = {};
  for (const key of KEEP_PARAMS) if (params.get(key)) extra[key] = params.get(key);
  return { upiId: pa.trim(), payeeName: (params.get('pn') || '').trim(), extra, signed: params.has('sign') };
}

function buildUpiUri(account, order) {
  const params = new URLSearchParams();
  params.set('pa', account.upi_id);
  if (account.payee_name) params.set('pn', account.payee_name);
  let extra = {};
  try {
    extra = JSON.parse(account.upi_params || '{}');
  } catch {}
  for (const [k, v] of Object.entries(extra)) if (KEEP_PARAMS.includes(k)) params.set(k, v);
  params.set('am', rupees(order.amount));
  params.set('cu', 'INR');
  params.set('tn', `Order ${order.reference || order.id}`.slice(0, 50));
  // URLSearchParams encodes spaces as "+", which some UPI apps show literally.
  return 'upi://pay?' + params.toString().replace(/\+/g, '%20');
}

function qrSvg(text) {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } });
}

module.exports = { parseUpiUri, buildUpiUri, qrSvg };
