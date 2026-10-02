// Vercel entry point: every request is handled by the same Express app.
const { createApp, init } = require('../src/server');

init().catch((err) => console.error('database init failed:', err.message));
module.exports = createApp();
