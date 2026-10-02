const crypto = require('node:crypto');
const db = require('./db');
const { sha256, timingSafeEqual } = require('./util');

const SESSION_MS = 7 * 24 * 3600 * 1000;
const COOKIE = 'ap_session';

// --- Passwords (scrypt) ---------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const hash = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

// --- TOTP (Google Authenticator compatible, RFC 6238) ---------------------------------------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const num = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(num % 1e6).padStart(6, '0');
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function verifyTotp(secret, code, now = Date.now()) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(now / 30000);
  return [-1, 0, 1].some((d) => timingSafeEqual(totpCode(secret, counter + d), clean));
}

function totpUri(secret, username, issuer) {
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// --- Sessions ---------------------------------------------------------------------------------

async function createSession(now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.run('DELETE FROM sessions WHERE expires_at < ?', now);
  await db.run('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)', sha256(token), now, now + SESSION_MS);
  return token;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

async function sessionValid(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const row = await db.get('SELECT expires_at FROM sessions WHERE token_hash = ?', sha256(token));
  return !!row && row.expires_at > Date.now();
}

function setSessionCookie(req, res, token) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
}

async function clearSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function logoutEverywhere() {
  return db.run('DELETE FROM sessions');
}

// --- Brute force protection (stored in the database, so it works across serverless instances) ---

async function tooManyAttempts(key, limit = 8, windowMs = 15 * 60000) {
  const now = Date.now();
  await db.run('DELETE FROM attempts WHERE created_at < ?', now - 24 * 3600000);
  const row = await db.get('SELECT COUNT(*) AS n FROM attempts WHERE key = ? AND created_at > ?', key, now - windowMs);
  return row.n >= limit;
}
function recordAttempt(key) {
  return db.run('INSERT INTO attempts (key, created_at) VALUES (?, ?)', key, Date.now());
}
function resetAttempts(key) {
  return db.run('DELETE FROM attempts WHERE key = ?', key);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateTotpSecret,
  verifyTotp,
  totpCode,
  totpUri,
  createSession,
  sessionValid,
  setSessionCookie,
  clearSession,
  logoutEverywhere,
  tooManyAttempts,
  recordAttempt,
  resetAttempts,
};
