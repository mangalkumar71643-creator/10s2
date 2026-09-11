// Pure-JS in-memory store, used when running on Vercel: better-sqlite3's
// native addon crashes under Vercel's Lambda runtime (SIGABRT during
// Statement cleanup), so this avoids native modules entirely. Data lives
// only for the life of the warm serverless instance - fine for testing,
// not for real durability. Swap in a hosted database before that matters.

const users = [];
const otpCodes = [];
let nextUserId = 1;
let nextOtpId = 1;

function findUserByEmail(email) {
  return users.find((u) => u.email === email);
}

function findUserByPhone(phone) {
  return users.find((u) => u.phone === phone);
}

function findUserById(id) {
  return users.find((u) => u.id === id);
}

function createUserWithPassword({ name, email, passwordHash }) {
  const user = {
    id: nextUserId++,
    name: name || null,
    email,
    password_hash: passwordHash,
    phone: null,
    phone_verified: 0,
    created_at: new Date().toISOString(),
  };
  users.push(user);
  return user;
}

function createUserWithPhone({ name, phone }) {
  const user = {
    id: nextUserId++,
    name: name || null,
    email: null,
    password_hash: null,
    phone,
    phone_verified: 1,
    created_at: new Date().toISOString(),
  };
  users.push(user);
  return user;
}

function markPhoneVerified(userId) {
  const user = findUserById(userId);
  if (user) user.phone_verified = 1;
  return user;
}

function insertOtp({ phone, code, expiresAt }) {
  otpCodes.push({ id: nextOtpId++, phone, code, expires_at: expiresAt, attempts: 0, consumed: 0 });
}

function findLatestUnconsumedOtp(phone) {
  const matches = otpCodes.filter((o) => o.phone === phone && o.consumed === 0);
  return matches[matches.length - 1];
}

function incrementOtpAttempts(otpId) {
  const otp = otpCodes.find((o) => o.id === otpId);
  if (otp) otp.attempts += 1;
}

function consumeOtp(otpId) {
  const otp = otpCodes.find((o) => o.id === otpId);
  if (otp) otp.consumed = 1;
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
