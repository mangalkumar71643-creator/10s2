const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { generateCode, deliverOtp, OTP_TTL_MS, MAX_ATTEMPTS } = require("../utils/otp");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[6-9]\d{9}$/; // 10-digit Indian mobile number, no +91 prefix

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    phoneVerified: !!user.phone_verified,
  };
}

// ---- Email / password ----

router.post("/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
    .run(name || null, email, passwordHash);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  return res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

// ---- Phone OTP ----

router.post("/otp/request", (req, res) => {
  const { phone } = req.body || {};
  if (!phone || !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: "Valid 10-digit mobile number is required" });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, ?)"
  ).run(phone, code, expiresAt);

  const delivery = deliverOtp(phone, code);
  return res.json({
    message: "OTP generated",
    expiresInSeconds: OTP_TTL_MS / 1000,
    // Only present in test mode, when there is no real SMS provider wired up.
    ...(delivery.testMode ? { testOtp: code } : {}),
  });
});

router.post("/otp/verify", (req, res) => {
  const { phone, code, name } = req.body || {};
  if (!phone || !PHONE_RE.test(phone) || !code) {
    return res.status(400).json({ error: "Phone and code are required" });
  }

  const otp = db
    .prepare(
      "SELECT * FROM otp_codes WHERE phone = ? AND consumed = 0 ORDER BY id DESC LIMIT 1"
    )
    .get(phone);

  if (!otp) {
    return res.status(400).json({ error: "No OTP was requested for this number" });
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "OTP has expired, please request a new one" });
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Too many attempts, please request a new OTP" });
  }

  if (otp.code !== code) {
    db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(otp.id);
    return res.status(400).json({ error: "Incorrect OTP" });
  }

  db.prepare("UPDATE otp_codes SET consumed = 1 WHERE id = ?").run(otp.id);

  let user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
  if (!user) {
    const info = db
      .prepare("INSERT INTO users (name, phone, phone_verified) VALUES (?, ?, 1)")
      .run(name || null, phone);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  } else if (!user.phone_verified) {
    db.prepare("UPDATE users SET phone_verified = 1 WHERE id = ?").run(user.id);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

// ---- Current user ----

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.sub);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user: publicUser(user) });
});

module.exports = router;
