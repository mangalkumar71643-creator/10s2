import { streamMock } from './mock.js';
import { streamOpenAI } from './openai.js';

const providers = {
  mock: streamMock,
  openai: streamOpenAI,
};

export function getProvider(name) {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown PROVIDER "${name}". Use one of: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}
