const db = require('./db');

// Optional Telegram alerts (free): create a bot with @BotFather, put the token and your chat id in Settings.
async function notify(text) {
  const { telegram_bot_token: token, telegram_chat_id: chatId } = await db.getSettings();
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Saves to the admin activity feed and, for important events, pings Telegram.
async function alert(level, message, { telegram = level === 'alert' } = {}) {
  await db.logActivity(level, message);
  if (telegram) db.afterCommit(() => notify(message));
}

module.exports = { notify, alert };
