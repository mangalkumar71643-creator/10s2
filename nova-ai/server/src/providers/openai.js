// Works with any server that speaks the OpenAI Chat Completions API:
// OpenAI, Ollama, vLLM, LM Studio, llama.cpp, TGI, Groq, Together...
// When you train your own model, serve it with one of these and point
// OPENAI_BASE_URL at it — nothing else in the app has to change.

import { parseSSE } from '../sse.js';

export async function* streamOpenAI({ messages, config, signal }) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.openaiApiKey) headers.Authorization = `Bearer ${config.openaiApiKey}`;

  const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ model: config.model, messages, stream: true }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Model API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  for await (const data of parseSSE(res.body)) {
    if (data === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    if (json.error) throw new Error(json.error.message ?? 'Model API error');
    const text = json.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}
