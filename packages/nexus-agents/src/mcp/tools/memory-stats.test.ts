/**
 * Tests for Memory Stats Tool
 *
 * Tests schema validation AND handler logic with mocked ToolMemoryManager.
 *
 * @module mcp/tools/memory-stats.test
 * (Source: Issue #856)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryStatsInputSchema,
  registerMemoryStatsTool,
  type MemoryStatsInput,
} from './memory-stats.js';

// Mock getToolMemory at module level
const mockGetRelevantLearnings = vi.fn();
const mockGetTypedMemoryStats = vi.fn();
const mockGetMobiMemStats = vi.fn();
const mockGetDecayStats = vi.fn();
const mockIsAgenticMemoryAvailable = vi.fn();
const mockIsAdaptiveMemoryAvailable = vi.fn();
const mockIsMobiMemAvailable = vi.fn();
const mockIsDecayManagerAvailable = vi.fn();
const mockGetBeliefCount = vi.fn();
const mockGetSessionCounts = vi.fn(() => ({ tasksCount: 0, errorsCount: 0 }));
const mockAwaitBackendInitialization = vi.fn((): Promise<void> => Promise.resolve());

vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    getRelevantLearnings: mockGetRelevantLearnings,
    getSessionCounts: mockGetSessionCounts,
    getTypedMemoryStats: mockGetTypedMemoryStats,
    getMobiMemStats: mockGetMobiMemStats,
    getDecayStats: mockGetDecayStats,
    isAgenticMemoryAvailable: mockIsAgenticMemoryAvailable,
    isAdaptiveMemoryAvailable: mockIsAdaptiveMemoryAvailable,
    isMobiMemAvailable: mockIsMobiMemAvailable,
    isDecayManagerAvailable: mockIsDecayManagerAvailable,
    getBeliefCount: mockGetBeliefCount,
    awaitBackendInitialization: mockAwaitBackendInitialization,
  }),
}));

// Mock nexus-memory registry so we can control the per-domain fan-out
// without instantiating real backends in this test.
const mockRegistryDomains = vi.fn<() => readonly string[]>();
const mockRegistryGet = vi.fn<(domain: string) => { stats(): Promise<unknown> } | undefined>();

vi.mock('nexus-memory', () => ({
  getMemoryRegistry: () => ({
    domains: mockRegistryDomains,
    get: mockRegistryGet,
  }),
}));

// ============================================================================
// Schema Tests
// ============================================================================

describe('memory-stats', () => {
  describe('MemoryStatsInputSchema', () => {
    it('should validate empty input with defaults', () => {
      const input = {};
      const result = MemoryStatsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDecay).toBe(true);
      }
    });

    it('should validate full input', () => {
      const input: MemoryStatsInput = {
        includeDecay: false,
      };
      const result = MemoryStatsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDecay).toBe(false);
      }
    });

    it('should validate partial input', () => {
      const result = MemoryStatsInputSchema.safeParse({ includeDecay: false });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDecay).toBe(false);
      }
    });

    it('should reject non-boolean includeDecay', () => {
      const result = MemoryStatsInputSchema.safeParse({ includeDecay: 'yes' });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // Handler Tests (Issue #856)
  // ============================================================================

  describe('handler logic', () => {
    type SdkCallback = (
      args: unknown,
      extra: unknown
    ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
    let registeredHandler: SdkCallback;

    beforeEach(() => {
      mockGetRelevantLearnings.mockReset();
      mockGetTypedMemoryStats.mockReset();
      mockGetMobiMemStats.mockReset();
      mockGetDecayStats.mockReset();
      mockIsAgenticMemoryAvailable.mockReset();
      mockIsAdaptiveMemoryAvailable.mockReset();
      mockIsMobiMemAvailable.mockReset();
      mockIsDecayManagerAvailable.mockReset();
      mockGetBeliefCount.mockReset();
      mockAwaitBackendInitialization.mockReset();
      mockAwaitBackendInitialization.mockResolvedValue(undefined);

      // Defaults: no backends available
      mockGetRelevantLearnings.mockReturnValue(undefined);
      mockGetTypedMemoryStats.mockResolvedValue(undefined);
      mockGetMobiMemStats.mockReturnValue(undefined);
      mockGetDecayStats.mockReturnValue(undefined);
      mockIsAgenticMemoryAvailable.mockReturnValue(false);
      mockIsAdaptiveMemoryAvailable.mockReturnValue(false);
      mockIsMobiMemAvailable.mockReturnValue(false);
      mockIsDecayManagerAvailable.mockReturnValue(false);
      mockGetBeliefCount.mockReturnValue(0);
      mockRegistryDomains.mockReturnValue([]);
      mockRegistryGet.mockReturnValue(undefined);

      const mockServer = {
        registerTool: (_name: string, _schema: unknown, handler: SdkCallback) => {
          registeredHandler = handler;
        },
      };
      const mockRateLimiter = {
        tryAcquire: () => true,
        getState: () => ({ remaining: 99, nextTokenMs: 0 }),
      };

      registerMemoryStatsTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        {
          rateLimiter:
            mockRateLimiter as unknown as import('../middleware/rate-limiter.js').RateLimiter,
        }
      );
    });

    it('returns stats with defaults', async () => {
      const result = await registeredHandler({}, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.backends.session).toBe(true);
      expect(parsed.backends.belief).toBe(true);
      expect(parsed.backends.agentic).toBe(false);
      expect(parsed.collectedAt).toBeDefined();
    });

    it('waits for in-flight initialization before reporting a backend absent (#5438)', async () => {
      // The live defect, reproduced: two identical calls 55s apart against the
      // SAME server returned agentic/adaptive/typed/mobimem/decay all `false`
      // and then all `true` (agentic holding 519 entries). The backends start
      // non-blocking at session start and this read path never awaited them, so
      // "still initializing" was reported as "unavailable" — indistinguishable
      // from a failed backend or a missing node:sqlite.
      let initialized = false;
      mockAwaitBackendInitialization.mockImplementation((): Promise<void> => {
        initialized = true;
        return Promise.resolve();
      });
      mockIsAgenticMemoryAvailable.mockImplementation(() => initialized);
      mockIsAdaptiveMemoryAvailable.mockImplementation(() => initialized);
      mockIsMobiMemAvailable.mockImplementation(() => initialized);
      mockIsDecayManagerAvailable.mockImplementation(() => initialized);

      const result = await registeredHandler({}, {});

      const parsed = JSON.parse(result.content[0]!.text);
      expect(mockAwaitBackendInitialization).toHaveBeenCalled();
      expect(parsed.backends.agentic).toBe(true);
      expect(parsed.backends.adaptive).toBe(true);
      expect(parsed.backends.mobimem).toBe(true);
      expect(parsed.backends.decay).toBe(true);
    });

    it('still reports false when initialization finished and the backend really is absent', async () => {
      // The other half: awaiting must not turn every backend into `true`. After
      // init completes, `false` is a true statement about the world, and this
      // is what keeps the fix from being a check that cannot fail.
      mockAwaitBackendInitialization.mockResolvedValue(undefined);
      mockIsAgenticMemoryAvailable.mockReturnValue(false);

      const result = await registeredHandler({}, {});

      const parsed = JSON.parse(result.content[0]!.text);
      expect(mockAwaitBackendInitialization).toHaveBeenCalled();
      expect(parsed.backends.agentic).toBe(false);
    });

    it('still reports stats when awaiting initialization rejects', async () => {
      // A failed init must not take the whole tool down: the caller still needs
      // the belief/session numbers and an honest `false` for the rest.
      mockAwaitBackendInitialization.mockRejectedValue(new Error('sqlite open failed'));

      const result = await registeredHandler({}, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.backends.agentic).toBe(false);
      expect(parsed.backends.session).toBe(true);
    });

    it('reports available backends', async () => {
      mockIsAgenticMemoryAvailable.mockReturnValue(true);
      mockIsMobiMemAvailable.mockReturnValue(true);
      mockIsDecayManagerAvailable.mockReturnValue(true);

      const result = await registeredHandler({}, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.backends.agentic).toBe(true);
      expect(parsed.backends.mobimem).toBe(true);
      expect(parsed.backends.decay).toBe(true);
    });

    it('includes typed memory stats when available', async () => {
      const typedStats = { total: 42, byType: { semantic: 20, episodic: 22 } };
      mockGetTypedMemoryStats.mockResolvedValue(typedStats);

      const result = await registeredHandler({}, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.typed).toEqual(typedStats);
      expect(parsed.backends.typed).toBe(true);
    });

    it('includes decay stats when requested', async () => {
      const decayStats = { totalDecayed: 5, lastRunAt: '2026-02-07' };
      mockGetDecayStats.mockReturnValue(decayStats);
      mockIsDecayManagerAvailable.mockReturnValue(true);

      const result = await registeredHandler({ includeDecay: true }, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.decay).toEqual(decayStats);
    });

    it('excludes decay stats when not requested', async () => {
      mockGetDecayStats.mockReturnValue({ totalDecayed: 5 });

      const result = await registeredHandler({ includeDecay: false }, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.decay).toBeNull();
    });

    it('returns validation error for bad input', async () => {
      const result = await registeredHandler({ includeDecay: 'not-a-boolean' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Validation error');
    });

    it('reports the session task and error counts, not hardcoded zeros (#5269)', async () => {
      // The discriminator. These two were initialised to 0 and never assigned,
      // so every prior test passed against a literal. Non-zero, and different
      // from each other, so neither a hardcoded 0 nor a copy of the other
      // survives.
      mockGetSessionCounts.mockReturnValue({ tasksCount: 7, errorsCount: 3 });

      const result = await registeredHandler({}, {});
      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as {
        session: { tasksCount: number; errorsCount: number };
      };

      expect(parsed.session.tasksCount).toBe(7);
      expect(parsed.session.errorsCount).toBe(3);
    });

    it('counts learnings from session memory', async () => {
      mockGetRelevantLearnings.mockReturnValue('- learning 1\n- learning 2\n- learning 3');

      const result = await registeredHandler({}, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.session.learningsCount).toBe(3);
    });

    // ========================================================================
    // Registry fan-out (Phase 5 of #2766 — see memory-stats.ts collectRegistryStats)
    // ========================================================================

    it('emits an empty registry array when no domain is attached', async () => {
      mockRegistryDomains.mockReturnValue([]);

      const result = await registeredHandler({}, {});

      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.registry).toEqual([]);
    });

    it('surfaces counts from every attached registry domain', async () => {
      mockRegistryDomains.mockReturnValue(['belief', 'agentic', 'outcomes']);
      mockRegistryGet.mockImplementation((domain) => {
        const counts: Record<string, number> = { belief: 5, agentic: 12, outcomes: 87 };
        return {
          stats: () =>
            Promise.resolve({
              domain,
              count: counts[domain],
              oldestTimestamp: null,
              newestTimestamp: null,
            }),
        };
      });

      const result = await registeredHandler({}, {});

      type RegistryRow = { domain: string; count: number | null; error: string | null };
      type ParsedResponse = { registry: readonly RegistryRow[] };
      const parsed = JSON.parse(result.content[0]!.text) as ParsedResponse;
      expect(parsed.registry).toHaveLength(3);
      const byDomain = new Map<string, { count: number | null; error: string | null }>(
        parsed.registry.map((r) => [r.domain, { count: r.count, error: r.error }])
      );
      expect(byDomain.get('belief')).toEqual({ count: 5, error: null });
      expect(byDomain.get('agentic')).toEqual({ count: 12, error: null });
      expect(byDomain.get('outcomes')).toEqual({ count: 87, error: null });
    });

    it('captures errors from a misbehaving backend without failing other domains', async () => {
      mockRegistryDomains.mockReturnValue(['belief', 'broken']);
      mockRegistryGet.mockImplementation((domain) => {
        if (domain === 'broken') {
          return { stats: () => Promise.reject(new Error('database unreachable')) };
        }
        return {
          stats: () =>
            Promise.resolve({ domain, count: 7, oldestTimestamp: null, newestTimestamp: null }),
        };
      });

      const result = await registeredHandler({}, {});

      type RegistryRow = { domain: string; count: number | null; error: string | null };
      type ParsedResponse = { registry: readonly RegistryRow[] };
      const parsed = JSON.parse(result.content[0]!.text) as ParsedResponse;
      const broken = parsed.registry.find((r) => r.domain === 'broken');
      const belief = parsed.registry.find((r) => r.domain === 'belief');
      expect(broken).toBeDefined();
      expect(belief).toBeDefined();
      expect(broken?.count).toBeNull();
      expect(broken?.error).toBe('database unreachable');
      expect(belief?.count).toBe(7);
      expect(belief?.error).toBeNull();
    });
  });
});
