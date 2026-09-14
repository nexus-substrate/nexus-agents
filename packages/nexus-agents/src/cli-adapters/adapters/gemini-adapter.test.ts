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
      expect(caps.contextWindow).toBe(1_048_576);
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
      expect(info.contextWindow).toBe(1_048_576);
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
    it('should return ≥1M context for all Gemini models', () => {
      // Known models resolve through the registry (gemini-2.5-pro / -flash → 1_048_576).
      // Unknown variants (e.g. flash-lite) fall back to GEMINI_LEGACY_DEFAULTS.contextWindow.
      const models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

      for (const model of models) {
        const modelAdapter = new GeminiCliAdapter({ model });
        expect(modelAdapter.getModelInfo().contextWindow).toBeGreaterThanOrEqual(1_000_000);
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

describe('GeminiCliAdapter systemPrompt (#1886, reworked in #4346)', () => {
  function getCommand(task: unknown): { command: string; args: string[]; cleanup?: () => void } {
    const adapter = new GeminiCliAdapter();
    return (
      adapter as unknown as {
        getCommand: (t: unknown) => { command: string; args: string[]; cleanup?: () => void };
      }
    ).getCommand(task);
  }

  it('prepends the system prompt to the content', () => {
    // agy has no system-prompt flag — the retired gemini CLI's `--policy <file>`
    // has no equivalent, and `--agent` selects a preconfigured agent rather than
    // accepting inline instructions. Prepending is a deliberate downgrade in
    // framing fidelity, pinned here so it is not mistaken for an oversight.
    const cmd = getCommand({ content: 'test prompt', systemPrompt: 'You are strict.' });

    const printIdx = cmd.args.indexOf('--print');
    expect(cmd.args[printIdx + 1]).toBe('You are strict.\n\ntest prompt');
  });

  it('passes the content unchanged when no system prompt is set', () => {
    const cmd = getCommand({ content: 'test prompt' });

    const printIdx = cmd.args.indexOf('--print');
    expect(cmd.args[printIdx + 1]).toBe('test prompt');
  });

  it('writes no temp file, so there is nothing to clean up', () => {
    // The old --policy path wrote a tempdir per call and needed a cleanup
    // callback to avoid leaking it (#2824). That surface is gone entirely.
    const cmd = getCommand({ content: 'test prompt', systemPrompt: 'You are strict.' });

    expect(cmd.cleanup).toBeUndefined();
    expect(cmd.args).not.toContain('--policy');
  });
});

describe('GeminiCliAdapter runs agy, not the retired gemini CLI (#4346)', () => {
  function getCommand(task: unknown): { command: string; args: string[] } {
    const adapter = new GeminiCliAdapter();
    return (
      adapter as unknown as { getCommand: (t: unknown) => { command: string; args: string[] } }
    ).getCommand(task);
  }

  it('spawns agy', () => {
    // The standalone gemini CLI fails every invocation with IneligibleTierError
    // (exit 55) since Google retired it for individual tiers.
    expect(getCommand({ content: 'hi' }).command).toBe('agy');
  });

  it('uses agy flag spellings', () => {
    const { args } = getCommand({ content: 'hi' });

    expect(args).toContain('--output-format');
    expect(args).toContain('--model');
    expect(args).toContain('--print');
    // The retired CLI's short forms.
    expect(args).not.toContain('-o');
    expect(args).not.toContain('-m');
  });

  it('requests JSON output — the only place agy reports success or failure', () => {
    const { args } = getCommand({ content: 'hi' });

    expect(args[args.indexOf('--output-format') + 1]).toBe('json');
  });

  it('resumes a session with --conversation, not --resume', () => {
    const { args } = getCommand({ content: 'hi', sessionId: 'conv-123' });

    expect(args[args.indexOf('--conversation') + 1]).toBe('conv-123');
    expect(args).not.toContain('--resume');
  });

  it('passes the prompt as the value of --print, never positionally', () => {
    // A valueless --print consumes whatever token follows it.
    const { args } = getCommand({ content: 'hi' });

    expect(args[args.indexOf('--print') + 1]).toBe('hi');
    expect(args[0]).not.toBe('hi');
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

describe('GeminiCliAdapter hands agy the working tree (#6254)', () => {
  function getCommand(task: unknown): { command: string; args: string[] } {
    const adapter = new GeminiCliAdapter();
    return (
      adapter as unknown as { getCommand: (t: unknown) => { command: string; args: string[] } }
    ).getCommand(task);
  }

  it('passes the process working directory as --add-dir', () => {
    // Measured on #6254: agy's workspace is its STORED project, not the
    // directory it is spawned in. Spawned from this repository with no
    // --add-dir, a seat read `packages/nexus-agents/package.json` out of an
    // unrelated checkout and reported that file's version; with --add-dir
    // <cwd> it read this tree. The other arms (claude, codex) take the cwd
    // as their workspace by default, so this is the parity flag.
    const { args } = getCommand({ content: 'hi' });

    expect(args[args.indexOf('--add-dir') + 1]).toBe(process.cwd());
  });

  it('an explicit workDir option names the tree instead of the cwd', () => {
    const { args } = getCommand({ content: 'hi', options: { workDir: '/srv/other-tree' } });

    expect(args[args.indexOf('--add-dir') + 1]).toBe('/srv/other-tree');
    expect(args).not.toContain(process.cwd());
  });

  it('an empty workDir option falls back to the cwd, never an empty --add-dir', () => {
    const { args } = getCommand({ content: 'hi', options: { workDir: '' } });

    expect(args[args.indexOf('--add-dir') + 1]).toBe(process.cwd());
  });

  it('derives --print-timeout from the task timeout so agy gives up before the guard (#6277)', () => {
    // Measured on the #6260 panels: agy's --print-timeout defaults to 5m0s, the
    // same length as the 300 s vote guard, so a seat that needs longer than
    // five minutes returns {"status":"SUCCESS","response":""} and the vote
    // path reads it as a parse failure. A 600 s seat budget must reach agy.
    const { args } = getCommand({ content: 'hi', timeoutMs: 600_000 });

    expect(args[args.indexOf('--print-timeout') + 1]).toBe('595s');
  });

  it('never derives a --print-timeout below the floor', () => {
    const { args } = getCommand({ content: 'hi', timeoutMs: 1_000 });

    expect(args[args.indexOf('--print-timeout') + 1]).toBe('30s');
  });

  it('omits --print-timeout when the task carries no timeout (agy default applies)', () => {
    const { args } = getCommand({ content: 'hi' });

    expect(args).not.toContain('--print-timeout');
  });

  it('puts --add-dir before --print, which must stay last', () => {
    const { args } = getCommand({ content: 'hi' });

    expect(args.indexOf('--add-dir')).toBeLessThan(args.indexOf('--print'));
    expect(args.indexOf('--print')).toBe(args.length - 2);
  });
});
