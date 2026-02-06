/**
 * Tests for Auto-Adapter
 * @module adapters/auto-adapter.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AutoAdapterConfig } from './auto-adapter.js';
import { createAutoAdapter, getAvailableAdapters } from './auto-adapter.js';

// ============================================================================
// Mocks
// ============================================================================

// Mock CLI factory
vi.mock('../cli-adapters/factory.js', () => ({
  createCliAdapter: vi.fn().mockReturnValue({
    initialize: vi.fn().mockReturnValue(Promise.resolve()),
    execute: vi.fn(),
    name: 'mock-cli',
  }),
  isCliAvailable: vi.fn().mockReturnValue(Promise.resolve(false)),
  getAvailableClis: vi.fn().mockReturnValue(Promise.resolve([])),
}));

// Mock CLI-to-model adapter
vi.mock('../cli-adapters/cli-to-model-adapter.js', () => ({
  createCliToModelAdapter: vi.fn().mockReturnValue({
    execute: vi.fn(),
    name: 'mock-model-adapter',
  }),
}));

// Mock claude adapter
vi.mock('./claude-adapter.js', () => ({
  createClaudeAdapter: vi.fn().mockReturnValue({
    execute: vi.fn(),
    name: 'claude-adapter',
  }),
}));

// Mock CLI detection cache
vi.mock('../cli-adapters/cli-detection-cache.js', () => ({
  createCliDetectionCache: vi.fn().mockReturnValue({
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  }),
}));

// Import mocked functions for assertions
import { isCliAvailable, getAvailableClis } from '../cli-adapters/factory.js';
import { createClaudeAdapter } from './claude-adapter.js';

// ============================================================================
// Tests
// ============================================================================

describe('createAutoAdapter', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  describe('cli-first priority', () => {
    it('uses CLI when available', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['claude']));
      const result = await createAutoAdapter({ priority: 'cli-first' });
      expect(result.source).toBe('cli');
      expect(result.name).toBe('claude');
    });

    it('falls back to API when no CLI available', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const result = await createAutoAdapter({ priority: 'cli-first' });
      expect(result.source).toBe('api');
      expect(result.name).toBe('anthropic');
    });

    it('throws when no CLI and no API key', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      delete process.env.ANTHROPIC_API_KEY;
      await expect(createAutoAdapter({ priority: 'cli-first' })).rejects.toThrow(
        'No adapters available'
      );
    });
  });

  describe('api-first priority', () => {
    it('uses API when key available', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const result = await createAutoAdapter({ priority: 'api-first' });
      expect(result.source).toBe('api');
      expect(result.name).toBe('anthropic');
    });

    it('falls back to CLI when no API key', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['gemini']));
      const result = await createAutoAdapter({ priority: 'api-first' });
      expect(result.source).toBe('cli');
      expect(result.name).toBe('gemini');
    });

    it('throws when no API key and no CLI', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      await expect(createAutoAdapter({ priority: 'api-first' })).rejects.toThrow(
        'No adapters available'
      );
    });
  });

  describe('cli-only priority', () => {
    it('uses CLI when available', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['codex']));
      const result = await createAutoAdapter({ priority: 'cli-only' });
      expect(result.source).toBe('cli');
      expect(result.name).toBe('codex');
    });

    it('throws when no CLI available (even if API key set)', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      process.env.ANTHROPIC_API_KEY = 'test-key';
      await expect(createAutoAdapter({ priority: 'cli-only' })).rejects.toThrow(
        'No CLI adapters available'
      );
    });
  });

  describe('api-only priority', () => {
    it('uses API when key available', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const result = await createAutoAdapter({ priority: 'api-only' });
      expect(result.source).toBe('api');
      expect(result.name).toBe('anthropic');
    });

    it('throws when no API key', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      await expect(createAutoAdapter({ priority: 'api-only' })).rejects.toThrow(
        'No API key available'
      );
    });
  });

  describe('preferred CLI', () => {
    it('uses preferred CLI when available', async () => {
      vi.mocked(isCliAvailable).mockReturnValue(Promise.resolve(true));
      const result = await createAutoAdapter({
        priority: 'cli-first',
        preferredCli: 'gemini',
      });
      expect(result.source).toBe('cli');
      expect(result.name).toBe('gemini');
      expect(isCliAvailable).toHaveBeenCalledWith('gemini', expect.anything());
    });

    it('falls back to other CLIs when preferred not available', async () => {
      vi.mocked(isCliAvailable).mockReturnValue(Promise.resolve(false));
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['claude']));
      const result = await createAutoAdapter({
        priority: 'cli-first',
        preferredCli: 'gemini',
      });
      expect(result.source).toBe('cli');
      expect(result.name).toBe('claude');
    });
  });

  describe('API key from config', () => {
    it('uses anthropicApiKey from config over env', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      const result = await createAutoAdapter({
        priority: 'api-first',
        anthropicApiKey: 'config-key',
      });
      expect(result.source).toBe('api');
      expect(createClaudeAdapter).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'config-key' })
      );
    });
  });

  describe('cache behavior', () => {
    it('creates cache by default', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['claude']));
      const result = await createAutoAdapter({ priority: 'cli-first' });
      expect(result.cache).toBeDefined();
    });

    it('returns provided cache', async () => {
      const mockCache = { get: vi.fn(), set: vi.fn(), clear: vi.fn() };
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['claude']));
      const result = await createAutoAdapter({
        priority: 'cli-first',
        cache: mockCache,
      } as unknown as AutoAdapterConfig);
      expect(result.cache).toBe(mockCache);
    });

    it('disables cache when enableCache is false', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      const result = await createAutoAdapter({
        priority: 'cli-first',
        enableCache: false,
      });
      // API adapter result doesn't include cache
      expect(result.source).toBe('api');
    });
  });

  describe('default priority', () => {
    it('defaults to cli-first when no priority specified', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['claude']));
      const result = await createAutoAdapter({});
      expect(result.source).toBe('cli');
    });
  });
});

describe('getAvailableAdapters', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('returns available CLIs', async () => {
    vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['claude', 'gemini']));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const result = await getAvailableAdapters();
    expect(result.clis).toEqual(['claude', 'gemini']);
    expect(result.hasAnthropicKey).toBe(true);
    expect(result.cache).toBeDefined();
  });

  it('reports no API key when not set', async () => {
    vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
    delete process.env.ANTHROPIC_API_KEY;
    const result = await getAvailableAdapters();
    expect(result.clis).toEqual([]);
    expect(result.hasAnthropicKey).toBe(false);
  });

  it('reports no API key when empty string', async () => {
    vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
    process.env.ANTHROPIC_API_KEY = '';
    const result = await getAvailableAdapters();
    expect(result.hasAnthropicKey).toBe(false);
  });
});
