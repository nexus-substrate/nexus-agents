/**
 * nexus-agents/mcp - Tool Memory Integration Tests
 * (Source: Issue #690 - Wire memory system into MCP tool execution pipeline)
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import type { ILogger } from '../../core/index.js';

/**
 * These tests verify the ToolMemoryManager API surface and singleton behavior.
 * SessionMemory is mocked at the module level to avoid filesystem side effects.
 */

// Mock SessionMemory before importing ToolMemoryManager
const mockSessionMemory = {
  startSession: vi.fn().mockReturnValue({ ok: true, value: [] }),
  endSession: vi.fn().mockReturnValue({
    ok: true,
    value: { learnings: [], tasksCompleted: [], errorsResolved: [] },
  }),
  recordTask: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  recordLearning: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  recordError: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  isSessionActive: vi.fn().mockReturnValue(true),
  searchLearnings: vi.fn().mockReturnValue([]),
  getRecentErrorSolutions: vi.fn().mockReturnValue([]),
  getCurrentSessionLearnings: vi.fn().mockReturnValue([]),
  getCurrentSessionTasks: vi.fn().mockReturnValue([]),
  getCurrentSessionErrors: vi.fn().mockReturnValue([]),
};

vi.mock('../../context/session-memory.js', () => ({
  SessionMemory: vi.fn(function () {
    return mockSessionMemory;
  }),
}));

// Mock SQLite backends to skip expensive better-sqlite3 init (perf: saves ~2s)
vi.mock('../../context/agentic-memory.js', () => ({
  AgenticMemoryBackend: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: false, error: { message: 'mocked' } }),
    close: vi.fn(),
  })),
}));
vi.mock('../../context/adaptive-memory.js', () => ({
  AdaptiveMemoryBackend: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: false, error: { message: 'mocked' } }),
    close: vi.fn(),
  })),
}));
vi.mock('../../context/typed-memory.js', () => ({
  HybridMemoryBackend: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: false, error: { message: 'mocked' } }),
    close: vi.fn(),
  })),
  createTypedMemory: vi.fn(),
}));
// Mock HybridMemoryBackend from memory-backend.js (different from typed-memory.js export)
vi.mock('../../context/memory-backend.js', () => ({
  HybridMemoryBackend: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: false, error: { message: 'mocked' } }),
    close: vi.fn(),
  })),
}));
// Mock MobiMem to skip SQLite init (perf: saves ~1s)
vi.mock('../../context/mobimem.js', () => ({
  MobiMem: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockReturnValue([]),
    record: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalEntries: 0, backends: [] }),
    close: vi.fn(),
  })),
}));
// Mock MemoryDecayManager to skip SQLite init (perf: saves ~500ms).
// #5097: the mock resolves `getConfig()` the way the real constructor does
// (defaults overlaid by the argument) so the threading tests below can read
// back the effective values from the same seam production logs from.
vi.mock('./memory-decay.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./memory-decay.js')>();
  return {
    ...actual,
    // `function`, not an arrow: production `new`s it, and an arrow mock is
    // "not a constructor" — which is why the sibling arrow mocks above never
    // let the init chain complete in this file.
    MemoryDecayManager: vi.fn(function (config: Partial<MemoryDecayConfig> = {}) {
      return {
        initialize: vi.fn(),
        startAutoDecay: vi.fn(),
        stopAutoDecay: vi.fn(),
        runDecay: vi.fn().mockResolvedValue({ decayed: 0, removed: 0 }),
        getStats: vi.fn().mockReturnValue({ totalEntries: 0, decayedEntries: 0 }),
        getConfig: vi.fn().mockReturnValue({ ...actual.DEFAULT_DECAY_CONFIG, ...config }),
        shutdown: vi.fn(),
      };
    }),
  };
});

