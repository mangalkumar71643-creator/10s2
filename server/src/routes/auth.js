const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const store = require("../store");
const { generateCode, deliverOtp, OTP_TTL_MS, MAX_ATTEMPTS } = require("../utils/otp");
const { requireAuth } = require("../middleware/auth");
const { JWT_SECRET } = require("../config");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[6-9]\d{9}$/; // 10-digit Indian mobile number, no +91 prefix

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "30d" });
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

  if (store.findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = store.createUserWithPassword({ name, email, passwordHash });
  return res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = store.findUserByEmail(email);
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
  store.insertOtp({ phone, code, expiresAt });

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

  const otp = store.findLatestUnconsumedOtp(phone);

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
    store.incrementOtpAttempts(otp.id);
    return res.status(400).json({ error: "Incorrect OTP" });
  }

  store.consumeOtp(otp.id);

  let user = store.findUserByPhone(phone);
  if (!user) {
    user = store.createUserWithPhone({ name, phone });
  } else if (!user.phone_verified) {
    user = store.markPhoneVerified(user.id);
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

// ---- Current user ----

router.get("/me", requireAuth, (req, res) => {
  const user = store.findUserById(req.user.sub);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user: publicUser(user) });
});

module.exports = router;
