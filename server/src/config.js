// Falls back to a fixed dev secret when JWT_SECRET isn't set as an environment
// variable, so the API still works right after a fresh deploy. Set a real
// JWT_SECRET in the hosting platform's environment variables before this
// handles anything but test data.
const JWT_SECRET = process.env.JWT_SECRET || "novaplay-dev-secret-change-me";

if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET is not set - using an insecure default. Set it before going live.");
}

module.exports = { JWT_SECRET };
