const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "..", "novaplay.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    phone TEXT UNIQUE,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

function findUserByPhone(phone) {
  return db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
}

function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function createUserWithPassword({ name, email, passwordHash }) {
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
    .run(name || null, email, passwordHash);
  return findUserById(info.lastInsertRowid);
}

function createUserWithPhone({ name, phone }) {
  const info = db
    .prepare("INSERT INTO users (name, phone, phone_verified) VALUES (?, ?, 1)")
    .run(name || null, phone);
  return findUserById(info.lastInsertRowid);
}

function markPhoneVerified(userId) {
  db.prepare("UPDATE users SET phone_verified = 1 WHERE id = ?").run(userId);
  return findUserById(userId);
}

function insertOtp({ phone, code, expiresAt }) {
  db.prepare("INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, ?)").run(
    phone,
    code,
    expiresAt
  );
}

function findLatestUnconsumedOtp(phone) {
  return db
    .prepare("SELECT * FROM otp_codes WHERE phone = ? AND consumed = 0 ORDER BY id DESC LIMIT 1")
    .get(phone);
}

function incrementOtpAttempts(otpId) {
  db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(otpId);
}

function consumeOtp(otpId) {
  db.prepare("UPDATE otp_codes SET consumed = 1 WHERE id = ?").run(otpId);
}

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  createUserWithPassword,
  createUserWithPhone,
  markPhoneVerified,
  insertOtp,
  findLatestUnconsumedOtp,
  incrementOtpAttempts,
  consumeOtp,
};
