/**
 * Tests for UnifiedAdapterRegistry
 *
 * Verifies centralized adapter creation and task routing:
 * - Task category → CLI routing is deterministic
 * - Adapters are cached per CLI (no duplicate creation)
 * - Role-based routing uses task specialization matrix
 * - Model preference resolution via canonical registry
 * - Default adapter fallback behavior
 *
 * @module adapters/unified-registry.test
 * (Source: Issue #1149, #1151)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UnifiedAdapterRegistry,
  createUnifiedRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
  withDefaultOnRetirement,
} from './unified-registry.js';
import type { ILogger } from '../core/index.js';
import { TASK_SPECIALIZATION_MATRIX } from '../config/task-specialization.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../config/in-tree-data.js';
import * as modelConfigHelpers from '../config/model-config-helpers.js';
import type { ModelId } from '../config/model-capabilities-types.js';

// Silence logging in tests
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
  setLevel: vi.fn(),
};

describe('UnifiedAdapterRegistry', () => {
  let registry: UnifiedAdapterRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGlobalRegistry();
    registry = createUnifiedRegistry({ logger: mockLogger });
  });

  afterEach(() => {
    registry.dispose();
  });

  describe('constructor', () => {
    it('should initialize with pre-computed routing', () => {
      const snapshot = registry.getSnapshot();
      expect(snapshot.taskRouting).toHaveLength(10);
      expect(snapshot.availableModels).toBeGreaterThan(0);
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'UnifiedAdapterRegistry initialized',
        expect.objectContaining({ categories: 10 })
      );
    });
  });

  describe('task routing', () => {
    it('should route all 10 categories', () => {
      const snapshot = registry.getSnapshot();
      const categories = snapshot.taskRouting.map((r) => r.category);
      expect(categories).toContain('architecture');
      expect(categories).toContain('code_generation');
      expect(categories).toContain('research');
      expect(categories).toContain('security_review');
      expect(categories).toContain('documentation');
      expect(categories).toContain('testing');
      expect(categories).toContain('devops');
      expect(categories).toContain('exploration');
      expect(categories).toContain('planning');
      expect(categories).toContain('code_review');
    });

    it('should match task specialization matrix', () => {
      for (const spec of TASK_SPECIALIZATION_MATRIX) {
        const routing = registry.getRouting(spec.category);
        expect(routing).toBeDefined();
        expect(routing?.primaryCli).toBe(spec.primaryCli);
        expect(routing?.secondaryCli).toBe(spec.secondaryCli);
      }
    });

    it('should route architecture to gemini', () => {
      const routing = registry.getRouting('architecture');
      expect(routing?.primaryCli).toBe('gemini');
    });

    it('should route code_generation to codex', () => {
      const routing = registry.getRouting('code_generation');
      expect(routing?.primaryCli).toBe('codex');
    });

    it('should route research to gemini', () => {
      const routing = registry.getRouting('research');
      expect(routing?.primaryCli).toBe('gemini');
    });
  });

  describe('getAdapter(category)', () => {
    it('should return adapter for known category', () => {
      const adapter = registry.getAdapter('code_generation');
      expect(adapter).toBeDefined();
      expect(adapter.providerId).toBeDefined();
    });

    it('should cache adapters per CLI', () => {
      // code_generation and testing both route to codex
      const adapter1 = registry.getAdapter('code_generation');
      const adapter2 = registry.getAdapter('testing');
      expect(adapter1).toBe(adapter2);
    });

    it('should return different adapters for different CLIs', () => {
      const codeAdapter = registry.getAdapter('code_generation'); // codex
      const archAdapter = registry.getAdapter('architecture'); // gemini
      expect(codeAdapter).not.toBe(archAdapter);
    });
  });

  describe('getAdapterForTask(text)', () => {
    it('should detect code generation task', () => {
      registry.getAdapterForTask('implement a new feature');
      // "implement" → code_generation → codex
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('codex');
    });

    it('should detect research task', () => {
      registry.getAdapterForTask('research state of the art');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('gemini');
    });

    it('should fall back to default for unrecognized task', () => {
      const result = registry.getAdapterForTask('something completely unrelated xyz123');
      // Should return default adapter
      expect(result).toBeDefined();
    });
  });

  describe('getAdapterForCli(cli)', () => {
    it('should create adapter for claude', () => {
      const adapter = registry.getAdapterForCli('claude');
      expect(adapter).toBeDefined();
    });

    it('should cache adapter for same CLI', () => {
      const a1 = registry.getAdapterForCli('gemini');
      const a2 = registry.getAdapterForCli('gemini');
      expect(a1).toBe(a2);
    });

    it('should track cached adapters in snapshot', () => {
      registry.getAdapterForCli('claude');
      registry.getAdapterForCli('codex');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('claude');
      expect(snapshot.cachedAdapters).toContain('codex');
    });
  });

  describe('getAdapterForModel(modelPreference)', () => {
    it('should resolve claude-opus to claude CLI', () => {
      registry.getAdapterForModel('claude-opus');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('claude');
    });

    it('should resolve codex-5.3 to codex CLI', () => {
      registry.getAdapterForModel('codex-5.3');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('codex');
    });

    it('should resolve gemini-pro to gemini CLI', () => {
      registry.getAdapterForModel('gemini-pro');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('gemini');
    });

    it('should fall back to default for unknown model', () => {
      const adapter = registry.getAdapterForModel('unknown-model-xyz');
      expect(adapter).toBeDefined();
    });

    // #2192 defense-in-depth: prefix fallback uses longest-prefix-wins so a
    // future registry with both 'gemini-pro' and 'gemini-pro-experimental'
    // would resolve a 'gemini-pro-experimental-foo' input to the longer one.
    // No current registry entries have this overlap, but verify the policy.
    it('routes prefix matches via longest-prefix-wins (defense-in-depth)', () => {
      // 'gemini-pro-bespoke-deployment' starts with both 'gemini-pro' (10 chars)
      // and no longer entry — so it routes to gemini via the gemini-pro entry.
      registry.getAdapterForModel('gemini-pro-bespoke-deployment');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('gemini');
    });
  });

  describe('getAdapterForRole(role)', () => {
    it('should route code_expert to codex', () => {
      registry.getAdapterForRole('code_expert');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('codex');
    });

    it('should route architecture_expert to gemini', () => {
      registry.getAdapterForRole('architecture_expert');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('gemini');
    });

    it('should route research_expert to gemini', () => {
      registry.getAdapterForRole('research_expert');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('gemini');
    });

    it('should route documentation_expert to gemini', () => {
      registry.getAdapterForRole('documentation_expert');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('gemini');
    });

    it('should route infrastructure_expert to claude (devops)', () => {
      registry.getAdapterForRole('infrastructure_expert');
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toContain('claude');
    });

    it('should fall back to default for unknown role', () => {
      const adapter = registry.getAdapterForRole('nonexistent_expert');
      expect(adapter).toBeDefined();
    });
  });

  describe('getDefault()', () => {
    it('should return an adapter', () => {
      const adapter = registry.getDefault();
      expect(adapter).toBeDefined();
    });

    it('should return same instance on repeated calls', () => {
      const a1 = registry.getDefault();
      const a2 = registry.getDefault();
      expect(a1).toBe(a2);
    });
  });

  describe('dispose()', () => {
    it('should clear cached adapters', () => {
      registry.getAdapterForCli('claude');
      registry.getAdapterForCli('gemini');
      registry.dispose();
      const snapshot = registry.getSnapshot();
      expect(snapshot.cachedAdapters).toHaveLength(0);
    });

    it('should log disposal', () => {
      registry.dispose();
      expect(mockLogger.info).toHaveBeenCalledWith('UnifiedAdapterRegistry disposed');
    });
  });

  describe('getSnapshot()', () => {
    it('should include routing for all categories', () => {
      const snapshot = registry.getSnapshot();
      expect(snapshot.taskRouting).toHaveLength(10);
    });

    it('should report model count matching canonical registry', () => {
      const snapshot = registry.getSnapshot();
      expect(snapshot.availableModels).toBe(DEFAULT_MODEL_CAPABILITIES.models.length);
    });
  });
});

describe('global registry singleton', () => {
  afterEach(() => {
    resetGlobalRegistry();
  });

  it('should create on first access', () => {
    const reg = getGlobalRegistry({ logger: mockLogger });
    expect(reg).toBeInstanceOf(UnifiedAdapterRegistry);
  });

  it('should return same instance', () => {
    const r1 = getGlobalRegistry({ logger: mockLogger });
    const r2 = getGlobalRegistry();
    expect(r1).toBe(r2);
  });

  it('should reset properly', () => {
    const r1 = getGlobalRegistry({ logger: mockLogger });
    resetGlobalRegistry();
    const r2 = getGlobalRegistry({ logger: mockLogger });
    expect(r1).not.toBe(r2);
  });

  it('should warn when config is supplied to an already-initialized singleton', () => {
    getGlobalRegistry({ logger: mockLogger });
    mockLogger.warn.mockClear();
    getGlobalRegistry({ logger: mockLogger, defaultCliTimeoutMs: 9_999 });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('already initialized'),
      expect.any(Object)
    );
  });

  it('should not warn when config is omitted on subsequent calls', () => {
    getGlobalRegistry({ logger: mockLogger });
    mockLogger.warn.mockClear();
    getGlobalRegistry();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});

// ============================================================================
// MODEL_NOT_FOUND fallback wiring (#2549)
// ============================================================================

describe('UnifiedAdapterRegistry enableMissingModelFallback (#2549)', () => {
  afterEach(() => {
    resetGlobalRegistry();
  });

  it('returns raw resilient adapters by default (flag off)', () => {
    const registry = createUnifiedRegistry({ logger: mockLogger });
    const adapter = registry.getAdapterForCli('claude');
    // The raw resilient adapter exposes setPreferredCli; sanity-check
    // that the surface includes it.
    expect(typeof adapter.setPreferredCli).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.getHealth).toBe('function');
    registry.dispose();
  });

  it('wraps adapters with fallback when the flag is enabled', () => {
    const registry = createUnifiedRegistry({
      logger: mockLogger,
      enableMissingModelFallback: true,
    });
    const adapter = registry.getAdapterForCli('claude');
    // Wrapped adapter still implements the resilient surface — the
    // wrapper preserves health/lifecycle methods via the
    // `wrapResilientWithFallback` helper.
    expect(typeof adapter.setPreferredCli).toBe('function');
    expect(typeof adapter.getHealth).toBe('function');
    expect(typeof adapter.refresh).toBe('function');
    expect(typeof adapter.dispose).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    registry.dispose();
  });

  it('caches the wrapped adapter — repeated lookups return the same instance', () => {
    const registry = createUnifiedRegistry({
      logger: mockLogger,
      enableMissingModelFallback: true,
    });
    const first = registry.getAdapterForCli('claude');
    const second = registry.getAdapterForCli('claude');
    expect(first).toBe(second);
    registry.dispose();
  });
});

describe('withDefaultOnRetirement — onRetirement dead-bridge wiring', () => {
  const freshLogger = (): ILogger => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  });

  it('returns options unchanged when the fallback is disabled', () => {
    const opts = {};
    expect(withDefaultOnRetirement(false, opts, freshLogger())).toBe(opts);
    expect(withDefaultOnRetirement(false, undefined, freshLogger())).toBeUndefined();
  });

  it('wires a default logging onRetirement when enabled and none was provided', () => {
    const logger = freshLogger();
    const resolved = withDefaultOnRetirement(true, undefined, logger);
    expect(resolved?.onRetirement).toBeDefined();
    resolved!.onRetirement!({
      retiredModelId: 'claude-opus-4-6',
      fallbackModelId: 'claude-opus',
    } as never);
    expect(logger.warn).toHaveBeenCalledWith(
      'Model retired via not-found fallback',
      expect.objectContaining({
        retirement: expect.objectContaining({ retiredModelId: 'claude-opus-4-6' }),
      })
    );
  });

  it('preserves a caller-supplied onRetirement (no override)', () => {
    const custom = vi.fn();
    const resolved = withDefaultOnRetirement(true, { onRetirement: custom }, freshLogger());
    expect(resolved?.onRetirement).toBe(custom);
  });
});

// ============================================================================
// #3185 — routing is re-resolved on read; no construction-time freeze.
// ============================================================================

describe('UnifiedAdapterRegistry — routing re-resolves on read (#3185)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetGlobalRegistry();
  });

  it('getRouting reflects a post-construction default-model change (no stale cache)', () => {
    const spy = vi
      .spyOn(modelConfigHelpers, 'getDefaultModelForCli')
      .mockReturnValue('claude-opus');
    const registry = createUnifiedRegistry({ logger: mockLogger });

    // 'planning' routes to claude → primaryModel resolved via the helper.
    const before = registry.getRouting('planning');
    expect(before?.primaryModel).toBe('claude-opus');

    // Simulate a registry/overlay update that changes the resolved default.
    spy.mockReturnValue('claude-opus-overlay' as ModelId);

    // The SAME instance must reflect the change — proving no construction-time
    // freeze of the routing table.
    const after = registry.getRouting('planning');
    expect(after?.primaryModel).toBe('claude-opus-overlay');
    registry.dispose();
  });

  it('getSnapshot re-reads routing on each call', () => {
    const spy = vi
      .spyOn(modelConfigHelpers, 'getDefaultModelForCli')
      .mockReturnValue('claude-opus');
    const registry = createUnifiedRegistry({ logger: mockLogger });

    const planningBefore = registry
      .getSnapshot()
      .taskRouting.find((r) => r.category === 'planning');
    expect(planningBefore?.primaryModel).toBe('claude-opus');

    spy.mockReturnValue('claude-opus-overlay' as ModelId);

    const planningAfter = registry.getSnapshot().taskRouting.find((r) => r.category === 'planning');
    expect(planningAfter?.primaryModel).toBe('claude-opus-overlay');
    registry.dispose();
  });
});
