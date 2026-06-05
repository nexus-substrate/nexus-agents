/**
 * nexus-agents/adapters - Claude Adapter Tests
 *
 * Tests for ClaudeAdapter implementation.
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
  const mockStream = vi.fn();
  return { mockCreate, mockStream };
});

// Mock the Anthropic SDK - reference hoisted mock
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mocks.mockCreate,
      stream: mocks.mockStream,
    };
  },
}));

// Re-export for test access
const mockCreate = mocks.mockCreate;
const mockStream = mocks.mockStream;

import {
  ClaudeAdapter,
  createClaudeAdapter,
  CLAUDE_MODELS,
  CLAUDE_MODEL_ALIASES,
  type ClaudeAdapterConfig,
} from './claude-adapter.js';

describe('ClaudeAdapter', () => {
  const validConfig: ClaudeAdapterConfig = {
    modelId: 'claude-sonnet-4',
    apiKey: 'test-api-key-12345',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with valid config', () => {
      const adapter = new ClaudeAdapter(validConfig);

      expect(adapter.providerId).toBe('anthropic');
      expect(adapter.modelId).toBe(CLAUDE_MODELS.SONNET_4);
    });

    it('should resolve model aliases', () => {
      const adapter = new ClaudeAdapter({
        ...validConfig,
        modelId: 'claude-opus-4',
      });

      expect(adapter.modelId).toBe(CLAUDE_MODELS.OPUS_4);
    });

    it('should use full model ID when not an alias', () => {
      const fullModelId = 'claude-sonnet-4-20250514';
      const adapter = new ClaudeAdapter({
        ...validConfig,
        modelId: fullModelId,
      });

      expect(adapter.modelId).toBe(fullModelId);
    });

    it('should throw ConfigError for missing API key', () => {
      expect(() => {
        new ClaudeAdapter({
          modelId: 'claude-sonnet-4',
          apiKey: '',
        });
      }).toThrow(ConfigError);
    });

    it('should throw ConfigError for whitespace-only API key', () => {
      expect(() => {
        new ClaudeAdapter({
          modelId: 'claude-sonnet-4',
          apiKey: '   ',
        });
      }).toThrow(ConfigError);
    });
  });

  describe('capabilities', () => {
    it('should have completion capability', () => {
      const adapter = new ClaudeAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.COMPLETION)).toBe(true);
    });

    it('should have streaming capability', () => {
      const adapter = new ClaudeAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.STREAMING)).toBe(true);
    });

    it('should have tool_use capability', () => {
      const adapter = new ClaudeAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.TOOL_USE)).toBe(true);
    });

    it('should have vision capability', () => {
      const adapter = new ClaudeAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.VISION)).toBe(true);
    });

    it('should have extended_thinking for Opus', () => {
      const adapter = new ClaudeAdapter({
        ...validConfig,
        modelId: 'claude-opus-4',
      });
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(true);
    });

    it('should have extended_thinking for Sonnet 4', () => {
      const adapter = new ClaudeAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(true);
    });

    it('should not have extended_thinking for Haiku', () => {
      const adapter = new ClaudeAdapter({
        ...validConfig,
        modelId: 'claude-haiku-3',
      });
      expect(adapter.hasCapability(ModelCapability.EXTENDED_THINKING)).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should return ok for valid config', () => {
      const adapter = new ClaudeAdapter(validConfig);
      const result = adapter.validateConfig();

      expect(result.ok).toBe(true);
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens based on character count', async () => {
      const adapter = new ClaudeAdapter(validConfig);

      // Claude uses ~3.5 chars per token
      const text = 'Hello, world!'; // 13 chars
      const tokens = await adapter.countTokens(text);

      // Math.ceil(13 / 3.5) = Math.ceil(3.71) = 4
      expect(tokens).toBe(4);
    });

    it('should handle empty string', async () => {
      const adapter = new ClaudeAdapter(validConfig);
      const tokens = await adapter.countTokens('');

      expect(tokens).toBe(0);
    });

    it('should handle long text', async () => {
      const adapter = new ClaudeAdapter(validConfig);
      const text = 'a'.repeat(1000);
      const tokens = await adapter.countTokens(text);

      // Math.ceil(1000 / 3.5) = 286
      expect(tokens).toBe(286);
    });
  });

  describe('complete', () => {
    it('should call Anthropic API with correct parameters', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello!' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
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
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        systemPrompt: 'You are a helpful assistant.',
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant.',
        })
      );
    });

    it('should include temperature when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
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
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'stop_sequence',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        stop: ['STOP', 'END'],
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stop_sequences: ['STOP', 'END'],
        })
      );
    });

    it('should include tools when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'get_weather',
            input: { location: 'NYC' },
          },
        ],
        usage: { input_tokens: 20, output_tokens: 10 },
        stop_reason: 'tool_use',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
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
          id: 'tool_1',
          name: 'get_weather',
          input: { location: 'NYC' },
        });
      }
    });

    it('should return error for API failures', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const adapter = new ClaudeAdapter(validConfig);
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
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 4096,
        })
      );
    });

    it('should set MODEL_RATE_LIMITED error code for 429 status', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        status: 429,
      });
      mockCreate.mockRejectedValueOnce(rateLimitError);

      const adapter = new ClaudeAdapter(validConfig);
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

      const adapter = new ClaudeAdapter(validConfig);
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

      const adapter = new ClaudeAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_UNAVAILABLE);
      }
    });
  });

  describe('responseFormat — forced tool_use (#3433)', () => {
    const jsonSchema = {
      type: 'object',
      properties: { decision: { type: 'string' } },
      required: ['decision'],
    } as const;

    it('forces a respond tool_use for json_schema responseFormat', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'unused' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Vote please' }],
        responseFormat: { type: 'json_schema', schema: jsonSchema },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'respond', input_schema: jsonSchema }),
          ]),
          tool_choice: { type: 'tool', name: 'respond' },
        })
      );
    });

    it('uses a permissive object schema for json_object responseFormat', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'unused' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Give JSON' }],
        responseFormat: { type: 'json_object' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'respond', input_schema: { type: 'object' } }),
          ]),
          tool_choice: { type: 'tool', name: 'respond' },
        })
      );
    });

    it('surfaces the respond tool_use input as a JSON text block', async () => {
      const input = { decision: 'approve', confidence: 0.9 };
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 't1', name: 'respond', input }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'tool_use',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Vote please' }],
        responseFormat: { type: 'json_schema', schema: jsonSchema },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual([{ type: 'text', text: JSON.stringify(input) }]);
      }
    });

    it('falls back to text mapping when the model returns no respond tool_use', async () => {
      // Realistic refusal path: responseFormat requested, but the model replied
      // with plain text instead of the forced tool. The text must pass through
      // (the voter's regex/JSON fallback then salvages it) — not throw or drop.
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"decision":"abstain"}' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Vote please' }],
        responseFormat: { type: 'json_schema', schema: jsonSchema },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual([{ type: 'text', text: '{"decision":"abstain"}' }]);
      }
    });

    it('merges the respond tool with caller-supplied tools', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'unused' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Vote please' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        responseFormat: { type: 'json_schema', schema: jsonSchema },
      });

      const call = mockCreate.mock.calls[0]?.[0] as {
        tools?: { name: string }[];
        tool_choice?: unknown;
      };
      const names = (call.tools ?? []).map((t) => t.name);
      expect(names).toContain('get_weather');
      expect(names).toContain('respond');
      expect(call.tool_choice).toEqual({ type: 'tool', name: 'respond' });
    });

    it('does not force tool_use when responseFormat.type is text', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'plain' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        responseFormat: { type: 'text' },
      });

      const call = mockCreate.mock.calls[0]?.[0] as {
        tools?: unknown;
        tool_choice?: unknown;
      };
      expect(call.tool_choice).toBeUndefined();
      expect(call.tools).toBeUndefined();
    });
  });

  describe('stream', () => {
    it('should yield stream chunks', async () => {
      // Create an async generator that simulates streaming
      async function* mockStreamGenerator() {
        yield { type: 'message_start', message: { model: CLAUDE_MODELS.SONNET_4 } };
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        };
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello' },
        };
        yield { type: 'content_block_stop', index: 0 };
        yield {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 5 },
        };
        yield { type: 'message_stop' };
      }

      mockStream.mockReturnValue(mockStreamGenerator());

      const adapter = new ClaudeAdapter(validConfig);
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toEqual({
        type: 'message_start',
        message: { model: CLAUDE_MODELS.SONNET_4 },
      });
    });

    it('should map content_block_start events correctly', async () => {
      async function* mockStreamGenerator() {
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: 'Initial' },
        };
        yield { type: 'message_stop' };
      }

      mockStream.mockReturnValue(mockStreamGenerator());

      const adapter = new ClaudeAdapter(validConfig);
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toContainEqual({
        type: 'content_block_start',
        index: 0,
        contentBlock: { type: 'text', text: 'Initial' },
      });
    });

    it('should map content_block_delta events correctly', async () => {
      async function* mockStreamGenerator() {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'world' },
        };
        yield { type: 'message_stop' };
      }

      mockStream.mockReturnValue(mockStreamGenerator());

      const adapter = new ClaudeAdapter(validConfig);
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

    it('should map message_delta events with usage', async () => {
      async function* mockStreamGenerator() {
        yield {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 10 },
        };
        yield { type: 'message_stop' };
      }

      mockStream.mockReturnValue(mockStreamGenerator());

      const adapter = new ClaudeAdapter(validConfig);
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toContainEqual({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { inputTokens: 0, outputTokens: 10, totalTokens: 10 },
      });
    });

    it('should handle stream errors gracefully', async () => {
      async function* mockStreamGenerator() {
        yield { type: 'message_start', message: { model: CLAUDE_MODELS.SONNET_4 } };
        throw new Error('Stream error');
      }

      mockStream.mockReturnValue(mockStreamGenerator());

      const adapter = new ClaudeAdapter(validConfig);

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
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
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

    it('should extract system message from messages array', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
    });

    it('should map content blocks correctly', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
      await adapter.complete({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'tool_1', name: 'search', input: { q: 'test' } }],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'Results' }],
          },
        ],
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user' }),
            expect.objectContaining({ role: 'assistant' }),
            expect.objectContaining({ role: 'user' }),
          ]),
        })
      );
    });
  });

  describe('stop reason mapping', () => {
    it.each([
      ['end_turn', 'end_turn'],
      ['max_tokens', 'max_tokens'],
      ['stop_sequence', 'stop_sequence'],
      ['tool_use', 'tool_use'],
      [null, 'end_turn'],
      ['unknown', 'end_turn'],
    ])('should map "%s" to "%s"', async (anthropicReason, expectedReason) => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: anthropicReason,
        model: CLAUDE_MODELS.SONNET_4,
      });

      const adapter = new ClaudeAdapter(validConfig);
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

      const adapter = new ClaudeAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(NexusError);
        expect(result.error.context).not.toHaveProperty('apiKey');
        expect(result.error.context?.['providerId']).toBe('anthropic');
        expect(result.error.context?.['modelId']).toBe(CLAUDE_MODELS.SONNET_4);
      }
    });

    it('should detect rate limit errors from message content', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Too many requests'));

      const adapter = new ClaudeAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
      }
    });

    it('should detect overloaded errors', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Server overloaded, please retry'));

      const adapter = new ClaudeAdapter(validConfig);
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

describe('createClaudeAdapter', () => {
  it('should create adapter instance', () => {
    const adapter = createClaudeAdapter({
      modelId: 'claude-sonnet-4',
      apiKey: 'test-key',
    });

    expect(adapter).toBeInstanceOf(ClaudeAdapter);
    expect(adapter.providerId).toBe('anthropic');
  });

  it('should pass configuration correctly', () => {
    const adapter = createClaudeAdapter({
      modelId: 'claude-opus-4',
      apiKey: 'test-key',
      timeout: 60000,
    });

    expect(adapter.modelId).toBe(CLAUDE_MODELS.OPUS_4);
  });
});

describe('CLAUDE_MODELS', () => {
  it('derives current cliModelName from the canonical registry (issue #2186)', () => {
    // Values now come from config/in-tree-data.ts so they refresh
    // automatically when the registry is updated, not when this file is edited.
    expect(CLAUDE_MODELS.OPUS_4).toBe('claude-opus-4-6');
    expect(CLAUDE_MODELS.SONNET_4).toBe('claude-sonnet-4-6');
    expect(CLAUDE_MODELS.HAIKU_4).toBe('claude-haiku-4-5-20251001');
  });
});

describe('CLAUDE_MODEL_ALIASES', () => {
  it('should map aliases to full model IDs', () => {
    expect(CLAUDE_MODEL_ALIASES['claude-opus-4']).toBe(CLAUDE_MODELS.OPUS_4);
    expect(CLAUDE_MODEL_ALIASES['claude-sonnet-4']).toBe(CLAUDE_MODELS.SONNET_4);
    expect(CLAUDE_MODEL_ALIASES['claude-haiku-4']).toBe(CLAUDE_MODELS.HAIKU_4);
    expect(CLAUDE_MODEL_ALIASES['claude-haiku-3']).toBe(CLAUDE_MODELS.HAIKU_4); // Legacy alias
  });
});
