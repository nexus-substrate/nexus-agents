/**
 * nexus-agents/adapters - Gemini Adapter Tests
 *
 * Tests for GeminiAdapter implementation.
 * Uses mocking to test without live API calls.
 */

/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigError, ModelCapability, ErrorCode, NexusError } from '../core/index.js';
import type { StreamChunk } from '../core/index.js';

// Create mock at module scope - must be before vi.mock (Issue #582)
// Using vi.hoisted to ensure proper hoisting with forks pool
const mocks = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();
  const mockGenerateContentStream = vi.fn();
  return { mockGenerateContent, mockGenerateContentStream };
});

// Mock the Google GenAI SDK - reference hoisted mock
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: mocks.mockGenerateContent,
      generateContentStream: mocks.mockGenerateContentStream,
    };
  },
}));

// Re-export for test access
const mockGenerateContent = mocks.mockGenerateContent;
const mockGenerateContentStream = mocks.mockGenerateContentStream;

import {
  GeminiAdapter,
  createGeminiAdapter,
  GEMINI_MODELS,
  GEMINI_MODEL_ALIASES,
  type GeminiAdapterConfig,
} from './gemini-adapter.js';

describe('GeminiAdapter', () => {
  const validConfig: GeminiAdapterConfig = {
    modelId: 'gemini-2.5-flash',
    apiKey: 'test-api-key-12345',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with valid config', () => {
      const adapter = new GeminiAdapter(validConfig);

      expect(adapter.providerId).toBe('google');
      expect(adapter.modelId).toBe(GEMINI_MODELS.FLASH_2_5);
    });

    it('should resolve model aliases', () => {
      const adapter = new GeminiAdapter({
        ...validConfig,
        modelId: 'gemini-pro',
      });

      // Short alias 'gemini-pro' now maps to latest (Gemini 2.5 Pro)
      expect(adapter.modelId).toBe(GEMINI_MODELS.PRO_2_5);
    });

    it('should use full model ID when not an alias', () => {
      const fullModelId = 'gemini-custom-model';
      const adapter = new GeminiAdapter({
        ...validConfig,
        modelId: fullModelId,
      });

      expect(adapter.modelId).toBe(fullModelId);
    });

    it('should throw ConfigError for missing API key', () => {
      expect(() => {
        new GeminiAdapter({
          modelId: 'gemini-2.5-flash',
          apiKey: '',
        });
      }).toThrow(ConfigError);
    });

    it('should throw ConfigError for whitespace-only API key', () => {
      expect(() => {
        new GeminiAdapter({
          modelId: 'gemini-2.5-flash',
          apiKey: '   ',
        });
      }).toThrow(ConfigError);
    });
  });

  describe('capabilities', () => {
    it('should have completion capability', () => {
      const adapter = new GeminiAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.COMPLETION)).toBe(true);
    });

    it('should have streaming capability', () => {
      const adapter = new GeminiAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.STREAMING)).toBe(true);
    });

    it('should have tool_use capability', () => {
      const adapter = new GeminiAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.TOOL_USE)).toBe(true);
    });

    it('should have vision capability', () => {
      const adapter = new GeminiAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.VISION)).toBe(true);
    });

    it('should have extended_thinking for 2.5 models', () => {
      const adapter = new GeminiAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(true);
    });

    it('should have extended_thinking for 2.0 models', () => {
      const adapter = new GeminiAdapter({
        ...validConfig,
        modelId: 'gemini-2.0-flash',
      });
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(true);
    });

    it('should not have extended_thinking for 1.5 models', () => {
      const adapter = new GeminiAdapter({
        ...validConfig,
        modelId: 'gemini-1.5-flash',
      });
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(false);
    });

    it('should have extended_thinking for Gemini 2.5 Pro', () => {
      const adapter = new GeminiAdapter({
        ...validConfig,
        modelId: 'gemini-2.5-pro',
      });
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(true);
    });

    it('should have extended_thinking for Gemini 2.5 Flash', () => {
      const adapter = new GeminiAdapter({
        ...validConfig,
        modelId: 'gemini-2.5-flash',
      });
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should return ok for valid config', () => {
      const adapter = new GeminiAdapter(validConfig);
      const result = adapter.validateConfig();

      expect(result.ok).toBe(true);
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens based on character count', async () => {
      const adapter = new GeminiAdapter(validConfig);

      // Gemini uses ~4 chars per token
      const text = 'Hello, world!'; // 13 chars
      const tokens = await adapter.countTokens(text);

      // Math.ceil(13 / 4) = 4
      expect(tokens).toBe(4);
    });

    it('should handle empty string', async () => {
      const adapter = new GeminiAdapter(validConfig);
      const tokens = await adapter.countTokens('');

      expect(tokens).toBe(0);
    });

    it('should handle long text', async () => {
      const adapter = new GeminiAdapter(validConfig);
      const text = 'a'.repeat(1000);
      const tokens = await adapter.countTokens(text);

      // Math.ceil(1000 / 4) = 250
      expect(tokens).toBe(250);
    });
  });

  describe('complete', () => {
    it('should call Google AI API with correct parameters', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Hello!',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        maxTokens: 1024,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toHaveLength(1);
        expect(result.value.content[0]).toEqual({ type: 'text', text: 'Hello!' });
        expect(result.value.usage?.inputTokens).toBe(10);
        expect(result.value.usage?.outputTokens).toBe(5);
        expect(result.value.usage?.totalTokens).toBe(15);
        expect(result.value.stopReason).toBe('end_turn');
      }
    });

    it('should include system prompt when provided', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Response',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        systemPrompt: 'You are a helpful assistant.',
        maxTokens: 1024,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction: 'You are a helpful assistant.',
          }),
        })
      );
    });

    it('should include temperature when provided', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Response',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        temperature: 0.7,
        maxTokens: 1024,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0.7,
          }),
        })
      );
    });

    it('should include stop sequences when provided', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Response',
        candidates: [{ finishReason: 'STOP_SEQUENCE' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        stop: ['STOP', 'END'],
        maxTokens: 1024,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            stopSequences: ['STOP', 'END'],
          }),
        })
      );
    });

    it('should include tools when provided', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '',
        functionCalls: [{ name: 'get_weather', args: { location: 'NYC' } }],
        candidates: [{ finishReason: 'TOOL_CODE' }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 },
      });

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'What is the weather in NYC?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a location',
            inputSchema: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
          },
        ],
        maxTokens: 1024,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stopReason).toBe('tool_use');
        expect(result.value.content[0]).toMatchObject({
          type: 'tool_use',
          name: 'get_weather',
          input: { location: 'NYC' },
        });
      }
    });

    it('should set responseMimeType and responseSchema for json_schema (#3433)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '{"answer":42}',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const schema = {
        type: 'object',
        properties: { answer: { type: 'number' } },
        required: ['answer'],
      };
      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Give me the answer' }],
        responseFormat: { type: 'json_schema', schema },
        maxTokens: 1024,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            responseMimeType: 'application/json',
            responseSchema: schema,
          }),
        })
      );
    });

    it('should set only responseMimeType for json_object (#3433)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '{"ok":true}',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Respond in JSON' }],
        responseFormat: { type: 'json_object' },
        maxTokens: 1024,
      });

      const callArg = mockGenerateContent.mock.calls[0]?.[0] as {
        config?: { responseMimeType?: string; responseSchema?: unknown };
      };
      expect(callArg.config?.responseMimeType).toBe('application/json');
      expect(callArg.config?.responseSchema).toBeUndefined();
    });

    it('should not emit a warning when responseFormat is structured (#3433)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '{"ok":true}',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      const warnSpy = vi.spyOn(
        (adapter as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger,
        'warn'
      );
      await adapter.complete({
        messages: [{ role: 'user', content: 'Respond in JSON' }],
        responseFormat: { type: 'json_object' },
        maxTokens: 1024,
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not set response format fields when responseFormat is text/absent (#3433)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'plain',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        responseFormat: { type: 'text' },
        maxTokens: 1024,
      });

      const callArg = mockGenerateContent.mock.calls[0]?.[0] as {
        config?: { responseMimeType?: string; responseSchema?: unknown };
      };
      expect(callArg.config?.responseMimeType).toBeUndefined();
      expect(callArg.config?.responseSchema).toBeUndefined();
    });

    it('should return error for API failures', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        maxTokens: 1024,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('rate limit');
      }
    });

    it('should use default max_tokens when not specified', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Response',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            maxOutputTokens: 8192,
          }),
        })
      );
    });

    it('should set MODEL_RATE_LIMITED error code for rate limit errors', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        status: 429,
      });
      mockGenerateContent.mockRejectedValueOnce(rateLimitError);

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
      }
    });

    it('should set MODEL_TIMEOUT error code for timeout errors', async () => {
      const timeoutError = Object.assign(new Error('Request timed out'), {
        code: 'ETIMEDOUT',
      });
      mockGenerateContent.mockRejectedValueOnce(timeoutError);

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_TIMEOUT);
      }
    });

    it('should set MODEL_UNAVAILABLE error code for 503 status', async () => {
      const unavailableError = Object.assign(new Error('Service unavailable'), {
        status: 503,
      });
      mockGenerateContent.mockRejectedValueOnce(unavailableError);

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_UNAVAILABLE);
      }
    });
  });

  describe('stream', () => {
    it('should yield stream chunks', async () => {
      // Create an async generator that simulates streaming
      async function* mockStreamGenerator() {
        yield { text: 'Hello' };
        yield { text: ' world' };
        yield { text: '!' };
      }

      mockGenerateContentStream.mockResolvedValueOnce(mockStreamGenerator());

      const adapter = new GeminiAdapter(validConfig);
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toEqual({
        type: 'message_start',
        message: { model: GEMINI_MODELS.FLASH_2_5 },
      });
    });

    it('should map content_block_start events correctly', async () => {
      async function* mockStreamGenerator() {
        yield { text: 'Initial' };
      }

      mockGenerateContentStream.mockResolvedValueOnce(mockStreamGenerator());

      const adapter = new GeminiAdapter(validConfig);
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toContainEqual({
        type: 'content_block_start',
        index: 0,
        contentBlock: { type: 'text', text: '' },
      });
    });

    it('should map content_block_delta events correctly', async () => {
      async function* mockStreamGenerator() {
        yield { text: 'world' };
      }

      mockGenerateContentStream.mockResolvedValueOnce(mockStreamGenerator());

      const adapter = new GeminiAdapter(validConfig);
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toContainEqual({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'world' },
      });
    });

    it('should handle stream errors gracefully', async () => {
      async function* mockStreamGenerator() {
        yield { text: 'Start' };
        throw new Error('Stream error');
      }

      mockGenerateContentStream.mockResolvedValueOnce(mockStreamGenerator());

      const adapter = new GeminiAdapter(validConfig);

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of adapter.stream({
          messages: [{ role: 'user', content: 'Hi!' }],
        })) {
          // Consume stream
        }
      }).rejects.toThrow();
    });
  });

  describe('message mapping', () => {
    it('should map string content messages', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Response',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
        maxTokens: 1024,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            { role: 'user', parts: [{ text: 'Hello' }] },
            { role: 'model', parts: [{ text: 'Hi there!' }] },
            { role: 'user', parts: [{ text: 'How are you?' }] },
          ],
        })
      );
    });

    it('should extract system message from messages array', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Response',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      await adapter.complete({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        maxTokens: 1024,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction: 'You are helpful.',
          }),
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        })
      );
    });
  });

  describe('stop reason mapping', () => {
    it.each([
      ['STOP', 'end_turn'],
      ['MAX_TOKENS', 'max_tokens'],
      ['STOP_SEQUENCE', 'stop_sequence'],
      ['TOOL_CODE', 'tool_use'],
      ['MALFORMED_FUNCTION_CALL', 'tool_use'],
      [undefined, 'end_turn'],
      ['UNKNOWN', 'end_turn'],
    ])('should map "%s" to "%s"', async (geminiReason, expectedReason) => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Response',
        candidates: [{ finishReason: geminiReason }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        maxTokens: 1024,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stopReason).toBe(expectedReason);
      }
    });
  });

  describe('error handling', () => {
    it('should preserve error context without exposing API key', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Invalid API key'));

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(NexusError);
        expect(result.error.context).not.toHaveProperty('apiKey');
        expect(result.error.context?.['providerId']).toBe('google');
        expect(result.error.context?.['modelId']).toBe(GEMINI_MODELS.FLASH_2_5);
      }
    });

    it('should detect rate limit errors from message content', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Too many requests'));

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
      }
    });

    it('should detect overloaded errors', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Server overloaded, please retry'));

      const adapter = new GeminiAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_UNAVAILABLE);
      }
    });
  });
});

