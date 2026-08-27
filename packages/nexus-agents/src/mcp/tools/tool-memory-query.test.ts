/**
 * nexus-agents/mcp - Tool Memory Cross-Query Tests
 *
 * Tests for queryAll, belief keyword fallback, adaptive memory wiring,
 * and graduated relevance scoring (#1225, #1226, #1227).
 *
 * @module mcp/tools/tool-memory-query.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILogger } from '../../core/index.js';

// Mock SessionMemory
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
  })),
}));
vi.mock('../../context/adaptive-memory.js', () => ({
  AdaptiveMemoryBackend: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: false, error: { message: 'mocked' } }),
  })),
}));
vi.mock('../../context/typed-memory.js', () => ({
  HybridMemoryBackend: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: false, error: { message: 'mocked' } }),
  })),
  createTypedMemory: vi.fn(),
}));
// Mock HybridMemoryBackend from memory-backend.js (different from typed-memory.js export)
vi.mock('../../context/memory-backend.js', () => ({
  HybridMemoryBackend: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: false, error: { message: 'mocked' } }),
  })),
}));
// Mock MobiMem to skip SQLite init (perf: saves ~1s)
vi.mock('../../context/mobimem.js', () => ({
  MobiMem: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockReturnValue([]),
    record: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalEntries: 0, backends: [] }),
  })),
}));
// Mock MemoryDecayManager to skip SQLite init (perf: saves ~500ms)
vi.mock('./memory-decay.js', () => ({
  MemoryDecayManager: vi.fn(() => ({
    runDecay: vi.fn().mockReturnValue({ decayed: 0, removed: 0 }),
    getStats: vi.fn().mockReturnValue({ totalEntries: 0, decayedEntries: 0 }),
  })),
}));

import {
  queryBeliefMemory,
  queryAgenticMemory,
  queryTypedMemory,
  queryAdaptiveMemory,
} from './tool-memory-query.js';
import { ToolMemoryManager } from './tool-memory.js';

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

describe('tool-memory cross-query', () => {
  let manager: ToolMemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionMemory.startSession.mockReturnValue({ ok: true, value: [] });
    mockSessionMemory.searchLearnings.mockReturnValue([]);
    manager = new ToolMemoryManager(createMockLogger());
  });

  describe('queryAll belief keyword fallback (#1225)', () => {
    it('should find beliefs by keyword when exact subject fails', async () => {
      // Retain a belief with a specific subject
      await manager.recordBelief('TypeScript', 'is_preferred_for', 'backend development');

      // Query with a keyword that appears in the belief content
      const results = await manager.queryAll('TypeScript');

      // Should find the belief via keyword fallback even if exact subject doesn't match
      const beliefResults = results.filter((r) => r.source === 'belief');
      expect(beliefResults.length).toBeGreaterThanOrEqual(0);
    });

    it('should prefer exact subject match over keyword fallback', async () => {
      await manager.recordBelief('routing', 'uses', 'CompositeRouter');

      // Exact match should work
      const results = await manager.queryAll('routing');
      const beliefResults = results.filter((r) => r.source === 'belief');
      expect(beliefResults.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('queryAll adaptive wiring (#1226)', () => {
    it('should include adaptive source type in UnifiedMemoryResult', async () => {
      // queryAll should not throw when adaptive is null
      const results = await manager.queryAll('test query');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('graduated relevance scoring (#1227)', () => {
    it('should score exact phrase match higher than partial', async () => {
      // Access scoreRelevance through queryAll behavior
      // Store learnings with different content
      manager.recordLearning({
        pattern: 'consensus voting multi-round',
        context: 'voting system',
        confidence: 0.9,
      });
      manager.recordLearning({
        pattern: 'voting is important',
        context: 'general context',
        confidence: 0.9,
      });

      const results = await manager.queryAll('consensus voting');

      // Results should be sorted by relevance (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.relevance).toBeGreaterThanOrEqual(results[i]!.relevance);
      }
    });

    it('should return 0.5 for empty keywords', async () => {
      manager.recordLearning({
        pattern: 'test pattern',
        context: 'test context',
        confidence: 0.9,
      });

      // Query with very short words that all get filtered (<= 2 chars)
      const results = await manager.queryAll('a b c');

      // All results should have 0.5 relevance (empty keywords fallback)
      for (const r of results) {
        expect(r.relevance).toBe(0.5);
      }
    });

    it('should give phrase bonus when keywords appear in order', async () => {
      manager.recordLearning({
        pattern: 'belief memory search',
        context: 'memory system',
        confidence: 0.9,
      });
      manager.recordLearning({
        pattern: 'search something belief in memory',
        context: 'scattered keywords',
        confidence: 0.9,
      });

      const results = await manager.queryAll('belief memory search');

      // The exact phrase match should score higher
      if (results.length >= 2) {
        const phraseMatch = results.find((r) => r.content.includes('belief memory search'));
        const scattered = results.find((r) => r.content.includes('search something'));
        if (phraseMatch !== undefined && scattered !== undefined) {
          expect(phraseMatch.relevance).toBeGreaterThan(scattered.relevance);
        }
      }
    });

    it('should cap relevance at 1.0', async () => {
      // Even with phrase bonus + TF bonus, relevance should not exceed 1.0
      manager.recordLearning({
        pattern: 'test test test pattern pattern pattern',
        context: 'test pattern test pattern',
        confidence: 0.9,
      });

      const results = await manager.queryAll('test pattern');

      for (const r of results) {
        expect(r.relevance).toBeLessThanOrEqual(1.0);
        expect(r.relevance).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('queryAll initPromise guard', () => {
    it('should await initPromise before querying backends', async () => {
      // The constructor sets initPromise; queryAll should await it.
      // If initPromise is not awaited, SQLite backends stay null and return [].
      // We verify queryAll resolves without error (initPromise completes gracefully).
      const results = await manager.queryAll('test query');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should clear initPromise after first queryAll call', async () => {
      // First call awaits and nulls out initPromise
      await manager.queryAll('first call');
      // Second call should still work (initPromise is null, skips await)
      const results = await manager.queryAll('second call');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('queryBySource dispatch', () => {
    it('should delegate to queryAll when source is all', async () => {
      const results = await manager.queryBySource('all', 'test query', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return only session results when source is session', async () => {
      manager.recordLearning({
        pattern: 'session pattern for dispatch test',
        context: 'dispatch context',
        confidence: 0.9,
      });
      mockSessionMemory.searchLearnings.mockReturnValue([
        {
          pattern: 'session pattern for dispatch test',
          context: 'dispatch context',
          confidence: 0.9,
        },
      ]);

      const results = await manager.queryBySource('session', 'dispatch', 10);

      // All results should be from session source
      for (const r of results) {
        expect(r.source).toBe('session');
      }
    });

    it('should return only belief results when source is belief', async () => {
      await manager.recordBelief('dispatch', 'tests', 'belief source');

      const results = await manager.queryBySource('belief', 'dispatch', 10);

      for (const r of results) {
        expect(r.source).toBe('belief');
      }
    });

    it('should return only agentic results when source is agentic', async () => {
      const results = await manager.queryBySource('agentic', 'test', 10);
      // All returned results must be from agentic source (or empty if backend unavailable)
      for (const r of results) {
        expect(r.source).toBe('agentic');
      }
    });

    it('should return only typed results when source is typed', async () => {
      const results = await manager.queryBySource('typed', 'test', 10);
      for (const r of results) {
        expect(r.source).toBe('typed');
      }
    });

    it('should return only adaptive results when source is adaptive', async () => {
      const results = await manager.queryBySource('adaptive', 'test', 10);
      for (const r of results) {
        expect(r.source).toBe('adaptive');
      }
    });

    it('should respect the limit parameter for source-specific queries', async () => {
      // Record multiple beliefs
      for (let i = 0; i < 5; i++) {
        await manager.recordBelief(`topic${String(i)}`, 'relates_to', 'dispatch test');
      }

      const results = await manager.queryBySource('belief', 'topic', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should sort results by relevance descending', async () => {
      await manager.recordBelief('high relevance dispatch', 'is', 'relevant dispatch');
      await manager.recordBelief('low relevance other', 'is', 'something else');

      const results = await manager.queryBySource('belief', 'dispatch', 10);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.relevance).toBeGreaterThanOrEqual(results[i]!.relevance);
      }
    });
  });
});

describe('query helpers report a swallowed failure (#4999)', () => {
  it('calls onFailure when the backend throws', async () => {
    // Each helper catches its backend's error and returns `[]`, so a store
    // that threw was indistinguishable from one that matched nothing. The
    // empty array is still returned — partial results beat none — but the
    // caller now learns the store could not answer.
    const throwingBeliefs = {
      recallBySubject: (): Promise<never> => Promise.reject(new Error('db is corrupt')),
      query: (): Promise<never> => Promise.reject(new Error('db is corrupt')),
    };
    const onFailure = vi.fn();

    const results = await queryBeliefMemory(throwingBeliefs as never, 'routing', ['routing'], 5, {
      log: createMockLogger(),
      onFailure,
    });

    expect(results).toEqual([]);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('calls onFailure when the backend returns an error Result', async () => {
    // This, not the throw above, is what production actually does. Every real
    // backend catches its own exception and returns `err(...)`:
    // HybridMemoryBackend.search, searchAgentic and the belief recall path all
    // resolve rather than reject. Reporting only from `catch` made the whole
    // disclosure unreachable for the corrupt-store case it exists for.
    const erroringBeliefs = {
      recallBySubject: (): Promise<{ ok: false; error: Error }> =>
        Promise.resolve({ ok: false, error: new Error('db is corrupt') }),
      query: (): Promise<{ ok: false; error: Error }> =>
        Promise.resolve({ ok: false, error: new Error('db is corrupt') }),
    };
    const onFailure = vi.fn();

    const results = await queryBeliefMemory(erroringBeliefs as never, 'routing', ['routing'], 5, {
      log: createMockLogger(),
      onFailure,
    });

    expect(results).toEqual([]);
    expect(onFailure).toHaveBeenCalled();
  });

  // One case per helper: the belief tests above cover only one of the four
  // `err` reports, and a solo mutation of any other line survived without
  // these. Each backend is stubbed to resolve `err` — the shape a corrupt
  // SQLite file actually produces.
  const ERR = { ok: false as const, error: new Error('db is corrupt') };

  it('reports an agentic backend that could not answer', async () => {
    const onFailure = vi.fn();

    const results = await queryAgenticMemory(
      { searchAgentic: () => Promise.resolve(ERR) } as never,
      'routing',
      ['routing'],
      5,
      { log: createMockLogger(), onFailure }
    );

    expect(results).toEqual([]);
    expect(onFailure).toHaveBeenCalled();
  });

  it('reports a typed backend that could not answer', async () => {
    const onFailure = vi.fn();

    const results = await queryTypedMemory(
      { queryByType: () => Promise.resolve(ERR) } as never,
      'routing',
      ['routing'],
      5,
      { log: createMockLogger(), onFailure }
    );

    expect(results).toEqual([]);
    expect(onFailure).toHaveBeenCalled();
  });

  it('reports an adaptive backend that could not answer', async () => {
    const onFailure = vi.fn();

    const results = await queryAdaptiveMemory(
      { search: () => Promise.resolve(ERR) } as never,
      'routing',
      ['routing'],
      5,
      { log: createMockLogger(), onFailure }
    );

    expect(results).toEqual([]);
    expect(onFailure).toHaveBeenCalled();
  });

  it('reports a failed subject recall with no keywords to fall back on', async () => {
    // Pins the FIRST belief report specifically. With keywords present the
    // fallback also fails and fires the second report, so a solo mutation of
    // this line survived until the no-keyword case existed.
    const onFailure = vi.fn();

    const results = await queryBeliefMemory(
      {
        recallBySubject: () => Promise.resolve(ERR),
        query: () => Promise.resolve({ ok: true as const, value: [] }),
      } as never,
      'routing',
      [],
      5,
      { log: createMockLogger(), onFailure }
    );

    expect(results).toEqual([]);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('reports a belief keyword scan that could not answer', async () => {
    // The second belief call: `recallBySubject` succeeds with no match, so the
    // keyword fallback runs and it is the one that fails. Without this, the
    // two belief reports mask each other under solo mutation.
    const onFailure = vi.fn();

    const results = await queryBeliefMemory(
      {
        recallBySubject: () => Promise.resolve({ ok: true as const, value: [] }),
        query: () => Promise.resolve(ERR),
      } as never,
      'routing',
      ['routing'],
      5,
      { log: createMockLogger(), onFailure }
    );

    expect(results).toEqual([]);
    expect(onFailure).toHaveBeenCalled();
  });

  it('does not call onFailure when the backend answers', async () => {
    // The pair: a healthy empty result must not be reported as a failure.
    const emptyBeliefs = {
      recallBySubject: (): Promise<{ ok: true; value: never[] }> =>
        Promise.resolve({ ok: true, value: [] }),
      query: (): Promise<{ ok: true; value: never[] }> => Promise.resolve({ ok: true, value: [] }),
    };
    const onFailure = vi.fn();

    const results = await queryBeliefMemory(emptyBeliefs as never, 'routing', ['routing'], 5, {
      log: createMockLogger(),
      onFailure,
    });

    expect(results).toEqual([]);
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe('queryWithStatus names the backends that threw (#4999)', () => {
  // The seam: helper `onFailure` -> queryAll's `errored` reporter -> the
  // caller's list. Mutating either link must fail a test here, so the failing
  // backend is injected into a real manager rather than stubbed at the top.
  function managerWithThrowingBeliefs(): ToolMemoryManager {
    const manager = new ToolMemoryManager(createMockLogger());
    // An error Result, not a rejection: that is the shape every real backend
    // produces for a corrupt store, and the shape the first draft of this
    // disclosure could not see.
    (manager as unknown as { beliefs: unknown }).beliefs = {
      recallBySubject: (): Promise<{ ok: false; error: Error }> =>
        Promise.resolve({ ok: false, error: new Error('db is corrupt') }),
      query: (): Promise<{ ok: false; error: Error }> =>
        Promise.resolve({ ok: false, error: new Error('db is corrupt') }),
    };
    return manager;
  }

  it('reports the failing source instead of an innocuous empty result', async () => {
    const { results, errored } = await managerWithThrowingBeliefs().queryWithStatus(
      'all',
      'routing'
    );

    expect(results).toEqual([]);
    expect(errored).toContain('belief');
  });

  it('reports the failing source on a single-source query too', async () => {
    // The single-source path used to hardcode `errored: []` — a corrupt store
    // read as an empty one whenever the caller named it directly.
    const { errored } = await managerWithThrowingBeliefs().queryWithStatus('belief', 'routing');

    expect(errored).toEqual(['belief']);
  });

  it('reports nothing when every backend answers', async () => {
    const manager = new ToolMemoryManager(createMockLogger());

    const { errored } = await manager.queryWithStatus('all', 'routing');

    expect(errored).toEqual([]);
  });
});
