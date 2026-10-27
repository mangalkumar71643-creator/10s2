import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { createServer } from '../src/index.js';
import { parseSSE } from '../src/sse.js';

const baseConfig = {
  port: 0,
  provider: 'mock',
  openaiBaseUrl: '',
  openaiApiKey: '',
  model: 'test-model',
  systemPrompt: 'test system prompt',
  apiToken: '',
  saveChats: false,
  dataDir: '/tmp',
};

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, () => resolve(`http://localhost:${server.address().port}`));
  });
}

async function collect(res) {
  const events = [];
  for await (const data of parseSSE(res.body)) events.push(JSON.parse(data));
  return events;
}

let fakeModel;
let fakeModelUrl;
let lastModelRequest;

before(async () => {
  // A stand-in for OpenAI/Ollama/vLLM that streams two tokens.
  fakeModel = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    lastModelRequest = { headers: req.headers, body: JSON.parse(body) };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const text of ['Hello', ' world']) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    }
    res.end('data: [DONE]\n\n');
  });
  fakeModelUrl = await listen(fakeModel);
});

after(() => fakeModel.close());

test('health reports provider and model', async () => {
  const server = createServer(baseConfig);
  const url = await listen(server);
  const res = await fetch(`${url}/api/health`);
  assert.deepEqual(await res.json(), { ok: true, provider: 'mock', model: 'test-model' });
  server.close();
});

test('mock provider streams deltas then done', async () => {
  const server = createServer(baseConfig);
  const url = await listen(server);
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
  });
  const events = await collect(res);
  assert.equal(events.at(-1).type, 'done');
  const text = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
  assert.match(text, /Nova AI/);
  assert.match(text, /"Hi"/);
  server.close();
});

test('openai provider relays the model stream and sends the system prompt', async () => {
  const server = createServer({
    ...baseConfig,
    provider: 'openai',
    openaiBaseUrl: fakeModelUrl,
    openaiApiKey: 'sk-test',
  });
  const url = await listen(server);
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], systemPrompt: 'Be brief' }),
  });
  const events = await collect(res);
  assert.deepEqual(events, [
    { type: 'delta', text: 'Hello' },
    { type: 'delta', text: ' world' },
    { type: 'done' },
  ]);
  assert.equal(lastModelRequest.headers.authorization, 'Bearer sk-test');
  assert.deepEqual(lastModelRequest.body, {
    model: 'test-model',
    stream: true,
    messages: [
      { role: 'system', content: 'Be brief' },
      { role: 'user', content: 'Hi' },
    ],
  });
  server.close();
});

test('rejects bad input and missing token', async () => {
  const server = createServer({ ...baseConfig, apiToken: 'secret' });
  const url = await listen(server);
  const post = (body, token) =>
    fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });

  assert.equal((await post('{"messages":[]}')).status, 401);
  assert.equal((await post('{"messages":[]}', 'secret')).status, 400);
  assert.equal((await post('not json', 'secret')).status, 400);
  assert.equal(
    (await post(JSON.stringify({ messages: [{ role: 'system', content: 'x' }] }), 'secret')).status,
    400,
  );
  server.close();
});
