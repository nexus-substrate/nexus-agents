/**
 * Tests for Adapter Availability Middleware
 *
 * @module mcp/middleware/adapter-availability.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkAdapterAvailability,
  requireAdapterAvailable,
  hasApiKey,
  getAvailableApiKeyProviders,
  getSharedCliCache,
  resetSharedCliCache,
} from './adapter-availability.js';

// Mock the CLI factory
vi.mock('../../cli-adapters/factory.js', () => ({
  getAvailableClis: vi.fn(),
}));

import { getAvailableClis } from '../../cli-adapters/factory.js';

const mockedGetAvailableClis = vi.mocked(getAvailableClis);

describe('adapter-availability', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    resetSharedCliCache();
    // Default: no CLIs available
    mockedGetAvailableClis.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('checkAdapterAvailability', () => {
    it('should return available=true when CLI is authenticated', async () => {
      mockedGetAvailableClis.mockResolvedValue(['claude']);

      const result = await checkAdapterAvailability();

      expect(result.available).toBe(true);
      expect(result.availableClis).toEqual(['claude']);
      expect(result.error).toBeUndefined();
    });

    it('should return available=true when API key is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await checkAdapterAvailability();

      expect(result.available).toBe(true);
      expect(result.availableApiKeys).toContain('Anthropic (Claude)');
      expect(result.error).toBeUndefined();
    });

    it('should return available=true when both CLI and API key exist', async () => {
      mockedGetAvailableClis.mockResolvedValue(['gemini']);
      process.env.OPENAI_API_KEY = 'test-key';

      const result = await checkAdapterAvailability();

      expect(result.available).toBe(true);
      expect(result.availableClis).toEqual(['gemini']);
      expect(result.availableApiKeys).toContain('OpenAI');
    });

    it('should return available=false with error when nothing is configured', async () => {
      const result = await checkAdapterAvailability();

      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('No model adapter available');
      expect(result.error).toContain('claude login');
      expect(result.error).toContain('ANTHROPIC_API_KEY');
    });

    it('should skip CLI check when checkClis=false', async () => {
      mockedGetAvailableClis.mockResolvedValue(['claude']);
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await checkAdapterAvailability({ checkClis: false });

      expect(mockedGetAvailableClis).not.toHaveBeenCalled();
      expect(result.availableClis).toEqual([]);
      expect(result.availableApiKeys).toContain('Anthropic (Claude)');
    });

    it('should skip API key check when checkApiKeys=false', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await checkAdapterAvailability({ checkApiKeys: false });

      expect(result.availableApiKeys).toEqual([]);
      expect(result.available).toBe(false);
    });

    it('should handle CLI detection errors gracefully', async () => {
      mockedGetAvailableClis.mockRejectedValue(new Error('CLI error'));
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await checkAdapterAvailability();

      expect(result.available).toBe(true);
      expect(result.availableApiKeys).toContain('Anthropic (Claude)');
    });

    it('should use provided cache', async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
        clear: vi.fn(),
        size: vi.fn().mockReturnValue(0),
        isStale: vi.fn().mockReturnValue(false),
        invalidate: vi.fn(),
        getAll: vi.fn().mockReturnValue([]),
        getStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, staleHits: 0 }),
      };
      mockedGetAvailableClis.mockResolvedValue(['codex']);

      await checkAdapterAvailability({ cliCache: mockCache });

      expect(mockedGetAvailableClis).toHaveBeenCalledWith(mockCache);
    });
  });

  describe('requireAdapterAvailable', () => {
    it('should return undefined when CLI is available', async () => {
      mockedGetAvailableClis.mockResolvedValue(['claude']);

      const error = await requireAdapterAvailable();

      expect(error).toBeUndefined();
    });

    it('should return undefined when API key is available', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';

      const error = await requireAdapterAvailable();

      expect(error).toBeUndefined();
    });

    it('should return error message when nothing is available', async () => {
      const error = await requireAdapterAvailable();

      expect(error).toBeDefined();
      expect(error).toContain('No model adapter available');
    });
  });

  describe('hasApiKey', () => {
    it('should return true when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test';
      expect(hasApiKey()).toBe(true);
    });

    it('should return true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test';
      expect(hasApiKey()).toBe(true);
    });

    it('should return true when GOOGLE_AI_API_KEY is set', () => {
      process.env.GOOGLE_AI_API_KEY = 'test';
      expect(hasApiKey()).toBe(true);
    });

    it('should return false when no API keys are set', () => {
      expect(hasApiKey()).toBe(false);
    });

    it('should return false for empty string values', () => {
      process.env.ANTHROPIC_API_KEY = '';
      expect(hasApiKey()).toBe(false);
    });
  });

  describe('getAvailableApiKeyProviders', () => {
    it('should return all configured providers', () => {
      process.env.ANTHROPIC_API_KEY = 'test1';
      process.env.OPENAI_API_KEY = 'test2';

      const providers = getAvailableApiKeyProviders();

      expect(providers).toContain('Anthropic (Claude)');
      expect(providers).toContain('OpenAI');
      expect(providers).not.toContain('Google AI (Gemini)');
    });

    it('should return empty array when no keys are set', () => {
      expect(getAvailableApiKeyProviders()).toEqual([]);
    });
  });

  describe('getSharedCliCache', () => {
    it('should return the same instance on multiple calls', () => {
      const cache1 = getSharedCliCache();
      const cache2 = getSharedCliCache();

      expect(cache1).toBe(cache2);
    });

    it('should return new instance after reset', () => {
      const cache1 = getSharedCliCache();
      resetSharedCliCache();
      const cache2 = getSharedCliCache();

      expect(cache1).not.toBe(cache2);
    });
  });
});
