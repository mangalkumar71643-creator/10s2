const QRCode = require('qrcode');

// SVG QR (used for the 2FA set-up code).
function qrSvg(text) {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } });
}

module.exports = { qrSvg };
