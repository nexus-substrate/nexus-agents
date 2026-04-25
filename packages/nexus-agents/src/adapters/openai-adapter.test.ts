/**
 * nexus-agents/adapters - OpenAI Adapter Tests
 *
 * Tests for OpenAIAdapter implementation.
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
  const mockCreate = vi.fn();
  return { mockCreate };
});

// Mock the OpenAI SDK - reference hoisted mock
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mocks.mockCreate,
      },
    };
  },
}));

// Re-export for test access
const mockCreate = mocks.mockCreate;

import {
  OpenAIAdapter,
  createOpenAIAdapter,
  OPENAI_MODELS,
  OPENAI_MODEL_ALIASES,
  type OpenAIAdapterConfig,
} from './openai-adapter.js';

describe('OpenAIAdapter', () => {
  const validConfig: OpenAIAdapterConfig = {
    modelId: 'gpt-4o',
    apiKey: 'test-api-key-12345',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with valid config', () => {
      const adapter = new OpenAIAdapter(validConfig);

      expect(adapter.providerId).toBe('openai');
      expect(adapter.modelId).toBe(OPENAI_MODELS.GPT_4O);
    });

    it('should resolve model aliases', () => {
      const adapter = new OpenAIAdapter({
        ...validConfig,
        modelId: 'gpt-4-turbo',
      });

      expect(adapter.modelId).toBe(OPENAI_MODELS.GPT_4_TURBO);
    });

    it('should use full model ID when not an alias', () => {
      const fullModelId = 'gpt-4o-2024-11-20';
      const adapter = new OpenAIAdapter({
        ...validConfig,
        modelId: fullModelId,
      });

      expect(adapter.modelId).toBe(fullModelId);
    });

    it('should throw ConfigError for missing API key', () => {
      expect(() => {
        new OpenAIAdapter({
          modelId: 'gpt-4o',
          apiKey: '',
        });
      }).toThrow(ConfigError);
    });

    it('should throw ConfigError for whitespace-only API key', () => {
      expect(() => {
        new OpenAIAdapter({
          modelId: 'gpt-4o',
          apiKey: '   ',
        });
      }).toThrow(ConfigError);
    });
  });

  describe('capabilities', () => {
    it('should have completion capability', () => {
      const adapter = new OpenAIAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.COMPLETION)).toBe(true);
    });

    it('should have streaming capability', () => {
      const adapter = new OpenAIAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.STREAMING)).toBe(true);
    });

    it('should have tool_use capability', () => {
      const adapter = new OpenAIAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.TOOL_USE)).toBe(true);
    });

    it('should have vision capability for GPT-4o', () => {
      const adapter = new OpenAIAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.VISION)).toBe(true);
    });

    it('should have vision capability for GPT-4-turbo', () => {
      const adapter = new OpenAIAdapter({
        ...validConfig,
        modelId: 'gpt-4-turbo',
      });
      expect(adapter.hasCapability(ModelCapability.VISION)).toBe(true);
    });

    it('should not have vision capability for GPT-3.5-turbo', () => {
      const adapter = new OpenAIAdapter({
        ...validConfig,
        modelId: 'gpt-3.5-turbo',
      });
      expect(adapter.hasCapability(ModelCapability.VISION)).toBe(false);
    });

    it('should not have extended_thinking capability for GPT-4o', () => {
      const adapter = new OpenAIAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(false);
    });

    it('should have extended_thinking capability for GPT-5.2', () => {
      const adapter = new OpenAIAdapter({
        ...validConfig,
        modelId: 'gpt-5.2',
      });
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(true);
    });

    it('should have extended_thinking capability for GPT-5.2-pro', () => {
      const adapter = new OpenAIAdapter({
        ...validConfig,
        modelId: 'gpt-5.2-pro',
      });
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(true);
    });

    it('should have vision capability for GPT-5.2', () => {
      const adapter = new OpenAIAdapter({
        ...validConfig,
        modelId: 'gpt-5.2',
      });
      expect(adapter.hasCapability(ModelCapability.VISION)).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should return ok for valid config', () => {
      const adapter = new OpenAIAdapter(validConfig);
      const result = adapter.validateConfig();

      expect(result.ok).toBe(true);
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens based on character count', async () => {
      const adapter = new OpenAIAdapter(validConfig);

      // OpenAI uses ~4 chars per token
      const text = 'Hello, world!'; // 13 chars
      const tokens = await adapter.countTokens(text);

      // Math.ceil(13 / 4) = 4
      expect(tokens).toBe(4);
    });

    it('should handle empty string', async () => {
      const adapter = new OpenAIAdapter(validConfig);
      const tokens = await adapter.countTokens('');

      expect(tokens).toBe(0);
    });

    it('should handle long text', async () => {
      const adapter = new OpenAIAdapter(validConfig);
      const text = 'a'.repeat(1000);
      const tokens = await adapter.countTokens(text);

      // Math.ceil(1000 / 4) = 250
      expect(tokens).toBe(250);
    });
  });

  describe('complete', () => {
    it('should call OpenAI API with correct parameters', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Hello!', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        maxTokens: 1024,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toHaveLength(1);
        expect(result.value.content[0]).toEqual({ type: 'text', text: 'Hello!' });
        expect(result.value.usage.inputTokens).toBe(10);
        expect(result.value.usage.outputTokens).toBe(5);
        expect(result.value.usage.totalTokens).toBe(15);
        expect(result.value.stopReason).toBe('end_turn');
      }
    });

    it('should include system prompt when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Response', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        systemPrompt: 'You are a helpful assistant.',
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'system', content: 'You are a helpful assistant.' },
          ]),
        })
      );
    });

    it('should include temperature when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Response', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        temperature: 0.7,
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });

    it('should include stop sequences when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Response', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        stop: ['STOP', 'END'],
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stop: ['STOP', 'END'],
        })
      );
    });

    it('should include tools when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"NYC"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
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
        expect(result.value.content[0]).toEqual({
          type: 'tool_use',
          id: 'call_1',
          name: 'get_weather',
          input: { location: 'NYC' },
        });
      }
    });

    it('should return error for API failures', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const adapter = new OpenAIAdapter(validConfig);
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
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Response', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: 4096,
        })
      );
    });

    it('should set MODEL_RATE_LIMITED error code for 429 status', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        status: 429,
      });
      mockCreate.mockRejectedValueOnce(rateLimitError);

      const adapter = new OpenAIAdapter(validConfig);
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
      mockCreate.mockRejectedValueOnce(timeoutError);

      const adapter = new OpenAIAdapter(validConfig);
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
      mockCreate.mockRejectedValueOnce(unavailableError);

      const adapter = new OpenAIAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_UNAVAILABLE);
      }
    });

    it('should handle json_object response format', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: '{"key":"value"}', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Return JSON' }],
        responseFormat: { type: 'json_object' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        })
      );
    });
  });

  describe('stream', () => {
    it('should yield stream chunks', async () => {
      // Create an async generator that simulates streaming
      async function* mockStreamGenerator() {
        yield {
          choices: [{ delta: { content: 'Hello' }, index: 0 }],
          model: OPENAI_MODELS.GPT_4O,
        };
        yield {
          choices: [{ delta: { content: ' world' }, index: 0 }],
          model: OPENAI_MODELS.GPT_4O,
        };
        yield {
          choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
          model: OPENAI_MODELS.GPT_4O,
          usage: { completion_tokens: 2, total_tokens: 10 },
        };
      }

      mockCreate.mockResolvedValueOnce(mockStreamGenerator());

      const adapter = new OpenAIAdapter(validConfig);
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toEqual({
        type: 'message_start',
        message: { model: OPENAI_MODELS.GPT_4O },
      });
    });

    it('should map content_block_delta events correctly', async () => {
      async function* mockStreamGenerator() {
        yield {
          choices: [{ delta: { content: 'Hello' }, index: 0 }],
          model: OPENAI_MODELS.GPT_4O,
        };
        yield {
          choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
          model: OPENAI_MODELS.GPT_4O,
        };
      }

      mockCreate.mockResolvedValueOnce(mockStreamGenerator());

      const adapter = new OpenAIAdapter(validConfig);
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }

      const deltaChunks = chunks.filter((c) => c.type === 'content_block_delta');
      expect(deltaChunks.length).toBeGreaterThan(0);
      expect(deltaChunks[0]).toEqual({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      });
    });

    it('should handle stream errors gracefully', async () => {
      async function* mockStreamGenerator() {
        yield {
          choices: [{ delta: { content: 'Hello' }, index: 0 }],
          model: OPENAI_MODELS.GPT_4O,
        };
        throw new Error('Stream error');
      }

      mockCreate.mockResolvedValueOnce(mockStreamGenerator());

      const adapter = new OpenAIAdapter(validConfig);

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of adapter.stream({
          messages: [{ role: 'user', content: 'Hi!' }],
        })) {
          // Consume stream
        }
      }).rejects.toThrow();
    });
  });

  describe('message mapping', () => {
    it('should map string content messages', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Response', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
      await adapter.complete({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'How are you?' },
          ],
        })
      );
    });

    it('should map tool result messages correctly', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'The weather is sunny', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
      await adapter.complete({
        messages: [
          { role: 'user', content: 'What is the weather?' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_1',
                name: 'get_weather',
                input: { location: 'NYC' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'call_1',
                content: 'Sunny, 72F',
              },
            ],
          },
        ],
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'tool', tool_call_id: 'call_1' }),
          ]),
        })
      );
    });
  });

  describe('stop reason mapping', () => {
    it.each([
      ['stop', 'end_turn'],
      ['length', 'max_tokens'],
      ['tool_calls', 'tool_use'],
      ['function_call', 'tool_use'],
      ['content_filter', 'end_turn'],
      [null, 'end_turn'],
      ['unknown', 'end_turn'],
    ])('should map "%s" to "%s"', async (openaiReason, expectedReason) => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Response', role: 'assistant' },
            finish_reason: openaiReason,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: OPENAI_MODELS.GPT_4O,
      });

      const adapter = new OpenAIAdapter(validConfig);
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
      mockCreate.mockRejectedValueOnce(new Error('Invalid API key'));

      const adapter = new OpenAIAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(NexusError);
        expect(result.error.context).not.toHaveProperty('apiKey');
        expect(result.error.context?.['providerId']).toBe('openai');
        expect(result.error.context?.['modelId']).toBe(OPENAI_MODELS.GPT_4O);
      }
    });

    it('should detect rate limit errors from message content', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Too many requests'));

      const adapter = new OpenAIAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
      }
    });

    it('should detect quota exceeded errors', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Quota exceeded'));

      const adapter = new OpenAIAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
      }
    });
  });
});

describe('createOpenAIAdapter', () => {
  it('should create adapter instance', () => {
    const adapter = createOpenAIAdapter({
      modelId: 'gpt-4o',
      apiKey: 'test-key',
    });

    expect(adapter).toBeInstanceOf(OpenAIAdapter);
    expect(adapter.providerId).toBe('openai');
  });

  it('should pass configuration correctly', () => {
    const adapter = createOpenAIAdapter({
      modelId: 'gpt-4-turbo',
      apiKey: 'test-key',
      timeout: 60000,
    });

    expect(adapter.modelId).toBe(OPENAI_MODELS.GPT_4_TURBO);
  });
});

describe('OPENAI_MODELS', () => {
  it('should have correct GPT-5.2 model identifiers', () => {
    expect(OPENAI_MODELS.GPT_5_2).toBe('gpt-5.2');
    expect(OPENAI_MODELS.GPT_5_2_INSTANT).toBe('gpt-5.2-chat-latest');
    expect(OPENAI_MODELS.GPT_5_2_PRO).toBe('gpt-5.2-pro');
    expect(OPENAI_MODELS.GPT_5_2_CODEX).toBe('gpt-5.2-codex');
  });

  it('should have correct GPT-4o model identifiers', () => {
    expect(OPENAI_MODELS.GPT_4O).toBe('gpt-4o-2024-11-20');
    expect(OPENAI_MODELS.GPT_4O_MINI).toBe('gpt-4o-mini-2024-07-18');
    expect(OPENAI_MODELS.GPT_4_TURBO).toBe('gpt-4-turbo-2024-04-09');
    expect(OPENAI_MODELS.GPT_35_TURBO).toBe('gpt-3.5-turbo-0125');
  });
});

describe('OPENAI_MODEL_ALIASES', () => {
  // After #2200 Child 3, identity-only mappings were removed
  // (resolveModelId passes unknown ids through unchanged via `?? modelId`).
  // Only entries that translate a shorthand to a dated version remain.
  it('contains only shorthand → dated entries (no identity mappings)', () => {
    expect(Object.keys(OPENAI_MODEL_ALIASES).sort()).toEqual([
      'gpt-3.5-turbo',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-5.2-instant',
    ]);
  });

  it('shorthand aliases map to dated identifiers', () => {
    expect(OPENAI_MODEL_ALIASES['gpt-5.2-instant']).toBe(OPENAI_MODELS.GPT_5_2_INSTANT);
    expect(OPENAI_MODEL_ALIASES['gpt-4o']).toBe(OPENAI_MODELS.GPT_4O);
    expect(OPENAI_MODEL_ALIASES['gpt-4o-mini']).toBe(OPENAI_MODELS.GPT_4O_MINI);
    expect(OPENAI_MODEL_ALIASES['gpt-4-turbo']).toBe(OPENAI_MODELS.GPT_4_TURBO);
    expect(OPENAI_MODEL_ALIASES['gpt-3.5-turbo']).toBe(OPENAI_MODELS.GPT_35_TURBO);
  });
});

describe('OPENAI_MODELS — derived constants', () => {
  it('GPT_5_2_CODEX derives from canonical registry codex-5.2 entry', () => {
    // Locks in #2200 Child 3 partial migration: this single overlap with
    // the CLI registry (codex-5.2's cliModelName) is registry-derived.
    expect(OPENAI_MODELS.GPT_5_2_CODEX).toBe('gpt-5.2-codex');
  });
});
