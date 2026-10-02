// Work that may finish after the HTTP response (Telegram alerts, webhooks).
// On Vercel the function is frozen after responding unless we register the promise with waitUntil.
let waitUntil = null;
try {
  ({ waitUntil } = require('@vercel/functions'));
} catch {}

const onVercel = !!process.env.VERCEL;

// Takes a function so the work starts outside any open database transaction.
function background(task) {
  const db = require('./db');
  const safe = db.detached(() => Promise.resolve().then(task)).catch((err) => console.error('background task failed:', err.message));
  if (onVercel && waitUntil) {
    try {
      waitUntil(safe);
    } catch {}
  }
  return safe;
}

module.exports = { background };