import {
  ToolMemoryManager,
  getToolMemory,
  shutdownToolMemory,
  configureToolMemory,
} from './tool-memory.js';
import { SessionMemory } from '../../context/session-memory.js';
import { MemoryDecayManager, DEFAULT_DECAY_CONFIG } from './memory-decay.js';
import type { MemoryDecayConfig } from './memory-decay.js';

// Shared setup: every test gets clean mocks + shutdown singleton.
// Eliminates 6 duplicate beforeEach/afterEach blocks.
beforeEach(() => {
  vi.clearAllMocks();
  resetMockDefaults();
  shutdownToolMemory();
});

afterAll(() => {
  shutdownToolMemory();
});

/** Reset all mock return values after vi.clearAllMocks() clears them. */
function resetMockDefaults(): void {
  mockSessionMemory.startSession.mockReturnValue({ ok: true, value: [] });
  mockSessionMemory.endSession.mockReturnValue({
    ok: true,
    value: { learnings: [], tasksCompleted: [], errorsResolved: [] },
  });
  mockSessionMemory.recordTask.mockReturnValue({ ok: true, value: undefined });
  mockSessionMemory.recordLearning.mockReturnValue({ ok: true, value: undefined });
  mockSessionMemory.recordError.mockReturnValue({ ok: true, value: undefined });
  mockSessionMemory.isSessionActive.mockReturnValue(true);
  mockSessionMemory.searchLearnings.mockReturnValue([]);
  mockSessionMemory.getRecentErrorSolutions.mockReturnValue([]);
}

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

describe('ToolMemoryManager', () => {
  describe('constructor', () => {
    it('should create a SessionMemory and start a session', () => {
      const logger = createMockLogger();
      new ToolMemoryManager(logger);

      expect(SessionMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryDir: expect.stringContaining('memory'),
          logger,
        })
      );
      expect(mockSessionMemory.startSession).toHaveBeenCalledWith(expect.stringContaining('mcp-'));
    });

    it('should handle session start failure gracefully', () => {
      mockSessionMemory.startSession.mockReturnValueOnce({
        ok: false,
        error: { message: 'disk full' },
      });

      const logger = createMockLogger();
      new ToolMemoryManager(logger);

      expect(logger.warn).toHaveBeenCalledWith('Tool memory session start failed', {
        error: 'disk full',
      });
    });

    it('should store past learnings from session start', () => {
      const pastLearnings = [{ pattern: 'test pattern', context: 'test ctx', confidence: 0.8 }];
      mockSessionMemory.startSession.mockReturnValueOnce({
        ok: true,
        value: pastLearnings,
      });

      const manager = new ToolMemoryManager(createMockLogger());
      expect(manager.getPastLearnings()).toEqual(pastLearnings);
    });
  });

  describe('recordTask', () => {
    it('should record a task to session memory', () => {
      const manager = new ToolMemoryManager(createMockLogger());
      manager.recordTask({
        approach: 'Test approach',
        challenges: ['challenge 1'],
        durationMs: 1000,
      });

      expect(mockSessionMemory.recordTask).toHaveBeenCalledWith({
        approach: 'Test approach',
        challenges: ['challenge 1'],
        durationMs: 1000,
      });
    });

    it('should silently skip if session is inactive', () => {
      mockSessionMemory.isSessionActive.mockReturnValue(false);

      const manager = new ToolMemoryManager(createMockLogger());
      manager.recordTask({ approach: 'Test', challenges: [] });

      expect(mockSessionMemory.recordTask).not.toHaveBeenCalled();
    });
  });

  describe('recordLearning', () => {
    it('should record a learning to session memory', () => {
      const manager = new ToolMemoryManager(createMockLogger());
      manager.recordLearning({
        pattern: 'Orchestration completed',
        context: 'task=123',
        confidence: 0.7,
        source: 'test',
      });

      expect(mockSessionMemory.recordLearning).toHaveBeenCalledWith({
        pattern: 'Orchestration completed',
        context: 'task=123',
        confidence: 0.7,
        source: 'test',
      });
    });
  });

  describe('recordError', () => {
    it('should record an error to session memory', () => {
      const manager = new ToolMemoryManager(createMockLogger());
      manager.recordError({
        error: 'Test error',
        solution: 'Test solution',
        filePattern: 'test/*.ts',
      });

      expect(mockSessionMemory.recordError).toHaveBeenCalledWith({
        error: 'Test error',
        solution: 'Test solution',
        filePattern: 'test/*.ts',
      });
    });
  });

  describe('searchLearnings', () => {
    it('should delegate search to session memory', () => {
      const expected = [{ pattern: 'found', context: 'ctx', confidence: 0.9 }];
      mockSessionMemory.searchLearnings.mockReturnValueOnce(expected);

      const manager = new ToolMemoryManager(createMockLogger());
      const result = manager.searchLearnings('test query');

      expect(mockSessionMemory.searchLearnings).toHaveBeenCalledWith('test query');
      expect(result).toEqual(expected);
    });
  });

  describe('getRecentErrorSolutions', () => {
    it('should delegate to session memory', () => {
      const expected = [{ error: 'err', solution: 'fix' }];
      mockSessionMemory.getRecentErrorSolutions.mockReturnValueOnce(expected);

      const manager = new ToolMemoryManager(createMockLogger());
      const result = manager.getRecentErrorSolutions(5);

      expect(mockSessionMemory.getRecentErrorSolutions).toHaveBeenCalledWith(5);
      expect(result).toEqual(expected);
    });
  });

  describe('endSession', () => {
    it('should end the session and persist data', () => {
      const manager = new ToolMemoryManager(createMockLogger());
      manager.endSession();

      expect(mockSessionMemory.endSession).toHaveBeenCalledWith('MCP session ended');
    });

    it('should skip if session is inactive', () => {
      mockSessionMemory.isSessionActive.mockReturnValue(false);

      const manager = new ToolMemoryManager(createMockLogger());
      manager.endSession();

      expect(mockSessionMemory.endSession).not.toHaveBeenCalled();
    });
  });
});

