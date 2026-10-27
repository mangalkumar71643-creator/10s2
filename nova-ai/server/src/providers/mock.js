// Demo model so the whole app works before you have a real/trained model.
// It does not understand anything; it only proves streaming end to end.

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('aborted'));
    });
  });

function buildReply(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const question = lastUser?.content.trim() ?? '';
  const turns = messages.filter((m) => m.role === 'user').length;

  return [
    `Namaste! Main **Nova AI** hoon — abhi demo mode me chal raha hoon.`,
    '',
    `Aapne likha: "${question.length > 200 ? `${question.slice(0, 200)}…` : question}"`,
    '',
    `Is chat me yeh aapka message number ${turns} hai. Asli jawab ke liye server ki \`.env\` file me ` +
      '`PROVIDER=openai` set karke apna model (OpenAI, Ollama, ya aapka khud ka trained model) jodiye.',
    '',
    '```bash',
    'PROVIDER=openai',
    'OPENAI_BASE_URL=http://localhost:11434/v1',
    'MODEL=llama3.2',
    '```',
  ].join('\n');
}

export async function* streamMock({ messages, signal }) {
  const reply = buildReply(messages);
  // Split on whitespace but keep it, so markdown/newlines survive.
  for (const piece of reply.match(/\S+\s*|\s+/g) ?? []) {
    await sleep(25, signal);
    yield piece;
  }
}
