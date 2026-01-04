/**
 * nexus-agents/adapters - Ollama Adapter Tests
 * Uses mocking to test without live API calls.
 */

/* eslint-disable @typescript-eslint/require-await */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelCapability, ErrorCode, NexusError } from '../core/index.js';
import type { StreamChunk } from '../core/index.js';
import {
  OllamaAdapter,
  createOllamaAdapter,
  OLLAMA_MODELS,
  type OllamaAdapterConfig,
} from './ollama-adapter.js';

const mockChat = vi.fn();
vi.mock('ollama', () => ({ Ollama: vi.fn().mockImplementation(() => ({ chat: mockChat })) }));

describe('OllamaAdapter', () => {
  const validConfig: OllamaAdapterConfig = { modelId: 'llama3:8b' };

  beforeEach(() => vi.clearAllMocks());

  describe('constructor', () => {
    it('should create adapter with valid config', () => {
      const adapter = new OllamaAdapter(validConfig);
      expect(adapter.providerId).toBe('ollama');
      expect(adapter.modelId).toBe('llama3:8b');
    });

    it('should accept custom base URL', () => {
      const adapter = new OllamaAdapter({ ...validConfig, baseUrl: 'http://192.168.1.100:11434' });
      expect(adapter.modelId).toBe('llama3:8b');
    });
  });

  describe('capabilities', () => {
    it('should have completion and streaming capabilities', () => {
      const adapter = new OllamaAdapter(validConfig);
      expect(adapter.hasCapability(ModelCapability.COMPLETION)).toBe(true);
      expect(adapter.hasCapability(ModelCapability.STREAMING)).toBe(true);
    });

    it('should have tool_use for llama3, mistral, qwen models', () => {
      expect(
        new OllamaAdapter({ modelId: 'llama3:8b' }).hasCapability(ModelCapability.TOOL_USE)
      ).toBe(true);
      expect(
        new OllamaAdapter({ modelId: 'mistral:latest' }).hasCapability(ModelCapability.TOOL_USE)
      ).toBe(true);
      expect(
        new OllamaAdapter({ modelId: 'qwen2.5-coder:7b' }).hasCapability(ModelCapability.TOOL_USE)
      ).toBe(true);
    });

    it('should have vision for llava models', () => {
      expect(
        new OllamaAdapter({ modelId: 'llava:13b' }).hasCapability(ModelCapability.VISION)
      ).toBe(true);
    });

    it('should not have tool_use for phi3', () => {
      expect(new OllamaAdapter({ modelId: 'phi3' }).hasCapability(ModelCapability.TOOL_USE)).toBe(
        false
      );
    });
  });

  describe('validateConfig', () => {
    it('should return ok for valid config', () => {
      expect(new OllamaAdapter(validConfig).validateConfig().ok).toBe(true);
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens based on character count', async () => {
      const adapter = new OllamaAdapter(validConfig);
      expect(await adapter.countTokens('Hello, world!')).toBe(4); // 13/4 = 3.25 -> 4
      expect(await adapter.countTokens('')).toBe(0);
      expect(await adapter.countTokens('a'.repeat(1000))).toBe(250);
    });
  });

  describe('complete', () => {
    const mockResponse = {
      model: 'llama3:8b',
      message: { role: 'assistant', content: 'Hello!' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 10,
      eval_count: 5,
    };

    it('should call Ollama API with correct parameters', async () => {
      mockChat.mockResolvedValueOnce(mockResponse);
      const adapter = new OllamaAdapter(validConfig);
      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        maxTokens: 1024,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual([{ type: 'text', text: 'Hello!' }]);
        expect(result.value.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
        expect(result.value.stopReason).toBe('end_turn');
      }
    });

    it('should include system prompt when provided', async () => {
      mockChat.mockResolvedValueOnce(mockResponse);
      await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        systemPrompt: 'You are helpful.',
        maxTokens: 1024,
      });
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([{ role: 'system', content: 'You are helpful.' }]),
        })
      );
    });

    it('should include temperature and stop sequences', async () => {
      mockChat.mockResolvedValueOnce(mockResponse);
      await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'Hi!' }],
        temperature: 0.7,
        stop: ['STOP'],
        maxTokens: 1024,
      });
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ temperature: 0.7, stop: ['STOP'] }),
        })
      );
    });

    it('should include tools when provided', async () => {
      mockChat.mockResolvedValueOnce({
        ...mockResponse,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'get_weather', arguments: { location: 'NYC' } } }],
        },
        done_reason: 'tool_calls',
      });
      const result = await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather',
            inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stopReason).toBe('tool_use');
        expect(result.value.content[0]).toMatchObject({ type: 'tool_use', name: 'get_weather' });
      }
    });

    it('should return error for API failures', async () => {
      mockChat.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });
      expect(result.ok).toBe(false);
    });

    it('should handle JSON format request', async () => {
      mockChat.mockResolvedValueOnce({
        ...mockResponse,
        message: { role: 'assistant', content: '{"key":"value"}' },
      });
      await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'JSON' }],
        responseFormat: { type: 'json_object' },
      });
      expect(mockChat).toHaveBeenCalledWith(expect.objectContaining({ format: 'json' }));
    });
  });

  describe('stream', () => {
    it('should yield stream chunks', async () => {
      mockChat.mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          yield {
            model: 'llama3:8b',
            message: { role: 'assistant', content: 'Hello' },
            done: false,
          };
          yield {
            model: 'llama3:8b',
            message: { role: 'assistant', content: '' },
            done: true,
            done_reason: 'stop',
            prompt_eval_count: 10,
            eval_count: 5,
          };
        },
      });
      const chunks: StreamChunk[] = [];
      for await (const chunk of new OllamaAdapter(validConfig).stream({
        messages: [{ role: 'user', content: 'Hi!' }],
      })) {
        chunks.push(chunk);
      }
      expect(chunks[0]).toEqual({ type: 'message_start', message: { model: 'llama3:8b' } });
      expect(chunks).toContainEqual({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      });
      expect(chunks).toContainEqual({ type: 'message_stop' });
    });

    it('should handle stream errors', async () => {
      mockChat.mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          yield { model: 'llama3:8b', message: { content: 'Hi' }, done: false };
          throw new Error('Stream error');
        },
      });
      await expect(async () => {
        for await (const chunk of new OllamaAdapter(validConfig).stream({
          messages: [{ role: 'user', content: 'Hi!' }],
        })) {
          void chunk; /* consume */
        }
      }).rejects.toThrow();
    });
  });

  describe('message mapping', () => {
    it('should map string content messages', async () => {
      mockChat.mockResolvedValueOnce({
        model: 'llama3:8b',
        message: { role: 'assistant', content: 'R' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 10,
        eval_count: 5,
      });
      await new OllamaAdapter(validConfig).complete({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
          { role: 'user', content: 'Bye' },
        ],
      });
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!' },
            { role: 'user', content: 'Bye' },
          ],
        })
      );
    });

    it('should extract system message from messages array', async () => {
      mockChat.mockResolvedValueOnce({
        model: 'llama3:8b',
        message: { role: 'assistant', content: 'R' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 10,
        eval_count: 5,
      });
      await new OllamaAdapter(validConfig).complete({
        messages: [
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hi' },
        ],
      });
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'Be helpful.' },
            { role: 'user', content: 'Hi' },
          ],
        })
      );
    });
  });

  describe('stop reason mapping', () => {
    it.each([
      ['stop', 'end_turn'],
      ['length', 'max_tokens'],
      ['tool_calls', 'tool_use'],
      [undefined, 'end_turn'],
    ])('maps "%s" to "%s"', async (ollamaReason, expected) => {
      mockChat.mockResolvedValueOnce({
        model: 'llama3:8b',
        message: { role: 'assistant', content: 'R' },
        done: true,
        done_reason: ollamaReason,
        prompt_eval_count: 10,
        eval_count: 5,
      });
      const result = await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });
      if (result.ok) expect(result.value.stopReason).toBe(expected);
    });
  });

  describe('error handling', () => {
    it('should preserve error context', async () => {
      mockChat.mockRejectedValueOnce(new Error('Model not found'));
      const result = await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(NexusError);
        expect(result.error.context?.['providerId']).toBe('ollama');
      }
    });

    it('should detect timeout and unavailable errors', async () => {
      mockChat.mockRejectedValueOnce(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }));
      let result = await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });
      if (!result.ok) expect(result.error.code).toBe(ErrorCode.MODEL_TIMEOUT);

      mockChat.mockRejectedValueOnce(new Error('Server unavailable'));
      result = await new OllamaAdapter(validConfig).complete({
        messages: [{ role: 'user', content: 'Hi!' }],
      });
      if (!result.ok) expect(result.error.code).toBe(ErrorCode.MODEL_UNAVAILABLE);
    });
  });
});

describe('createOllamaAdapter', () => {
  it('should create adapter instance', () => {
    const adapter = createOllamaAdapter({ modelId: 'llama3:8b' });
    expect(adapter).toBeInstanceOf(OllamaAdapter);
    expect(adapter.providerId).toBe('ollama');
  });
});

describe('OLLAMA_MODELS', () => {
  it('should have correct model identifiers', () => {
    expect(OLLAMA_MODELS.LLAMA3_8B).toBe('llama3:8b');
    expect(OLLAMA_MODELS.MISTRAL).toBe('mistral');
    expect(OLLAMA_MODELS.CODELLAMA).toBe('codellama');
  });
});
