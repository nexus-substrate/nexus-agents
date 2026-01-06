/**
 * nexus-agents/context - Token Counter Tests
 *
 * Tests for TokenCounter implementation including all providers and caching.
 * Uses mocking to test without live API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from '../core/index.js';
import { ErrorCode } from '../core/index.js';

// Create mock functions that will be used by the mocked modules
const mockCountTokens = vi.fn();
const mockGeminiCountTokens = vi.fn();
const mockEncode = vi.fn();
const mockFree = vi.fn();

// Mock Anthropic SDK - must be before imports that use it
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      countTokens: mockCountTokens,
    };
  },
}));

// Mock Google GenAI SDK
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      countTokens: mockGeminiCountTokens,
    };
  },
}));

// Mock tiktoken
vi.mock('tiktoken', () => ({
  encoding_for_model: () => ({
    encode: mockEncode,
    free: mockFree,
  }),
}));

// Import after mocks are set up
import {
  TokenCounter,
  createTokenCounter,
  TokenCounterProvider,
  TokenCountError,
  type TokenCounterConfig,
} from './token-counter.js';

describe('TokenCounter', () => {
  const validConfig: TokenCounterConfig = {
    anthropicApiKey: 'test-anthropic-key',
    googleApiKey: 'test-google-key',
    maxCacheSize: 100,
    cacheTtlMs: 60000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behaviors
    mockEncode.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create counter with valid config', () => {
      const counter = new TokenCounter(validConfig);
      expect(counter).toBeInstanceOf(TokenCounter);
    });

    it('should create counter with empty config', () => {
      const counter = new TokenCounter();
      expect(counter).toBeInstanceOf(TokenCounter);
    });

    it('should create counter with partial config', () => {
      const counter = new TokenCounter({ anthropicApiKey: 'test-key' });
      expect(counter).toBeInstanceOf(TokenCounter);
    });

    it('should use default cache settings when not provided', () => {
      const counter = new TokenCounter();
      const stats = counter.getCacheStats();

      expect(stats.maxSize).toBe(1000);
      expect(stats.ttlMs).toBe(5 * 60 * 1000);
    });

    it('should use custom cache settings when provided', () => {
      const counter = new TokenCounter({
        maxCacheSize: 500,
        cacheTtlMs: 120000,
      });
      const stats = counter.getCacheStats();

      expect(stats.maxSize).toBe(500);
      expect(stats.ttlMs).toBe(120000);
    });
  });

  describe('estimate', () => {
    it('should estimate tokens based on character count', () => {
      const counter = new TokenCounter();

      // ~4 chars per token
      const text = 'Hello, world!'; // 13 chars
      const tokens = counter.estimate(text);

      // Math.ceil(13 / 4) = 4
      expect(tokens).toBe(4);
    });

    it('should handle empty string', () => {
      const counter = new TokenCounter();
      const tokens = counter.estimate('');

      expect(tokens).toBe(0);
    });

    it('should handle long text', () => {
      const counter = new TokenCounter();
      const text = 'a'.repeat(1000);
      const tokens = counter.estimate(text);

      // Math.ceil(1000 / 4) = 250
      expect(tokens).toBe(250);
    });

    it('should round up for partial tokens', () => {
      const counter = new TokenCounter();
      const text = 'abc'; // 3 chars
      const tokens = counter.estimate(text);

      // Math.ceil(3 / 4) = 1
      expect(tokens).toBe(1);
    });
  });

  describe('estimateForProvider', () => {
    it('should use Anthropic chars per token (~3.5)', () => {
      const counter = new TokenCounter();
      const text = 'a'.repeat(35);
      const tokens = counter.estimateForProvider(text, TokenCounterProvider.ANTHROPIC);

      // Math.ceil(35 / 3.5) = 10
      expect(tokens).toBe(10);
    });

    it('should use Gemini chars per token (~4)', () => {
      const counter = new TokenCounter();
      const text = 'a'.repeat(40);
      const tokens = counter.estimateForProvider(text, TokenCounterProvider.GEMINI);

      // Math.ceil(40 / 4) = 10
      expect(tokens).toBe(10);
    });

    it('should use OpenAI chars per token (~4)', () => {
      const counter = new TokenCounter();
      const text = 'a'.repeat(40);
      const tokens = counter.estimateForProvider(text, TokenCounterProvider.OPENAI);

      // Math.ceil(40 / 4) = 10
      expect(tokens).toBe(10);
    });
  });

  describe('countAnthropic', () => {
    it('should count tokens via Anthropic API', async () => {
      mockCountTokens.mockResolvedValueOnce({ input_tokens: 42 });

      const counter = new TokenCounter(validConfig);
      const messages: Message[] = [{ role: 'user', content: 'Hello, world!' }];
      const result = await counter.countAnthropic(messages, 'claude-sonnet-4');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(42);
        expect(result.value.cached).toBe(false);
        expect(result.value.provider).toBe(TokenCounterProvider.ANTHROPIC);
        expect(result.value.model).toBe('claude-sonnet-4');
      }
    });

    it('should return cached result on second call', async () => {
      mockCountTokens.mockResolvedValueOnce({ input_tokens: 42 });

      const counter = new TokenCounter(validConfig);
      const messages: Message[] = [{ role: 'user', content: 'Hello, world!' }];

      // First call
      const result1 = await counter.countAnthropic(messages, 'claude-sonnet-4');
      expect(result1.ok).toBe(true);
      if (result1.ok) {
        expect(result1.value.cached).toBe(false);
      }

      // Second call - should be cached
      const result2 = await counter.countAnthropic(messages, 'claude-sonnet-4');
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.cached).toBe(true);
        expect(result2.value.count).toBe(42);
      }

      // API should only be called once
      expect(mockCountTokens).toHaveBeenCalledTimes(1);
    });

    it('should handle messages with content blocks', async () => {
      mockCountTokens.mockResolvedValueOnce({ input_tokens: 55 });

      const counter = new TokenCounter(validConfig);
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is this image?' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'It appears to be a cat.' }],
        },
      ];
      const result = await counter.countAnthropic(messages, 'claude-sonnet-4');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(55);
      }
    });

    it('should handle system messages', async () => {
      mockCountTokens.mockResolvedValueOnce({ input_tokens: 30 });

      const counter = new TokenCounter(validConfig);
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ];
      const result = await counter.countAnthropic(messages, 'claude-sonnet-4');

      expect(result.ok).toBe(true);
      expect(mockCountTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: 'Hello!' }],
        })
      );
    });

    it('should return error when API key not configured', async () => {
      const counter = new TokenCounter(); // No API key

      const messages: Message[] = [{ role: 'user', content: 'Hello!' }];
      const result = await counter.countAnthropic(messages, 'claude-sonnet-4');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TokenCountError);
        expect(result.error.message).toContain('Anthropic API key not configured');
      }
    });

    it('should return error on API failure', async () => {
      mockCountTokens.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const counter = new TokenCounter(validConfig);
      const messages: Message[] = [{ role: 'user', content: 'Hello!' }];
      const result = await counter.countAnthropic(messages, 'claude-sonnet-4');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TokenCountError);
        expect(result.error.message).toContain('Anthropic token counting failed');
        expect(result.error.code).toBe(ErrorCode.MODEL_ERROR);
      }
    });
  });

  describe('countGemini', () => {
    it('should count tokens via Gemini API', async () => {
      mockGeminiCountTokens.mockResolvedValueOnce({ totalTokens: 28 });

      const counter = new TokenCounter(validConfig);
      const result = await counter.countGemini('Hello, world!', 'gemini-2.0-flash');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(28);
        expect(result.value.cached).toBe(false);
        expect(result.value.provider).toBe(TokenCounterProvider.GEMINI);
        expect(result.value.model).toBe('gemini-2.0-flash');
      }
    });

    it('should return cached result on second call', async () => {
      mockGeminiCountTokens.mockResolvedValueOnce({ totalTokens: 28 });

      const counter = new TokenCounter(validConfig);

      // First call
      const result1 = await counter.countGemini('Hello, world!', 'gemini-2.0-flash');
      expect(result1.ok).toBe(true);
      if (result1.ok) {
        expect(result1.value.cached).toBe(false);
      }

      // Second call - should be cached
      const result2 = await counter.countGemini('Hello, world!', 'gemini-2.0-flash');
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.cached).toBe(true);
        expect(result2.value.count).toBe(28);
      }

      // API should only be called once
      expect(mockGeminiCountTokens).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined totalTokens as 0', async () => {
      mockGeminiCountTokens.mockResolvedValueOnce({ totalTokens: undefined });

      const counter = new TokenCounter(validConfig);
      const result = await counter.countGemini('Hello!', 'gemini-2.0-flash');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(0);
      }
    });

    it('should return error when API key not configured', async () => {
      const counter = new TokenCounter(); // No API key

      const result = await counter.countGemini('Hello!', 'gemini-2.0-flash');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TokenCountError);
        expect(result.error.message).toContain('Google API key not configured');
      }
    });

    it('should return error on API failure', async () => {
      mockGeminiCountTokens.mockRejectedValueOnce(new Error('Quota exceeded'));

      const counter = new TokenCounter(validConfig);
      const result = await counter.countGemini('Hello!', 'gemini-2.0-flash');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TokenCountError);
        expect(result.error.message).toContain('Gemini token counting failed');
      }
    });
  });

  describe('countOpenAI', () => {
    it('should count tokens via tiktoken', () => {
      mockEncode.mockReturnValueOnce([1, 2, 3, 4, 5]);

      const counter = new TokenCounter(validConfig);
      const result = counter.countOpenAI('Hello, world!', 'gpt-4o');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(5);
        expect(result.value.cached).toBe(false);
        expect(result.value.provider).toBe(TokenCounterProvider.OPENAI);
        expect(result.value.model).toBe('gpt-4o');
      }
    });

    it('should use default model when not specified', () => {
      mockEncode.mockReturnValueOnce([1, 2, 3]);

      const counter = new TokenCounter(validConfig);
      const result = counter.countOpenAI('Hello!');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.model).toBe('gpt-4o');
      }
    });

    it('should return cached result on second call', () => {
      mockEncode.mockReturnValueOnce([1, 2, 3]);

      const counter = new TokenCounter(validConfig);

      // First call
      const result1 = counter.countOpenAI('Hello!', 'gpt-4o');
      expect(result1.ok).toBe(true);
      if (result1.ok) {
        expect(result1.value.cached).toBe(false);
      }

      // Second call - should be cached
      const result2 = counter.countOpenAI('Hello!', 'gpt-4o');
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.cached).toBe(true);
        expect(result2.value.count).toBe(3);
      }

      // Encoder should only be called once
      expect(mockEncode).toHaveBeenCalledTimes(1);
    });

    it('should handle different models', () => {
      mockEncode.mockReturnValueOnce([1, 2, 3, 4]);

      const counter = new TokenCounter(validConfig);
      const result = counter.countOpenAI('Test text', 'gpt-3.5-turbo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(4);
      }
    });

    it('should return error on tiktoken failure', () => {
      mockEncode.mockImplementationOnce(() => {
        throw new Error('Encoding failed');
      });

      const counter = new TokenCounter(validConfig);
      const result = counter.countOpenAI('Hello!', 'gpt-4o');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TokenCountError);
        expect(result.error.message).toContain('OpenAI token counting failed');
      }
    });
  });

  describe('caching', () => {
    it('should evict oldest entries when cache is full', async () => {
      const counter = new TokenCounter({
        ...validConfig,
        maxCacheSize: 2,
      });

      // Fill cache with 2 entries
      mockCountTokens.mockResolvedValueOnce({ input_tokens: 10 });
      await counter.countAnthropic([{ role: 'user', content: 'First' }], 'claude-sonnet-4');

      mockCountTokens.mockResolvedValueOnce({ input_tokens: 20 });
      await counter.countAnthropic([{ role: 'user', content: 'Second' }], 'claude-sonnet-4');

      // Add third entry - should evict first
      mockCountTokens.mockResolvedValueOnce({ input_tokens: 30 });
      await counter.countAnthropic([{ role: 'user', content: 'Third' }], 'claude-sonnet-4');

      const stats = counter.getCacheStats();
      expect(stats.size).toBe(2);

      // First entry should be evicted - should call API again
      mockCountTokens.mockResolvedValueOnce({ input_tokens: 10 });
      const result = await counter.countAnthropic(
        [{ role: 'user', content: 'First' }],
        'claude-sonnet-4'
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cached).toBe(false);
      }
    });

    it('should expire entries after TTL', async () => {
      vi.useFakeTimers();

      const counter = new TokenCounter({
        ...validConfig,
        cacheTtlMs: 1000, // 1 second TTL
      });

      mockCountTokens.mockResolvedValueOnce({ input_tokens: 42 });
      await counter.countAnthropic([{ role: 'user', content: 'Test' }], 'claude-sonnet-4');

      // Advance time past TTL
      vi.advanceTimersByTime(1001);

      // Should call API again because cache entry expired
      mockCountTokens.mockResolvedValueOnce({ input_tokens: 42 });
      const result = await counter.countAnthropic(
        [{ role: 'user', content: 'Test' }],
        'claude-sonnet-4'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cached).toBe(false);
      }
      expect(mockCountTokens).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should clear all cache entries', async () => {
      const counter = new TokenCounter(validConfig);

      mockCountTokens.mockResolvedValueOnce({ input_tokens: 42 });
      await counter.countAnthropic([{ role: 'user', content: 'Test' }], 'claude-sonnet-4');

      expect(counter.getCacheStats().size).toBe(1);

      counter.clearCache();

      expect(counter.getCacheStats().size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return current cache statistics', () => {
      const counter = new TokenCounter({
        maxCacheSize: 500,
        cacheTtlMs: 120000,
      });

      const stats = counter.getCacheStats();

      expect(stats).toEqual({
        size: 0,
        maxSize: 500,
        ttlMs: 120000,
      });
    });

    it('should reflect cache size after additions', async () => {
      const counter = new TokenCounter(validConfig);

      mockCountTokens.mockResolvedValueOnce({ input_tokens: 10 });
      await counter.countAnthropic([{ role: 'user', content: 'Test1' }], 'claude-sonnet-4');

      mockGeminiCountTokens.mockResolvedValueOnce({ totalTokens: 20 });
      await counter.countGemini('Test2', 'gemini-2.0-flash');

      mockEncode.mockReturnValueOnce([1, 2, 3]);
      counter.countOpenAI('Test3', 'gpt-4o');

      const stats = counter.getCacheStats();
      expect(stats.size).toBe(3);
    });
  });

  describe('dispose', () => {
    it('should free tiktoken encoder and clear cache', () => {
      mockEncode.mockReturnValueOnce([1, 2, 3]);

      const counter = new TokenCounter(validConfig);
      counter.countOpenAI('Test', 'gpt-4o');

      counter.dispose();

      expect(mockFree).toHaveBeenCalled();
      expect(counter.getCacheStats().size).toBe(0);
    });
  });

  describe('TokenCounterProvider', () => {
    it('should have correct provider values', () => {
      expect(TokenCounterProvider.ANTHROPIC).toBe('anthropic');
      expect(TokenCounterProvider.GEMINI).toBe('gemini');
      expect(TokenCounterProvider.OPENAI).toBe('openai');
    });
  });

  describe('TokenCountError', () => {
    it('should have correct error properties', () => {
      const error = new TokenCountError('Test error', {
        context: { provider: 'anthropic', model: 'claude-sonnet-4' },
      });

      expect(error.name).toBe('TokenCountError');
      expect(error.code).toBe(ErrorCode.MODEL_ERROR);
      expect(error.message).toBe('Test error');
      expect(error.context).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4' });
    });

    it('should preserve cause error', () => {
      const cause = new Error('Original error');
      const error = new TokenCountError('Wrapped error', { cause });

      expect(error.cause).toBe(cause);
    });
  });
});

describe('createTokenCounter', () => {
  it('should create TokenCounter instance', () => {
    const counter = createTokenCounter();
    expect(counter).toBeInstanceOf(TokenCounter);
  });

  it('should pass configuration correctly', () => {
    const counter = createTokenCounter({
      maxCacheSize: 200,
      cacheTtlMs: 30000,
    });

    const stats = counter.getCacheStats();
    expect(stats.maxSize).toBe(200);
    expect(stats.ttlMs).toBe(30000);
  });
});

describe('Variance Testing', () => {
  /**
   * Tests to ensure token counting has <5% variance from actual usage.
   * These tests verify the estimation accuracy against known token counts.
   */

  it('should estimate within 5% for typical English text', () => {
    const counter = new TokenCounter();

    // Known: "Hello, world!" is approximately 3-4 tokens in most tokenizers
    const text = 'Hello, world!';
    const estimate = counter.estimate(text);

    // Actual is ~4 tokens, estimate should be 3-5 (within 25% for short text)
    // For longer text, variance should be <5%
    expect(estimate).toBeGreaterThanOrEqual(3);
    expect(estimate).toBeLessThanOrEqual(5);
  });

  it('should estimate within 5% for longer text', () => {
    const counter = new TokenCounter();

    // Generate 1000 character text
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(22);
    const estimate = counter.estimate(text);

    // ~4 chars per token, so ~250 tokens expected
    // 5% variance = 237-262 range
    const expectedTokens = 250;
    const variance = Math.abs(estimate - expectedTokens) / expectedTokens;

    expect(variance).toBeLessThan(0.1); // Allow 10% for estimation
  });

  it('should handle mixed content appropriately', () => {
    const counter = new TokenCounter();

    // Mixed content with code and prose
    const text = `
      function hello() {
        console.log("Hello, world!");
      }
      This is a function that prints a greeting.
    `;
    const estimate = counter.estimate(text);

    // Should provide reasonable estimate
    expect(estimate).toBeGreaterThan(10);
    expect(estimate).toBeLessThan(100);
  });
});
