const crypto = require("crypto");

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString(); // 6 digits
}

/**
 * "Sends" the OTP. In test mode (no SMS provider configured) it just logs it
 * and the caller returns it in the API response so the app can be tested
 * end-to-end without a paid SMS gateway.
 */
function deliverOtp(phone, code) {
  const testMode = process.env.OTP_TEST_MODE !== "false";
  if (testMode) {
    console.log(`[OTP][TEST MODE] ${phone} -> ${code}`);
    return { delivered: false, testMode: true };
  }
  // Real SMS provider integration (Twilio / MSG91 / etc.) goes here once
  // credentials are available.
  throw new Error("No SMS provider configured and OTP_TEST_MODE is false");
}

module.exports = { generateCode, deliverOtp, OTP_TTL_MS, MAX_ATTEMPTS };
