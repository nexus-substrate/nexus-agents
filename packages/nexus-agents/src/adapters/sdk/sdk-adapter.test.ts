/**
 * Tests for AI SDK adapter.
 * Tests use mocked AI SDK modules — no API keys needed.
 * (Source: Issue #1123)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SdkAdapter } from './sdk-adapter.js';
import type { CompletionRequest } from '../../core/index.js';
// Mock the AI SDK modules
// Full `ai` mock factory. The "missing export" tests (#3433) swap in a
// partial module via vi.doMock + vi.resetModules; restoreAiMock() puts the
// complete module back so later tests (stream, etc.) keep their mocks.
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

function restoreAiMock(): void {
  vi.doMock('ai', () => fullAiMock());
  vi.resetModules();
}

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
        expect(result.value.usage.inputTokens).toBe(10);
        expect(result.value.usage.outputTokens).toBe(5);
        expect(result.value.stopReason).toBe('end_turn');
        expect(result.value.model).toBe('claude-sonnet-4-6');
      }
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
        expect(result.value.usage.inputTokens).toBe(10);
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

    it('throws a clear error when generateObject export is missing (#3433)', async () => {
      vi.resetModules();
      vi.doMock('ai', () => ({
        generateText: vi.fn(),
        streamText: vi.fn(),
        jsonSchema: vi.fn((schema: unknown) => ({ jsonSchema: schema })),
        // generateObject intentionally missing
      }));
      const { SdkAdapter: FreshAdapter } = await import('./sdk-adapter.js');

      const adapter = new FreshAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('generateObject');
      }
      restoreAiMock();
    });

    it('throws a clear error when jsonSchema export is missing (#3433)', async () => {
      vi.resetModules();
      vi.doMock('ai', () => ({
        generateText: vi.fn(),
        streamText: vi.fn(),
        generateObject: vi.fn(),
        // jsonSchema intentionally missing
      }));
      const { SdkAdapter: FreshAdapter } = await import('./sdk-adapter.js');

      const adapter = new FreshAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKey: 'test-key',
      });

      const result = await adapter.complete(TEST_REQUEST);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('jsonSchema');
      }
      restoreAiMock();
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
