/**
 * Tests for Auto-Adapter
 * @module adapters/auto-adapter.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AutoAdapterConfig, AdapterSelection } from './auto-adapter.js';
import {
  createAutoAdapter,
  getAvailableAdapters,
  wrapApiSelectionForRouter,
} from './auto-adapter.js';
import { ok, type IModelAdapter } from '../core/index.js';

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

// Mock SDK adapter
vi.mock('./sdk/index.js', () => ({
  SdkAdapter: vi.fn().mockImplementation(function (config: Record<string, unknown>) {
    return {
      execute: vi.fn(),
      name: `sdk-${String(config['providerId'])}`,
      providerId: `sdk-${String(config['providerId'])}`,
      modelId: config['modelId'],
    };
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
import { createCliAdapter, isCliAvailable, getAvailableClis } from '../cli-adapters/factory.js';
import { createClaudeAdapter } from './claude-adapter.js';
import { createCliDetectionCache } from '../cli-adapters/cli-detection-cache.js';

// ============================================================================
// Tests
// ============================================================================

describe('createAutoAdapter', () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenaiKey = process.env.OPENAI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_AI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    // Re-setup mock return values after clearAllMocks (vitest 3.x clears them)
    vi.mocked(createCliAdapter).mockReturnValue({
      initialize: vi.fn().mockReturnValue(Promise.resolve()),
      execute: vi.fn(),
      name: 'mock-cli',
    } as never);
    vi.mocked(createCliDetectionCache).mockReturnValue({
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
    } as never);
  });

  afterEach(() => {
    if (originalAnthropicKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalOpenaiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenaiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalGoogleKey !== undefined) {
      process.env.GOOGLE_AI_API_KEY = originalGoogleKey;
    } else {
      delete process.env.GOOGLE_AI_API_KEY;
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
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;
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

  describe('multi-provider API fallback', () => {
    it('falls back to OpenAI when no Anthropic key', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      process.env.OPENAI_API_KEY = 'openai-test-key';
      const result = await createAutoAdapter({ priority: 'api-first' });
      expect(result.source).toBe('api');
      expect(result.name).toBe('openai');
      expect(result.reason).toContain('OpenAI');
    });

    it('falls back to Google when no Anthropic or OpenAI key', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      process.env.GOOGLE_AI_API_KEY = 'google-test-key';
      const result = await createAutoAdapter({ priority: 'api-first' });
      expect(result.source).toBe('api');
      expect(result.name).toBe('google');
      expect(result.reason).toContain('Google');
    });

    it('prefers Anthropic over OpenAI when both available', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      const result = await createAutoAdapter({ priority: 'api-first' });
      expect(result.name).toBe('anthropic');
    });

    it('uses openaiApiKey from config', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      const result = await createAutoAdapter({
        priority: 'api-first',
        openaiApiKey: 'config-openai-key',
      });
      expect(result.source).toBe('api');
      expect(result.name).toBe('openai');
    });

    it('uses googleApiKey from config', async () => {
      vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
      const result = await createAutoAdapter({
        priority: 'api-first',
        googleApiKey: 'config-google-key',
      });
      expect(result.source).toBe('api');
      expect(result.name).toBe('google');
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
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenaiKey = process.env.OPENAI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_AI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    // Re-setup mock return values after clearAllMocks
    vi.mocked(createCliDetectionCache).mockReturnValue({
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
    } as never);
  });

  afterEach(() => {
    if (originalAnthropicKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalOpenaiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenaiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalGoogleKey !== undefined) {
      process.env.GOOGLE_AI_API_KEY = originalGoogleKey;
    } else {
      delete process.env.GOOGLE_AI_API_KEY;
    }
  });

  it('returns available CLIs and API key status', async () => {
    vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve(['claude', 'gemini']));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    const result = await getAvailableAdapters();
    expect(result.clis).toEqual(['claude', 'gemini']);
    expect(result.hasAnthropicKey).toBe(true);
    expect(result.hasOpenaiKey).toBe(true);
    expect(result.hasGoogleKey).toBe(false);
    expect(result.cache).toBeDefined();
  });

  it('reports no API keys when none set', async () => {
    vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
    const result = await getAvailableAdapters();
    expect(result.clis).toEqual([]);
    expect(result.hasAnthropicKey).toBe(false);
    expect(result.hasOpenaiKey).toBe(false);
    expect(result.hasGoogleKey).toBe(false);
  });

  it('reports no API key when empty string', async () => {
    vi.mocked(getAvailableClis).mockReturnValue(Promise.resolve([]));
    process.env.ANTHROPIC_API_KEY = '';
    const result = await getAvailableAdapters();
    expect(result.hasAnthropicKey).toBe(false);
  });
});

describe('wrapApiSelectionForRouter (#3422)', () => {
  function apiSelection(name: string, modelId = 'claude-opus'): AdapterSelection {
    const modelAdapter = {
      providerId: name,
      modelId,
      capabilities: [],
      complete: vi.fn(),
      stream: vi.fn(),
      countTokens: vi.fn(),
      validateConfig: vi.fn().mockReturnValue(ok(undefined)),
    } as unknown as IModelAdapter;
    return { adapter: modelAdapter, source: 'api', name, reason: 'test' };
  }

  it('maps each vendor to a distinct api:<vendor> arm id with its display slot', () => {
    const cases: ReadonlyArray<[string, string, string]> = [
      ['anthropic', 'api:anthropic', 'claude'],
      ['openai', 'api:openai', 'codex'],
      ['google', 'api:google', 'gemini'],
      ['custom-openai', 'api:custom-openai', 'opencode'],
    ];
    for (const [vendor, armId, slot] of cases) {
      const wrapped = wrapApiSelectionForRouter(apiSelection(vendor));
      expect(wrapped?.armId).toBe(armId);
      // Display name is the attribution slot, NOT the arm id (telemetry stays split).
      expect(wrapped?.adapter.name).toBe(slot);
    }
  });

  it('returns an ICliAdapter whose arm id never collides with a CLI slot', () => {
    const wrapped = wrapApiSelectionForRouter(apiSelection('anthropic'));
    // api:anthropic is distinct from the 'claude' CLI slot — separate bandit arms.
    expect(wrapped?.armId).toBe('api:anthropic');
    expect(wrapped?.armId).not.toBe('claude');
  });

  it('returns null for a CLI selection (router gets those from createAllAdapters)', () => {
    const sel: AdapterSelection = {
      adapter: apiSelection('anthropic').adapter,
      source: 'cli',
      name: 'claude',
      reason: 'test',
    };
    expect(wrapApiSelectionForRouter(sel)).toBeNull();
  });

  it('returns null for an unrecognized vendor', () => {
    expect(wrapApiSelectionForRouter(apiSelection('mystery-vendor'))).toBeNull();
  });
});