describe('createGeminiAdapter', () => {
  it('should create adapter instance', () => {
    const adapter = createGeminiAdapter({
      modelId: 'gemini-2.5-flash',
      apiKey: 'test-key',
    });

    expect(adapter).toBeInstanceOf(GeminiAdapter);
    expect(adapter.providerId).toBe('google');
  });

  it('should pass configuration correctly', () => {
    const adapter = createGeminiAdapter({
      modelId: 'gemini-1.5-pro',
      apiKey: 'test-key',
      timeout: 60000,
    });

    expect(adapter.modelId).toBe(GEMINI_MODELS.PRO_1_5);
  });
});

describe('GEMINI_MODELS', () => {
  it('should have correct Gemini 2.5 model identifiers', () => {
    expect(GEMINI_MODELS.PRO_2_5).toBe('gemini-2.5-pro');
    expect(GEMINI_MODELS.FLASH_2_5).toBe('gemini-2.5-flash');
  });

  it('should have correct Gemini 2.x model identifiers', () => {
    expect(GEMINI_MODELS.FLASH_2_5).toBe('gemini-2.5-flash');
    expect(GEMINI_MODELS.FLASH_2_0).toBe('gemini-2.0-flash');
  });

  it('should have correct Gemini 1.5 model identifiers', () => {
    expect(GEMINI_MODELS.PRO_1_5).toBe('gemini-1.5-pro');
    expect(GEMINI_MODELS.FLASH_1_5).toBe('gemini-1.5-flash');
  });
});

describe('GEMINI_MODEL_ALIASES', () => {
  // After #2200 Child 2, only legacy 1.5 / 2.0 aliases live in this map.
  // 2.5+ and short aliases resolve via the canonical registry.
  it('contains only Gemini 1.5 / 2.0 legacy entries (registry covers current)', () => {
    expect(Object.keys(GEMINI_MODEL_ALIASES).sort()).toEqual([
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash',
    ]);
  });

  it('legacy 1.5 / 2.0 entries pass through unchanged', () => {
    expect(GEMINI_MODEL_ALIASES['gemini-1.5-pro']).toBe(GEMINI_MODELS.PRO_1_5);
    expect(GEMINI_MODEL_ALIASES['gemini-1.5-flash']).toBe(GEMINI_MODELS.FLASH_1_5);
    expect(GEMINI_MODEL_ALIASES['gemini-2.0-flash']).toBe(GEMINI_MODELS.FLASH_2_0);
  });
});