describe('getToolMemory singleton', () => {
  it('should return the same instance on multiple calls', () => {
    const a = getToolMemory();
    const b = getToolMemory();
    expect(a).toBe(b);
  });

  it('should create a new instance after shutdown', () => {
    const a = getToolMemory();
    shutdownToolMemory();
    const b = getToolMemory();
    expect(a).not.toBe(b);
  });
});

describe('getRelevantLearnings', () => {
  it('should return undefined when no past learnings exist', () => {
    const manager = new ToolMemoryManager(createMockLogger());
    expect(manager.getRelevantLearnings('some task')).toBeUndefined();
  });

  it('should return search results when learnings match', () => {
    const pastLearnings = [
      { pattern: 'orchestration pattern', context: 'task=1', confidence: 0.8 },
    ];
    mockSessionMemory.startSession.mockReturnValueOnce({ ok: true, value: pastLearnings });
    mockSessionMemory.searchLearnings.mockReturnValueOnce(pastLearnings);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantLearnings('run orchestration');

    expect(result).toContain('orchestration pattern');
    expect(result).toContain('0.8');
  });

  it('should fall back to highest-confidence learnings when search returns empty', () => {
    const pastLearnings = [
      { pattern: 'low confidence', context: 'ctx1', confidence: 0.3 },
      { pattern: 'high confidence', context: 'ctx2', confidence: 0.9 },
    ];
    mockSessionMemory.startSession.mockReturnValueOnce({ ok: true, value: pastLearnings });
    mockSessionMemory.searchLearnings.mockReturnValueOnce([]);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantLearnings('unrelated task');

    expect(result).toContain('high confidence');
    // High confidence should appear before low confidence
    const highIdx = result?.indexOf('high confidence') ?? -1;
    const lowIdx = result?.indexOf('low confidence') ?? -1;
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('should limit results to maxResults', () => {
    const pastLearnings = Array.from({ length: 10 }, (_, i) => ({
      pattern: `pattern ${String(i)}`,
      context: `ctx ${String(i)}`,
      confidence: 0.5 + i * 0.05,
    }));
    mockSessionMemory.startSession.mockReturnValueOnce({ ok: true, value: pastLearnings });
    mockSessionMemory.searchLearnings.mockReturnValueOnce(pastLearnings);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantLearnings('test', 2);

    const lines = result?.split('\n') ?? [];
    expect(lines.length).toBe(2);
  });
});

describe('getRelevantErrorHints', () => {
  it('should return undefined when no error solutions exist', () => {
    const manager = new ToolMemoryManager(createMockLogger());
    expect(manager.getRelevantErrorHints('code_expert')).toBeUndefined();
  });

  it('should return hints for matching role errors', () => {
    mockSessionMemory.getRecentErrorSolutions.mockReturnValueOnce([
      {
        error: 'Expert code_expert failed: timeout',
        solution: 'Increase timeout',
        filePattern: 'execute-expert',
      },
    ]);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantErrorHints('code_expert');

    expect(result).toContain('timeout');
    expect(result).toContain('Increase timeout');
  });

  it('should return undefined when no errors match the role', () => {
    mockSessionMemory.getRecentErrorSolutions.mockReturnValueOnce([
      { error: 'Unrelated error', solution: 'Fix something', filePattern: 'other-module' },
    ]);

    const manager = new ToolMemoryManager(createMockLogger());
    expect(manager.getRelevantErrorHints('code_expert')).toBeUndefined();
  });

  it('should limit results to maxResults', () => {
    const errors = Array.from({ length: 5 }, (_, i) => ({
      error: `Expert code_expert error ${String(i)}`,
      solution: `Fix ${String(i)}`,
      filePattern: 'execute-expert',
    }));
    mockSessionMemory.getRecentErrorSolutions.mockReturnValueOnce(errors);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantErrorHints('code_expert', 2);

    const lines = result?.split('\n') ?? [];
    expect(lines.length).toBe(2);
  });
});

describe('shutdownToolMemory', () => {
  it('should call endSession on the singleton', () => {
    getToolMemory();
    vi.clearAllMocks();
    mockSessionMemory.isSessionActive.mockReturnValue(true);

    shutdownToolMemory();

    expect(mockSessionMemory.endSession).toHaveBeenCalled();
  });

  it('should be safe to call multiple times', () => {
    shutdownToolMemory();
    shutdownToolMemory();
    // Should not throw
  });
});

// ============================================================================
// Phase 2: SQLite Backend Tests (AgenticMemory + AdaptiveMemory)
// ============================================================================

describe('ToolMemoryManager Phase 2 advanced memory', () => {
  it('should report advanced memory as unavailable when SQLite is not installed', () => {
    const manager = new ToolMemoryManager(createMockLogger());
    // SQLite is not installed in test environment, so advanced memory is unavailable
    // (initSqliteBackends fires async and will fail gracefully)
    expect(manager.isAdvancedMemoryAvailable()).toBe(false);
  });

  it('should return undefined from queryKnowledge when advanced memory is unavailable', async () => {
    const manager = new ToolMemoryManager(createMockLogger());
    const result = await manager.queryKnowledge('test query');
    expect(result).toBeUndefined();
  });

  it('should silently skip recordKnowledge when advanced memory is unavailable', async () => {
    const manager = new ToolMemoryManager(createMockLogger());
    // Should not throw
    await manager.recordKnowledge(
      'key',
      { data: 'test' },
      {
        importance: 'high',
        tags: ['test'],
      }
    );
  });

  it('should close SQLite backends on endSession', () => {
    const manager = new ToolMemoryManager(createMockLogger());
    // endSession should not throw even when backends are null
    manager.endSession();
  });
});

// ============================================================================
// Belief Memory Integration Tests
// ============================================================================

describe('ToolMemoryManager belief integration', () => {
  let manager: ToolMemoryManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ToolMemoryManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should record a belief without errors', async () => {
    await manager.recordBelief('routing', 'prefers', 'claude-for-code', 'high');
    // No exception thrown = success
  });

  it('should return undefined for beliefs with no matching subject', async () => {
    const result = await manager.getRelevantBeliefs('nonexistent-subject');
    expect(result).toBeUndefined();
  });

  it('should retrieve beliefs after recording', async () => {
    await manager.recordBelief('orchestration', 'requires', 'task-analysis', 'high');
    const result = await manager.getRelevantBeliefs('orchestration');
    expect(result).toBeDefined();
    expect(result).toContain('orchestration');
    expect(result).toContain('requires');
    expect(result).toContain('task-analysis');
  });

  it('should auto-create belief from high-confidence learning', async () => {
    manager.recordLearning({
      pattern: 'SQLite requires better-sqlite3',
      context: 'memory-backends',
      confidence: 0.9,
    });
    // Flush async belief creation microtask
    await vi.advanceTimersByTimeAsync(1);
    const beliefs = await manager.getRelevantBeliefs('memory-backends');
    expect(beliefs).toBeDefined();
    expect(beliefs).toContain('memory-backends');
  });

  it('should NOT create belief from low-confidence learning', async () => {
    manager.recordLearning({
      pattern: 'uncertain pattern',
      context: 'test-context',
      confidence: 0.5,
    });
    await vi.advanceTimersByTimeAsync(1);
    const beliefs = await manager.getRelevantBeliefs('test-context');
    expect(beliefs).toBeUndefined();
  });
});

