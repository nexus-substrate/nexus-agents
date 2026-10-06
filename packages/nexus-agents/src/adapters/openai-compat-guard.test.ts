import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { createOpenAICompatAdapter } from './openai-compat-adapter.js';
import { FAKE_OPENAI_KEY } from '../testing/test-secrets.js';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
const request = { messages: [{ role: 'user' as const, content: 'guard probe' }] };
beforeEach(() => {
  vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', '');
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(lookup).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('canonical gateway guard applies to fallback clients', () => {
  it('rejects loopback synchronously even without catalogue discovery', () => {
    expect(() =>
      createOpenAICompatAdapter('gpt-5.5', {
        baseUrl: 'http://127.0.0.1:4000/v1',
        apiKey: FAKE_OPENAI_KEY,
      })
    ).toThrow(/SSRF/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects private DNS before HTTP and retries the guard after refusal', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);
    const adapter = createOpenAICompatAdapter('gpt-5.5', {
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: FAKE_OPENAI_KEY,
      maxRetries: 0,
    });
    expect((await adapter.complete(request)).ok).toBe(false);
    expect((await adapter.complete(request)).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
