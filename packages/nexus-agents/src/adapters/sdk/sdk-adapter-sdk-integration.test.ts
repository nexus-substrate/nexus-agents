/** Exercise optional SDK dependencies over local HTTP without paid API calls. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ai from 'ai';
import { SdkAdapter } from './sdk-adapter.js';
import { startFakeGateway, type FakeGateway } from '../../testing/gateway/fake-gateway.js';
import { FAKE_OPENAI_KEY } from '../../testing/test-secrets.js';
import type { CompletionRequest } from '../../core/index.js';

// Observe the entry point while executing the installed SDK over local HTTP.
vi.mock('ai', { spy: true });

const MODEL = 'gpt-4o';
const REQUEST: CompletionRequest = {
  systemPrompt: 'Reply concisely.',
  messages: [
    { role: 'system', content: 'Preserve this system message.' },
    { role: 'user', content: 'Hello' },
  ],
};

describe('SdkAdapter with real AI SDK dependencies (#7223)', () => {
  let gateway: FakeGateway;
  beforeAll(async () => {
    gateway = await startFakeGateway({
      catalog: [{ id: MODEL, object: 'model', created: 1, owned_by: 'openai' }],
    });
  });
  beforeEach(() => {
    gateway.clearRequests();
    vi.stubEnv('OPENAI_BASE_URL', gateway.baseUrl);
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'chat');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await gateway.close();
  });

  it.each(['text', 'json_schema', 'json_object'] as const)(
    'preserves system-role messages for %s completions',
    async (format) => {
      const generateText = vi.mocked(ai.generateText);
      const reply = format === 'text' ? 'Hello back' : '{"reply":"Hello back"}';
      gateway.setScript(() => ({ kind: 'text', content: reply }));
      const adapter = new SdkAdapter({
        providerId: 'openai',
        modelId: MODEL,
        apiKey: FAKE_OPENAI_KEY,
      });
      const result = await adapter.complete({
        ...REQUEST,
        responseFormat:
          format === 'json_schema'
            ? {
                type: 'json_schema',
                schema: {
                  type: 'object',
                  properties: { reply: { type: 'string' } },
                  required: ['reply'],
                  additionalProperties: false,
                },
              }
            : { type: format },
      });
      expect(generateText).toHaveBeenCalledTimes(1);
      if (format !== 'text') {
        expect(generateText.mock.calls[0]?.[0]).toMatchObject({
          output: { name: 'object' },
        });
      }
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual([{ type: 'text', text: reply }]);
        expect(result.value.stopReason).toBe('end_turn');
        expect(result.value.model).toBe(MODEL);
        expect(result.value.usage).toEqual({ inputTokens: 42, outputTokens: 17, totalTokens: 59 });
      }
      expect(gateway.chatRequests()).toHaveLength(1);
      expect(gateway.chatRequests()[0]?.body).toMatchObject({
        model: MODEL,
        messages: [{ role: 'system', content: REQUEST.systemPrompt }, ...REQUEST.messages],
      });
    }
  );

  it('preserves system-role messages when streaming', async () => {
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'responses');
    gateway.setScript(() => ({ kind: 'text', content: 'Hello back' }));
    const adapter = new SdkAdapter({
      providerId: 'openai',
      modelId: MODEL,
      apiKey: FAKE_OPENAI_KEY,
    });
    const chunks = [];
    for await (const chunk of adapter.stream(REQUEST)) chunks.push(chunk);
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello back' },
      })
    );
    expect(chunks.at(-1)).toMatchObject({ type: 'message_stop' });
    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0]).toMatchObject({
      path: '/v1/responses',
      body: {
        input: [
          { role: 'system', content: REQUEST.systemPrompt },
          { role: 'system', content: REQUEST.messages[0]?.content },
          { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
        ],
      },
    });
  });
});
