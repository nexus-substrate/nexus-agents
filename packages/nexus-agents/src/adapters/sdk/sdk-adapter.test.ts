/**
 * Tests for AI SDK adapter.
 * Tests use mocked AI SDK modules — no API keys needed.
 * (Source: Issue #1123)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SdkAdapter, extractAiSdkFunctions } from './sdk-adapter.js';
import type { CompletionRequest, ModelError } from '../../core/index.js';
import { ErrorCode } from '../../core/index.js';
import { createModelToCliAdapter } from '../../cli-adapters/model-to-cli-adapter.js';
import { assessCapacity } from '../../cli-adapters/routing/stages/capacity-stage.js';
// Mock the AI SDK modules. The full `ai` mock stays installed for the whole
// suite — the "missing export" cases (#3433) are unit-tested directly against
// `extractAiSdkFunctions` (#3449) rather than swapping the global mock, so no
// test mutates the module registry.
const fullAiMock = (): Record<string, unknown> => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  generateObject: vi.fn(),
  // jsonSchema wraps a raw JSON schema; the real helper returns a Schema
  // object. The adapter only forwards it to generateObject, so a passthrough
  // that records the input is sufficient for assertions.
  jsonSchema: vi.fn((schema: unknown) => ({ jsonSchema: schema })),
});
vi.mock('ai', () => fullAiMock());

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId })),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId })),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ modelId })),
}));

// DNS-resolve-time SSRF guard (#3426): mock node:dns/promises so the
// custom-openai resolve check is deterministic and never hits a real resolver.
const dnsLookupMock = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

const TEST_REQUEST: CompletionRequest = {
  messages: [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Hello, world!' }],
    },
  ],
  temperature: 0.7,
  maxTokens: 100,
};

describe('SdkAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates adapter with provided config', () => {
      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });
      expect(adapter.providerId).toBe('sdk-anthropic');
      expect(adapter.modelId).toBe('claude-sonnet-4-6');
    });

    it('creates adapter for openai provider', () => {
      const adapter = new SdkAdapter({
        providerId: 'openai',
        modelId: 'gpt-4o',
        apiKey: 'test-key',
      });
      expect(adapter.providerId).toBe('sdk-openai');
    });

    it('creates adapter for google provider', () => {
      const adapter = new SdkAdapter({
        providerId: 'google',
        modelId: 'gemini-2.5-pro',
        apiKey: 'test-key',
      });
      expect(adapter.providerId).toBe('sdk-google');
    });
  });

  describe('complete', () => {
    it('calls generateText and maps response', async () => {
      const { generateText } = await import('ai');
      const mockGenerate = vi.mocked(generateText);
      mockGenerate.mockResolvedValueOnce({
        text: 'Hello back!',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5 },
        response: { id: 'resp-1', timestamp: new Date(), modelId: 'claude-sonnet-4-6' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content[0]).toEqual({ type: 'text', text: 'Hello back!' });
        expect(result.value.usage).toEqual({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        });
        expect(result.value.stopReason).toBe('end_turn');
        expect(result.value.model).toBe('claude-sonnet-4-6');
      }
    });

    it('uses the SDK total when component token counters are absent', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'counted',
        finishReason: 'stop',
        usage: { totalTokens: 20 },
        response: { id: 'resp-total', timestamp: new Date(), modelId: 'gpt-4o' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'openai',
        modelId: 'gpt-4o',
        apiKey: 'test-key',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage?.totalTokens).toBe(20);
      }
    });

    it.each([{}, { inputTokens: 10 }, { outputTokens: 5 }])(
      'omits usage when the SDK counters cannot establish a total: %o',
      async (usage) => {
        const { generateText } = await import('ai');
        vi.mocked(generateText).mockResolvedValueOnce({
          text: 'uncounted',
          finishReason: 'stop',
          usage,
          response: { id: 'resp-unmeasured', timestamp: new Date(), modelId: 'gpt-4o' },
        } as unknown as Awaited<ReturnType<typeof generateText>>);

        const adapter = new SdkAdapter({
          providerId: 'openai',
          modelId: 'gpt-4o',
          apiKey: 'test-key',
        });

        const result = await adapter.complete(TEST_REQUEST);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.usage).toBeUndefined();
        }
      }
    );

    it('DROPS temperature for a reasoning model routed via the AI-SDK (#4062 drift guard)', async () => {
      // auto-adapter wires the openai/codex provider through SdkAdapter to models
      // like o3-mini / gpt-5.4 that reject a custom temperature. Guard against a
      // future refactor un-wiring the temperatureUnsupportedForModel check here.
      const { generateText } = await import('ai');
      const mockGenerate = vi.mocked(generateText);
      mockGenerate.mockResolvedValueOnce({
        text: 'ok',
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 2 },
        response: { id: 'r', timestamp: new Date(), modelId: 'o3-mini' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({ providerId: 'openai', modelId: 'o3-mini', apiKey: 'k' });
      await adapter.complete(TEST_REQUEST); // TEST_REQUEST carries temperature: 0.7

      const options = mockGenerate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(options).not.toHaveProperty('temperature');
    });

    it('passes temperature through for a supported model routed via the AI-SDK', async () => {
      const { generateText } = await import('ai');
      const mockGenerate = vi.mocked(generateText);
      mockGenerate.mockResolvedValueOnce({
        text: 'ok',
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 2 },
        response: { id: 'r', timestamp: new Date(), modelId: 'gpt-4o' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({ providerId: 'openai', modelId: 'gpt-4o', apiKey: 'k' });
      await adapter.complete(TEST_REQUEST);

      const options = mockGenerate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(options['temperature']).toBe(0.7);
    });

    it('returns error result on API failure', async () => {
      const { generateText } = await import('ai');
      const mockGenerate = vi.mocked(generateText);
      mockGenerate.mockRejectedValueOnce(new Error('Rate limit exceeded (429)'));

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Rate limit exceeded');
      }
    });

    it('returns config error when no API key', async () => {
      const originalKey = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];
      try {
        const adapter = new SdkAdapter({
          providerId: 'anthropic',
          modelId: 'claude-sonnet-4-6',
        });
        const result = await adapter.complete(TEST_REQUEST);
        expect(result.ok).toBe(false);
      } finally {
        if (originalKey !== undefined) {
          process.env['ANTHROPIC_API_KEY'] = originalKey;
        }
      }
    });

    it('maps tool_use finish reason', async () => {
      const { generateText } = await import('ai');
      const mockGenerate = vi.mocked(generateText);
      mockGenerate.mockResolvedValueOnce({
        text: '',
        finishReason: 'tool-calls',
        usage: { inputTokens: 10, outputTokens: 5 },
        response: { id: 'resp-1', timestamp: new Date(), modelId: 'claude-sonnet-4-6' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stopReason).toBe('tool_use');
      }
    });

    it('maps max_tokens finish reason', async () => {
      const { generateText } = await import('ai');
      const mockGenerate = vi.mocked(generateText);
      mockGenerate.mockResolvedValueOnce({
        text: 'truncated...',
        finishReason: 'length',
        usage: { inputTokens: 10, outputTokens: 100 },
        response: { id: 'resp-1', timestamp: new Date(), modelId: 'claude-sonnet-4-6' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stopReason).toBe('max_tokens');
      }
    });

    it('routes json_schema to generateObject and returns stringified object (#3433)', async () => {
      const { generateObject, jsonSchema, generateText } = await import('ai');
      const mockObject = vi.mocked(generateObject);
      const mockJsonSchema = vi.mocked(jsonSchema);
      const mockText = vi.mocked(generateText);
      mockObject.mockResolvedValueOnce({
        object: { answer: 42 },
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5 },
        response: { id: 'resp-1', timestamp: new Date(), modelId: 'claude-sonnet-4-6' },
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

      const schema = { type: 'object', properties: { answer: { type: 'number' } } };
      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete({
        ...TEST_REQUEST,
        responseFormat: { type: 'json_schema', schema },
      });

      expect(mockObject).toHaveBeenCalledTimes(1);
      expect(mockText).not.toHaveBeenCalled();
      expect(mockJsonSchema).toHaveBeenCalledWith(schema);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content[0]).toEqual({
          type: 'text',
          text: JSON.stringify({ answer: 42 }),
        });
        expect(result.value.usage).toEqual({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        });
        expect(result.value.stopReason).toBe('end_turn');
        expect(result.value.model).toBe('claude-sonnet-4-6');
      }
    });

    it('routes json_object to generateObject with a permissive schema (#3433)', async () => {
      const { generateObject, jsonSchema } = await import('ai');
      const mockObject = vi.mocked(generateObject);
      const mockJsonSchema = vi.mocked(jsonSchema);
      mockObject.mockResolvedValueOnce({
        object: { foo: 'bar' },
        finishReason: 'stop',
        usage: { inputTokens: 3, outputTokens: 2 },
        response: { id: 'resp-1', timestamp: new Date(), modelId: 'claude-sonnet-4-6' },
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete({
        ...TEST_REQUEST,
        responseFormat: { type: 'json_object' },
      });

      expect(mockObject).toHaveBeenCalledTimes(1);
      expect(mockJsonSchema).toHaveBeenCalledWith({ type: 'object' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content[0]).toEqual({
          type: 'text',
          text: JSON.stringify({ foo: 'bar' }),
        });
      }
    });

    it('routes text responseFormat to generateText (regression #3433)', async () => {
      const { generateText, generateObject } = await import('ai');
      const mockText = vi.mocked(generateText);
      const mockObject = vi.mocked(generateObject);
      mockText.mockResolvedValueOnce({
        text: 'plain text',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5 },
        response: { id: 'resp-1', timestamp: new Date(), modelId: 'claude-sonnet-4-6' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete({
        ...TEST_REQUEST,
        responseFormat: { type: 'text' },
      });

      expect(mockText).toHaveBeenCalledTimes(1);
      expect(mockObject).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content[0]).toEqual({ type: 'text', text: 'plain text' });
      }
    });

    // #3449: the "missing export" cases are unit-tested directly against
    // `extractAiSdkFunctions` with hand-built partial module objects — NOT via
    // `vi.doMock('ai')` + `vi.resetModules()`, whose module-registry mutation
    // leaked across the parallel suite and intermittently red-barred CI.
    it.each([
      ['generateText', { streamText: vi.fn(), generateObject: vi.fn(), jsonSchema: vi.fn() }],
      ['streamText', { generateText: vi.fn(), generateObject: vi.fn(), jsonSchema: vi.fn() }],
      ['generateObject', { generateText: vi.fn(), streamText: vi.fn(), jsonSchema: vi.fn() }],
      ['jsonSchema', { generateText: vi.fn(), streamText: vi.fn(), generateObject: vi.fn() }],
    ])('throws a clear error when the %s export is missing (#3433/#3449)', (missing, partial) => {
      expect(() => extractAiSdkFunctions(partial as Record<string, unknown>)).toThrow(
        new RegExp(`missing expected export: '${missing}'`)
      );
    });

    it('returns the four functions when the module is complete', () => {
      const mod = {
        generateText: vi.fn(),
        streamText: vi.fn(),
        generateObject: vi.fn(),
        jsonSchema: vi.fn(),
      };
      const fns = extractAiSdkFunctions(mod);
      expect(fns.generateText).toBe(mod.generateText);
      expect(fns.jsonSchema).toBe(mod.jsonSchema);
    });
  });

  describe('stream', () => {
    it('yields stream chunks from textStream', async () => {
      const { streamText } = await import('ai');
      const mockStream = vi.mocked(streamText);

      const textChunks = ['Hello', ' world', '!'];
      const readable = new ReadableStream<string>({
        start(controller) {
          for (const chunk of textChunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      function* fakeTextIterGen(): Generator<string> {
        yield 'Hello';
        yield ' world';
        yield '!';
      }
      const iter = fakeTextIterGen();
      const textStream = Object.assign(readable, {
        [Symbol.asyncIterator]: () => ({
          next: () => {
            const r = iter.next();
            return Promise.resolve(r);
          },
        }),
      });

      mockStream.mockReturnValueOnce({
        textStream,
      } as unknown as ReturnType<typeof streamText>);

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const chunks: unknown[] = [];
      for await (const chunk of adapter.stream(TEST_REQUEST)) {
        chunks.push(chunk);
      }

      // Expected: message_start, content_block_start, 3 deltas, content_block_stop, message_delta, message_stop
      expect(chunks).toHaveLength(8);
      expect(chunks[0]).toEqual({
        type: 'message_start',
        message: { model: 'claude-sonnet-4-6' },
      });
      expect(chunks[2]).toEqual({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      });
      expect(chunks[7]).toEqual({ type: 'message_stop' });
      // #4835: this path reports no usage, so it emits none. It used to emit
      // `{inputTokens: 0, outputTokens: 0, totalTokens: 0}`, which is
      // byte-identical to a stream that genuinely consumed nothing — a
      // consumer billing on it priced the whole call at zero.
      expect(chunks[6]).toEqual({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
      });
    });

    it('skips empty-string deltas (#3317 #8)', async () => {
      const { streamText } = await import('ai');
      const mockStream = vi.mocked(streamText);

      // The SDK can emit zero-length chunks (keepalives/segment boundaries).
      function* fakeTextIterGen(): Generator<string> {
        yield 'Hello';
        yield '';
        yield ' world';
        yield '';
      }
      const iter = fakeTextIterGen();
      const textStream = Object.assign(new ReadableStream<string>(), {
        [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve(iter.next()) }),
      });
      mockStream.mockReturnValueOnce({ textStream } as unknown as ReturnType<typeof streamText>);

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const deltas: string[] = [];
      for await (const chunk of adapter.stream(TEST_REQUEST)) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          deltas.push(chunk.delta.text);
        }
      }

      // Only the two non-empty chunks survive; no empty text_delta is emitted.
      expect(deltas).toEqual(['Hello', ' world']);
    });
  });

  describe('validateConfig', () => {
    it('passes with valid config', () => {
      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });
      const result = adapter.validateConfig();
      expect(result.ok).toBe(true);
    });
  });

  describe('custom-openai DNS-resolve-time SSRF guard (#3426)', () => {
    beforeEach(() => {
      dnsLookupMock.mockReset();
    });

    it('rejects when the gateway hostname resolves to a private IP', async () => {
      dnsLookupMock.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
      const adapter = new SdkAdapter({
        providerId: 'custom-openai',
        modelId: 'gpt-4o',
        apiKey: 'test-key',
        baseUrl: 'https://gateway.evil.test/v1',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/SSRF/i);
      expect(dnsLookupMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT cache a rejection — a retry re-runs the guard (#3426 QA)', async () => {
      // First resolution is private (rejected); the flag must stay unset so a
      // retry re-checks instead of silently skipping the guard.
      dnsLookupMock.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'ok',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1 },
        response: { id: 'r', timestamp: new Date(), modelId: 'gpt-4o' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'custom-openai',
        modelId: 'gpt-4o',
        apiKey: 'test-key',
        baseUrl: 'https://gateway.flaky.test/v1',
      });

      const rejected = await adapter.complete(TEST_REQUEST);
      expect(rejected.ok).toBe(false);

      // Retry: now resolves public → re-checked (lookup called again) and passes.
      dnsLookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
      const retried = await adapter.complete(TEST_REQUEST);
      expect(retried.ok).toBe(true);
      expect(dnsLookupMock).toHaveBeenCalledTimes(2);
    });

    it('allows a gateway hostname that resolves to a public IP', async () => {
      dnsLookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'ok',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1 },
        response: { id: 'r', timestamp: new Date(), modelId: 'gpt-4o' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'custom-openai',
        modelId: 'gpt-4o',
        apiKey: 'test-key',
        baseUrl: 'https://gateway.example.com/v1',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(true);
    });

    it('resolves once and caches across multiple requests', async () => {
      dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValue({
        text: 'ok',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1 },
        response: { id: 'r', timestamp: new Date(), modelId: 'gpt-4o' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'custom-openai',
        modelId: 'gpt-4o',
        apiKey: 'test-key',
        baseUrl: 'https://gateway.example.com/v1',
      });

      await adapter.complete(TEST_REQUEST);
      await adapter.complete(TEST_REQUEST);
      // Cached: hostname resolved exactly once despite two requests.
      expect(dnsLookupMock).toHaveBeenCalledTimes(1);
    });

    it('never resolves for non-custom providers', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'ok',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1 },
        response: { id: 'r', timestamp: new Date(), modelId: 'claude-sonnet-4-6' },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const adapter = new SdkAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      await adapter.complete(TEST_REQUEST);
      expect(dnsLookupMock).not.toHaveBeenCalled();
    });
  });
});

/**
 * Retry-horizon capture on the AI-SDK arm (#4606).
 *
 * `toErrorResult` builds its `ModelError` directly instead of going through
 * `BaseAdapter.transformError`, so it needed the capture wired separately or
 * this whole arm would keep reporting `unmeasured` on a 429 that named its own
 * horizon. The Vercel AI SDK exposes it as `APICallError.responseHeaders` — a
 * plain record, not a `Headers` instance.
 */
