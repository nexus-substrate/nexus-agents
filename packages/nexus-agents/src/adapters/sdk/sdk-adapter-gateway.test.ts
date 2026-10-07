/** Public custom-openai SDK compatibility delegates to the gateway HTTP client (#7150). */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SdkAdapter } from './sdk-adapter.js';
import {
  echoModelScript,
  startFakeGateway,
  type FakeGateway,
} from '../../testing/gateway/fake-gateway.js';
import { FAKE_OPENAI_KEY } from '../../testing/test-secrets.js';
import type { CompletionRequest } from '../../core/index.js';

// A compatibility alias must work without loading the optional AI SDK.
vi.mock('ai', () => ({
  generateText: () => {
    throw new Error('custom-openai must use gateway HTTP');
  },
  streamText: () => {
    throw new Error('custom-openai must use gateway HTTP');
  },
  Output: {
    object: () => {
      throw new Error('custom-openai must use gateway HTTP');
    },
  },
  jsonSchema: (schema: unknown) => schema,
}));

const MODEL = 'gpt-4o';
const REQUEST: CompletionRequest = { messages: [{ role: 'user', content: 'Hello' }] };

describe('SdkAdapter custom-openai compatibility alias (#7150)', () => {
  let gateway: FakeGateway;
  beforeAll(async () => {
    gateway = await startFakeGateway({
      catalog: [{ id: MODEL, object: 'model', created: 1, owned_by: 'openai' }],
    });
  });
  beforeEach(() => {
    gateway.clearRequests();
    gateway.setScript(echoModelScript);
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', '1');
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'chat');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', gateway.baseUrl);
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', FAKE_OPENAI_KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await gateway.close();
  });

  it('sends the verbatim model through B without loading the AI SDK', async () => {
    const adapter = new SdkAdapter({ providerId: 'custom-openai', modelId: MODEL });
    const result = await adapter.complete(REQUEST);
    expect(result.ok).toBe(true);
    expect(adapter.providerId).toBe('sdk-custom-openai');
    expect(gateway.chatRequests()).toHaveLength(1);
    expect(gateway.chatRequests()[0]?.body).toMatchObject({ model: MODEL });
    if (result.ok)
      expect(result.value.content).toEqual([{ type: 'text', text: `reply from ${MODEL}` }]);
  });

  it('honors explicit URL and key over the environment', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'https://unused.example/v1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', 'TEST-unused-key');
    const adapter = new SdkAdapter({
      providerId: 'custom-openai',
      modelId: MODEL,
      baseUrl: gateway.baseUrl,
      apiKey: FAKE_OPENAI_KEY,
      timeout: 1_000,
      maxRetries: 0,
    });
    const result = await adapter.complete(REQUEST);
    expect(result.ok).toBe(true);
    expect(gateway.chatRequests()[0]?.hadAuthorization).toBe(true);
  });

  describe.each(['chat', 'responses'] as const)('explicit-only token caps on %s', (surface) => {
    it.each([undefined, 100])('completes with maxTokens=%s', async (maxTokens) => {
      vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', surface);
      const adapter = new SdkAdapter({ providerId: 'custom-openai', modelId: MODEL });
      const result = await adapter.complete({
        ...REQUEST,
        ...(maxTokens !== undefined && { maxTokens }),
      });
      expect(result.ok).toBe(true);
      expect(gateway.requests).toHaveLength(1);
      const cap = surface === 'chat' ? 'max_completion_tokens' : 'max_output_tokens';
      const body = gateway.requests[0]?.body;
      expect(Object.keys(body ?? {}).sort()).toEqual(
        [
          surface === 'chat' ? 'messages' : 'input',
          'model',
          ...(maxTokens !== undefined ? [cap] : []),
        ].sort()
      );
      if (maxTokens !== undefined) expect(body).toHaveProperty(cap, maxTokens);
      else expect(body).not.toHaveProperty(cap);
    });

    if (surface === 'responses')
      it.each([undefined, 100])('streams with maxTokens=%s', async (maxTokens) => {
        vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', surface);
        const adapter = new SdkAdapter({ providerId: 'custom-openai', modelId: MODEL });
        const chunks = [];
        for await (const chunk of adapter.stream({
          ...REQUEST,
          ...(maxTokens !== undefined && { maxTokens }),
        }))
          chunks.push(chunk);
        expect(chunks.at(-1)).toMatchObject({ type: 'message_stop' });
        expect(gateway.requests).toHaveLength(1);
        const cap = 'max_output_tokens';
        const body = gateway.requests[0]?.body;
        expect(Object.keys(body ?? {}).sort()).toEqual(
          ['input', 'model', 'stream', ...(maxTokens !== undefined ? [cap] : [])].sort()
        );
        if (maxTokens !== undefined) expect(body).toHaveProperty(cap, maxTokens);
        else expect(body).not.toHaveProperty(cap);
      });
  });

  it('forwards tool calls through the gateway client', async () => {
    gateway.setScript(() => ({
      kind: 'tool_calls',
      calls: [{ id: 'call-test', name: 'lookup', arguments: '{"query":"test"}' }],
    }));
    const adapter = new SdkAdapter({ providerId: 'custom-openai', modelId: MODEL });
    const result = await adapter.complete({
      ...REQUEST,
      tools: [{ name: 'lookup', description: 'Find a record', inputSchema: { type: 'object' } }],
    });
    expect(result.ok).toBe(true);
    expect(gateway.chatRequests()[0]?.body).toMatchObject({
      tools: [{ type: 'function', function: { name: 'lookup' } }],
    });
    if (result.ok) {
      expect(result.value.stopReason).toBe('tool_use');
      expect(result.value.content).toContainEqual({
        type: 'tool_use',
        id: 'call-test',
        name: 'lookup',
        input: { query: 'test' },
      });
    }
  });

  it('preserves lazy missing-key failure without sending a request', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', '');
    const adapter = new SdkAdapter({ providerId: 'custom-openai', modelId: MODEL });
    const result = await adapter.complete(REQUEST);
    expect(result.ok).toBe(false);
    expect(gateway.requests).toHaveLength(0);
  });

  it('preserves the Responses surface selected at construction', async () => {
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'responses');
    const adapter = new SdkAdapter({ providerId: 'custom-openai', modelId: MODEL });
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'chat');
    const result = await adapter.complete(REQUEST);
    expect(result.ok).toBe(true);
    expect(gateway.requests[0]?.path).toBe('/v1/responses');
    expect(gateway.requests[0]?.body).toMatchObject({ model: MODEL });
  });

  it('streams through B on the Responses surface without loading the AI SDK', async () => {
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'responses');
    const adapter = new SdkAdapter({ providerId: 'custom-openai', modelId: MODEL });
    const chunks = [];
    for await (const chunk of adapter.stream(REQUEST)) chunks.push(chunk);
    expect(gateway.requests[0]?.path).toBe('/v1/responses');
    expect(gateway.requests[0]?.body).toMatchObject({ stream: true });
    expect(chunks.at(-1)).toMatchObject({ type: 'message_stop' });
    expect(chunks.some((chunk) => chunk.type === 'content_block_delta')).toBe(true);
  });
});
