/**
 * Tests for AI SDK adapter.
 * Tests use mocked AI SDK modules — no API keys needed.
 * (Source: Issue #1123)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SdkAdapter } from './sdk-adapter.js';
import type { CompletionRequest } from '../../core/index.js';
// Mock the AI SDK modules
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId })),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId })),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ modelId })),
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
});
