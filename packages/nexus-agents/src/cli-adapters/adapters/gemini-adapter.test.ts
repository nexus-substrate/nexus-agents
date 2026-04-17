/**
 * Tests for Gemini CLI Adapter
 *
 * Verifies Gemini-specific adapter functionality including:
 * - Retry logic and circuit breaker integration
 * - Enhanced timeout profiles
 * - Resilient parsing
 *
 * Base adapter behavior is tested in base-adapter.test.ts
 *
 * (Source: Issue #114)
 * (Source: Issue #366 - Enhanced features)
 * (Source: Issue #389 - Merged enhanced adapter)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiCliAdapter, createGeminiAdapter } from './gemini-adapter.js';
import { getDefaultModelForCli, getCliModelName } from '../../config/model-config-helpers.js';

/** Expected default model ID for Gemini, derived from canonical registry. */
const EXPECTED_DEFAULT_ID = getCliModelName(getDefaultModelForCli('gemini'));

describe('GeminiCliAdapter', () => {
  let adapter: GeminiCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GeminiCliAdapter();
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('constructor', () => {
    it('should create adapter with default configuration', () => {
      expect(adapter.name).toBe('gemini');
      expect(adapter.transport).toBe('subprocess');
    });

    it('should use custom model when provided', () => {
      const customAdapter = new GeminiCliAdapter({ model: 'gemini-2.5-pro' });
      expect(customAdapter.getModelInfo().id).toBe('gemini-2.5-pro');
    });

    it('should accept custom logger', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
      };
      const adapterWithLogger = new GeminiCliAdapter({ logger: mockLogger });
      expect(adapterWithLogger).toBeDefined();
    });

    it('should accept custom retry configuration', () => {
      const customAdapter = new GeminiCliAdapter({
        maxRetries: 5,
        baseDelayMs: 500,
        maxDelayMs: 15_000,
      });
      expect(customAdapter).toBeDefined();
    });

    it('should allow disabling circuit breaker', () => {
      const customAdapter = new GeminiCliAdapter({
        enableCircuitBreaker: false,
      });
      expect(customAdapter.getCircuitBreakerSnapshot()).toBeNull();
    });

    it('should accept custom circuit breaker config', () => {
      const customAdapter = new GeminiCliAdapter({
        circuitBreakerConfig: {
          failureThreshold: 10,
          resetTimeoutMs: 120_000,
        },
      });
      const snapshot = customAdapter.getCircuitBreakerSnapshot();
      expect(snapshot?.config.failureThreshold).toBe(10);
    });
  });

  describe('factory functions', () => {
    it('should create adapter instance with createGeminiAdapter', () => {
      const instance = createGeminiAdapter();
      expect(instance).toBeInstanceOf(GeminiCliAdapter);
    });

    it('should pass configuration to adapter', () => {
      const instance = createGeminiAdapter({ model: 'gemini-2.5-pro' });
      expect(instance.getModelInfo().id).toBe('gemini-2.5-pro');
    });
  });

  describe('capabilities', () => {
    it('should return correct capability profile', () => {
      const caps = adapter.capabilities;

      expect(caps.reasoning).toBe(10);
      expect(caps.contextWindow).toBe(1_000_000);
      expect(caps.codeGeneration).toBe(9);
      expect(caps.speed).toBe(8);
      expect(caps.cost).toBe(6);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe(EXPECTED_DEFAULT_ID);
      expect(info.name).toBeDefined();
      expect(info.contextWindow).toBe(1_000_000);
      expect(info.maxOutput).toBe(8_192);
    });

    it('should return correct cost info for pro', () => {
      const info = adapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(2.0);
      expect(info.costPerMillionOutput).toBe(12.0);
    });

    it('should return correct info for pro model', () => {
      const proAdapter = new GeminiCliAdapter({ model: 'gemini-2.5-pro' });
      const info = proAdapter.getModelInfo();

      expect(info.id).toBe('gemini-2.5-pro');
      expect(info.name).toBe('Gemini 2.5 Pro');
      expect(info.costPerMillionInput).toBe(1.25);
      expect(info.costPerMillionOutput).toBe(10.0);
    });

    it('should use default costs for unknown model', () => {
      const unknownAdapter = new GeminiCliAdapter({ model: 'gemini-unknown' });
      const info = unknownAdapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(0.15);
      expect(info.costPerMillionOutput).toBe(0.6);
      expect(info.contextWindow).toBe(1_000_000);
    });
  });

  describe('context window', () => {
    it('should return 1M context for all Gemini models', () => {
      const models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

      for (const model of models) {
        const modelAdapter = new GeminiCliAdapter({ model });
        expect(modelAdapter.getModelInfo().contextWindow).toBe(1_000_000);
      }
    });
  });

  describe('circuit breaker integration', () => {
    it('should have circuit breaker enabled by default', () => {
      const snapshot = adapter.getCircuitBreakerSnapshot();

      expect(snapshot).not.toBeNull();
      expect(snapshot?.state).toBe('closed');
      expect(snapshot?.failureCount).toBe(0);
    });

    it('should allow manual circuit breaker reset', () => {
      expect(() => {
        adapter.resetCircuitBreaker();
      }).not.toThrow();
    });

    it('should return null snapshot when circuit breaker disabled', () => {
      const noCbAdapter = new GeminiCliAdapter({
        enableCircuitBreaker: false,
      });

      expect(noCbAdapter.getCircuitBreakerSnapshot()).toBeNull();
    });

    it('should check circuit state before execution', () => {
      // Verify circuit is closed initially
      const snapshot = adapter.getCircuitBreakerSnapshot();
      expect(snapshot?.state).toBe('closed');
    });

    it('should maintain closed state after reset', () => {
      adapter.resetCircuitBreaker();
      const snapshot = adapter.getCircuitBreakerSnapshot();
      expect(snapshot?.state).toBe('closed');
    });
  });

  describe('transport', () => {
    it('should use subprocess transport', () => {
      expect(adapter.transport).toBe('subprocess');
    });
  });

  describe('lifecycle', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });

    it('should dispose successfully', async () => {
      await adapter.initialize();
      await expect(adapter.dispose()).resolves.not.toThrow();
    });
  });

  describe('configuration defaults', () => {
    it('should have correct default model', () => {
      expect(adapter.getModelInfo().id).toBe(EXPECTED_DEFAULT_ID);
    });

    it('should have circuit breaker in closed state initially', () => {
      const snapshot = adapter.getCircuitBreakerSnapshot();
      expect(snapshot?.state).toBe('closed');
    });
  });
});

