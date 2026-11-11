const DEFAULT_SYSTEM_PROMPT =
  'You are Nova AI, a helpful, friendly assistant. Reply in the same language the user writes in (Hindi, Hinglish or English).';

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 8787,
    provider: (env.PROVIDER || 'mock').toLowerCase(),
    openaiBaseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    openaiApiKey: env.OPENAI_API_KEY || '',
    model: env.MODEL || 'gpt-4o-mini',
    systemPrompt: env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
    apiToken: env.API_TOKEN || '',
    saveChats: env.SAVE_CHATS === '1',
    dataDir: env.DATA_DIR || new URL('../data/', import.meta.url).pathname,
  };
}