describe('shutdownToolMemory releases the auto-decay timer (#5402)', () => {
  /**
   * The seam. `memory-decay.test.ts` proves `stopAutoDecay` clears the interval
   * and that the interval is unref'd; this proves `shutdownToolMemory` actually
   * CALLS it. Without this, deleting the `shutdownDecay()` line leaves every
   * other test green — dropping the reference and ending the session is all the
   * old assertions ever checked, while the timer and the manager it closes over
   * stay resident.
   *
   * Asserted on the call rather than on the live timer because the decay manager
   * is built inside an un-awaited async backend init that does not complete in
   * this environment — a timer-observing test would have passed vacuously here,
   * which is worse than not testing it.
   */
  it('calls shutdownDecay, not only endSession', () => {
    const stopSpy = vi.spyOn(ToolMemoryManager.prototype, 'shutdownDecay');
    const endSpy = vi.spyOn(ToolMemoryManager.prototype, 'endSession');

    getToolMemory();
    shutdownToolMemory();

    expect(stopSpy).toHaveBeenCalledTimes(1);
    // Pinned alongside so a future refactor cannot satisfy this test by
    // swapping one teardown step for the other.
    expect(endSpy).toHaveBeenCalledTimes(1);

    stopSpy.mockRestore();
    endSpy.mockRestore();
  });

  it('is a no-op when no shared instance exists', () => {
    shutdownToolMemory();
    expect(() => {
      shutdownToolMemory();
    }).not.toThrow();
  });
});

