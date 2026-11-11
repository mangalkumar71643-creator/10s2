import { fetch } from 'expo/fetch';
import type { Role, Settings } from '../types';

type ServerEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

interface StreamChatOptions {
  settings: Settings;
  messages: { role: Role; content: string }[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

const baseUrl = (url: string) => url.trim().replace(/\/+$/, '');

function authHeaders(settings: Settings): Record<string, string> {
  return settings.apiToken ? { Authorization: `Bearer ${settings.apiToken}` } : {};
}

/** Sends the conversation to the server and calls onDelta as the reply streams in. */
export async function streamChat({ settings, messages, signal, onDelta }: StreamChatOptions) {
  const res = await fetch(`${baseUrl(settings.serverUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders(settings) },
    body: JSON.stringify({ messages, systemPrompt: settings.systemPrompt }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Server error ${res.status}`;
    try {
      message = (await res.json()).error ?? message;
    } catch {}
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (!line.startsWith('data:')) continue;

      const event = JSON.parse(line.slice(5)) as ServerEvent;
      if (event.type === 'delta') onDelta(event.text);
      else if (event.type === 'error') throw new Error(event.message);
      else if (event.type === 'done') return;
    }
  }
}

export async function checkHealth(settings: Settings) {
  const res = await fetch(`${baseUrl(settings.serverUrl)}/api/health`, {
    headers: authHeaders(settings),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return (await res.json()) as { ok: boolean; provider: string; model: string };
}