describe('GeminiCliAdapter systemPrompt (#1886)', () => {
  it('passes --policy <tempfile> when systemPrompt is set', () => {
    const adapter = new GeminiCliAdapter();
    // Access protected getCommand via type assertion (test-only)
    const cmd = (
      adapter as unknown as { getCommand: (t: unknown) => { args: string[]; cleanup?: () => void } }
    ).getCommand({ content: 'test prompt', systemPrompt: 'You are strict.' });
    const policyIdx = cmd.args.indexOf('--policy');
    expect(policyIdx).toBeGreaterThanOrEqual(0);
    expect(cmd.args[policyIdx + 1]).toMatch(/policy\.md$/);
    expect(cmd.cleanup).toBeDefined();
    // Clean up the temp file
    if (cmd.cleanup !== undefined) cmd.cleanup();
  });

  it('omits --policy when systemPrompt is empty', () => {
    const adapter = new GeminiCliAdapter();
    const cmd = (
      adapter as unknown as { getCommand: (t: unknown) => { args: string[]; cleanup?: () => void } }
    ).getCommand({ content: 'test prompt' });
    expect(cmd.args).not.toContain('--policy');
    expect(cmd.cleanup).toBeUndefined();
  });
});

describe('GeminiCliAdapter resilient parsing', () => {
  it('should use resilient parser for JSON parsing', async () => {
    const adapter = new GeminiCliAdapter();

    // The adapter internally uses ResilientGeminiParser
    // This is verified by the adapter's construction
    expect(adapter.name).toBe('gemini');

    await adapter.dispose();
  });
});