describe('decay config reaches MemoryDecayManager (#5097 finding 2)', () => {
  /**
   * Before this, `initDecayManager` passed a hardcoded `{}` so every knob in
   * `MemoryDecayConfig` was permanently `DEFAULT_DECAY_CONFIG`. These tests
   * pin both seams: the constructor option, and the singleton configuration
   * hook that `cli-server` calls with `config.memory` at startup.
   *
   * Values are chosen to differ from the defaults so identity cannot pass.
   */
  const ACTIVATED_LINE = 'MemoryDecayManager activated (Phase 5 #746)';

  function activatedLineFields(logger: ILogger): Record<string, unknown> | undefined {
    const call = vi.mocked(logger.info).mock.calls.find(([message]) => message === ACTIVATED_LINE);
    return call?.[1];
  }

  const NEVER_CALLED = 'defaults (configureToolMemory never called)';

  afterEach(() => {
    shutdownToolMemory();
  });

  it('constructs the manager with a non-default cap from the constructor option', async () => {
    const logger = createMockLogger();
    const manager = new ToolMemoryManager(logger, { decay: { agenticMaxEntries: 1234 } });
    await manager.awaitBackendInitialization();

    expect(MemoryDecayManager).toHaveBeenCalledWith(
      expect.objectContaining({ agenticMaxEntries: 1234 }),
      logger
    );
  });

  it('enabled: false from config is what the manager receives', async () => {
    const logger = createMockLogger();
    const manager = new ToolMemoryManager(logger, { decay: { enabled: false } });
    await manager.awaitBackendInitialization();

    expect(MemoryDecayManager).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      logger
    );
    // The effective value the manager holds is what gets logged.
    expect(activatedLineFields(logger)).toMatchObject({ enabled: false });
  });

  it('logs ONE startup line naming the effective values', async () => {
    const logger = createMockLogger();
    const manager = new ToolMemoryManager(logger, {
      decay: { agenticMaxEntries: 1234, decayIntervalMs: 5000 },
    });
    await manager.awaitBackendInitialization();

    const activatedCalls = vi
      .mocked(logger.info)
      .mock.calls.filter(([message]) => message === ACTIVATED_LINE);
    expect(activatedCalls).toHaveLength(1);
    expect(activatedLineFields(logger)).toEqual({
      ...DEFAULT_DECAY_CONFIG,
      agenticMaxEntries: 1234,
      decayIntervalMs: 5000,
      source: NEVER_CALLED,
    });
  });

  it('an explicitly undefined key does not clobber the default', async () => {
    // zod passes `enabled: undefined` through when a caller supplies it; a naive
    // spread would then overwrite `enabled: true` with undefined.
    const logger = createMockLogger();
    const manager = new ToolMemoryManager(logger, {
      decay: { enabled: undefined, agenticMaxEntries: 1234 },
    });
    await manager.awaitBackendInitialization();

    expect(MemoryDecayManager).toHaveBeenCalledWith({ agenticMaxEntries: 1234 }, logger);
    expect(activatedLineFields(logger)).toMatchObject({ enabled: true, agenticMaxEntries: 1234 });
  });

  it('unset config resolves to defaults and the startup line prints them', async () => {
    const logger = createMockLogger();
    const manager = new ToolMemoryManager(logger);
    await manager.awaitBackendInitialization();

    expect(MemoryDecayManager).toHaveBeenCalledWith({}, logger);
    expect(activatedLineFields(logger)).toEqual({ ...DEFAULT_DECAY_CONFIG, source: NEVER_CALLED });
  });

  describe('source of the effective values — the empty case named', () => {
    /**
     * A CLI path (composite-router / dev-pipeline / graph-executor via the
     * context retriever) builds the singleton without `configureToolMemory`
     * ever running. Defaults there are indistinguishable from "yaml said
     * default" unless the line says WHY they are defaults.
     */
    it('says configureToolMemory was never called when it was not', async () => {
      const logger = createMockLogger();
      const manager = getToolMemory(logger);
      await manager.awaitBackendInitialization();

      expect(manager.getDecayConfigSource()).toBe(NEVER_CALLED);
      expect(activatedLineFields(logger)).toMatchObject({ source: NEVER_CALLED });
    });

    it("says 'config' once configureToolMemory ran, even with an absent memory section", async () => {
      const logger = createMockLogger();
      configureToolMemory({ memoryConfig: undefined });
      const manager = getToolMemory(logger);
      await manager.awaitBackendInitialization();

      expect(manager.getDecayConfigSource()).toBe('config');
      expect(activatedLineFields(logger)).toMatchObject({
        ...DEFAULT_DECAY_CONFIG,
        source: 'config',
      });
    });

    it('shutdown forgets the configuration, so the next instance is honest about it', async () => {
      configureToolMemory({ memoryConfig: { decay: { agenticMaxEntries: 1234 } } });
      shutdownToolMemory();
      const logger = createMockLogger();
      const manager = getToolMemory(logger);
      await manager.awaitBackendInitialization();

      expect(MemoryDecayManager).toHaveBeenCalledWith({}, logger);
      expect(manager.getDecayConfigSource()).toBe(NEVER_CALLED);
    });
  });

  describe('configureToolMemory — the cli-server seam', () => {
    it('applies memory.decay to the singleton constructed afterwards', async () => {
      const logger = createMockLogger();
      const result = configureToolMemory({ memoryConfig: { decay: { agenticMaxEntries: 1234 } } });
      expect(result).toEqual({ applied: true });

      const manager = getToolMemory(logger);
      await manager.awaitBackendInitialization();

      expect(MemoryDecayManager).toHaveBeenCalledWith(
        expect.objectContaining({ agenticMaxEntries: 1234 }),
        logger
      );
    });

    it('reports applied: false (and does not retro-fit) when the singleton already exists', async () => {
      const logger = createMockLogger();
      const manager = getToolMemory(logger);
      await manager.awaitBackendInitialization();

      const result = configureToolMemory({
        memoryConfig: { decay: { agenticMaxEntries: 1234 } },
        logger,
      });
      expect(result).toEqual({
        applied: false,
        reason: 'tool memory already constructed; decay config not applied',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'Tool memory already constructed; decay config not applied',
        expect.anything()
      );
      // Even a later re-construction must not pick up the rejected config.
      shutdownToolMemory();
      const later = getToolMemory(logger);
      await later.awaitBackendInitialization();
      expect(MemoryDecayManager).toHaveBeenLastCalledWith({}, logger);
    });

    it('an absent memory section leaves the defaults in place', async () => {
      const logger = createMockLogger();
      expect(configureToolMemory({ memoryConfig: undefined })).toEqual({ applied: true });
      const manager = getToolMemory(logger);
      await manager.awaitBackendInitialization();
      expect(MemoryDecayManager).toHaveBeenCalledWith({}, logger);
    });
  });
});