describe('SdkAdapter retry-after capture (#4606)', () => {
  /** Longer than the CapacityTracker's 60s window: quota, not throttle. */
  const DURABLE_MS = 3_600_000;

  async function failWith(error: unknown): Promise<ModelError | undefined> {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValueOnce(error);
    const adapter = new SdkAdapter({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      apiKey: 'test-key',
    });
    const result = await adapter.complete(TEST_REQUEST);
    expect(result.ok).toBe(false);
    return result.ok ? undefined : result.error;
  }

  it('captures Retry-After from the SDK error responseHeaders record', async () => {
    const error = await failWith(
      Object.assign(new Error('rate limit exceeded'), {
        statusCode: 429,
        responseHeaders: { 'content-type': 'application/json', 'retry-after': '3600' },
      })
    );

    expect(error?.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
    expect(error?.context?.['retryAfterMs']).toBe(DURABLE_MS);
  });

  it('leaves the horizon ABSENT — never 0 — when the 429 states none anywhere', async () => {
    const error = await failWith(
      Object.assign(new Error('429 too many requests'), { statusCode: 429 })
    );

    expect(error?.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
    expect(error?.context?.['retryAfterMs']).toBeUndefined();
  });

  it('never parks anything but the horizon from the header bag', async () => {
    const error = await failWith(
      Object.assign(new Error('rate limit exceeded'), {
        statusCode: 429,
        responseHeaders: {
          authorization: 'Bearer sk-test-not-a-real-key',
          'retry-after': '3600',
        },
      })
    );

    expect(error?.context).toEqual({ retryAfterMs: DURABLE_MS });
  });

  it('does not capture a horizon off a non-rate-limit failure', async () => {
    // A wait hint inside a 500 body is not a rate-limit assertion.
    const error = await failWith(
      Object.assign(new Error('upstream 500'), {
        statusCode: 500,
        responseHeaders: { 'retry-after': '3600' },
      })
    );

    expect(error?.code).not.toBe(ErrorCode.MODEL_RATE_LIMITED);
    expect(error?.context?.['retryAfterMs']).toBeUndefined();
  });

  it('reaches exhausted through the bridge, and stays unmeasured without a horizon', async () => {
    const { generateText } = await import('ai');
    const makeAdapter = (): SdkAdapter =>
      new SdkAdapter({ providerId: 'anthropic', modelId: 'claude-sonnet-4-6', apiKey: 'test-key' });

    vi.mocked(generateText).mockRejectedValueOnce(
      Object.assign(new Error('rate limit exceeded'), {
        statusCode: 429,
        responseHeaders: { 'retry-after': '3600' },
      })
    );
    const stated = createModelToCliAdapter(makeAdapter(), { name: 'claude' });
    await stated.execute({ content: 'hi' });
    const statedCapacity = await stated.getCapacity();
    expect(statedCapacity.quotaExhausted).toBe(true);
    expect(assessCapacity(statedCapacity)).toBe('exhausted');

    vi.mocked(generateText).mockRejectedValueOnce(new Error('429 too many requests'));
    const silent = createModelToCliAdapter(makeAdapter(), { name: 'claude' });
    await silent.execute({ content: 'hi' });
    const silentCapacity = await silent.getCapacity();
    expect(silentCapacity.quotaExhausted).toBe(false);
    expect(assessCapacity(silentCapacity)).toBe('unmeasured');
  });
});
