import http from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { getProvider } from './providers/index.js';

const MAX_BODY_BYTES = 1_000_000;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 20_000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

// Only user/assistant turns come from the client; the system prompt is added here.
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, '"messages" must be a non-empty array');
  }
  if (messages.length > MAX_MESSAGES) {
    throw new HttpError(400, `Too many messages (max ${MAX_MESSAGES})`);
  }
  return messages.map((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      throw new HttpError(400, 'Each message needs role "user"|"assistant" and string content');
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      throw new HttpError(400, `Message too long (max ${MAX_MESSAGE_CHARS} characters)`);
    }
    return { role: m.role, content: m.content };
  });
}

async function saveChat(config, messages) {
  await mkdir(config.dataDir, { recursive: true });
  // One chat per line in the OpenAI fine-tuning format, ready for training later.
  const line = JSON.stringify({ messages, createdAt: new Date().toISOString() });
  await appendFile(path.join(config.dataDir, 'conversations.jsonl'), `${line}\n`);
}

async function handleChat(req, res, config) {
  const body = await readJson(req);
  const history = validateMessages(body.messages);
  const systemPrompt =
    typeof body.systemPrompt === 'string' && body.systemPrompt.trim()
      ? body.systemPrompt.trim().slice(0, MAX_MESSAGE_CHARS)
      : config.systemPrompt;
  const messages = [{ role: 'system', content: systemPrompt }, ...history];

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  let reply = '';
  try {
    const stream = getProvider(config.provider);
    for await (const text of stream({ messages, config, signal: controller.signal })) {
      reply += text;
      send({ type: 'delta', text });
    }
    send({ type: 'done' });
  } catch (err) {
    if (controller.signal.aborted) return;
    console.error('[chat]', err);
    send({ type: 'error', message: err.message || 'Something went wrong' });
  } finally {
    res.end();
  }

  if (config.saveChats && reply) {
    saveChat(config, [...messages, { role: 'assistant', content: reply }]).catch((err) =>
      console.error('[save]', err),
    );
  }
}

export function createServer(config = loadConfig()) {
  getProvider(config.provider); // fail fast on a typo in PROVIDER

  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { ok: true, provider: config.provider, model: config.model });
        return;
      }
      if (req.method === 'POST' && pathname === '/api/chat') {
        if (config.apiToken && req.headers.authorization !== `Bearer ${config.apiToken}`) {
          throw new HttpError(401, 'Invalid or missing API token');
        }
        await handleChat(req, res, config);
        return;
      }
      throw new HttpError(404, 'Not found');
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 500 ? 'Internal server error' : err.message });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = loadConfig();
  createServer(config).listen(config.port, () => {
    console.log(`Nova AI server on http://localhost:${config.port} (provider: ${config.provider})`);
  });
}