// ============================================================================
// getSessionCounts — all three fields read the live session (#5858)
// ============================================================================

describe('ToolMemoryManager.getSessionCounts (#5858)', () => {
  it('reads learningsCount from the live session, like its two siblings', () => {
    // Was: the caller derived this count by asking getRelevantLearnings for a
    // rendered string and counting its lines, which a relevance slice capped
    // at 3. Three different lengths so no field can be a copy of another.
    mockSessionMemory.getCurrentSessionLearnings.mockReturnValue([{}, {}, {}, {}]);
    mockSessionMemory.getCurrentSessionTasks.mockReturnValue([{}, {}]);
    mockSessionMemory.getCurrentSessionErrors.mockReturnValue([{}, {}, {}, {}, {}, {}, {}]);

    const manager = new ToolMemoryManager(createMockLogger());

    expect(manager.getSessionCounts()).toEqual({
      learningsCount: 4,
      tasksCount: 2,
      errorsCount: 7,
    });
  });

  it('reports zero learnings for a session that recorded none', () => {
    // Pair test: 0 must still be reachable, and for the right reason.
    mockSessionMemory.getCurrentSessionLearnings.mockReturnValue([]);
    mockSessionMemory.getCurrentSessionTasks.mockReturnValue([{}]);
    mockSessionMemory.getCurrentSessionErrors.mockReturnValue([]);

    const manager = new ToolMemoryManager(createMockLogger());

    expect(manager.getSessionCounts().learningsCount).toBe(0);
    expect(manager.getSessionCounts().tasksCount).toBe(1);
  });
});
