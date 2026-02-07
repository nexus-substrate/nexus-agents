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

vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    getRelevantLearnings: mockGetRelevantLearnings,
    getTypedMemoryStats: mockGetTypedMemoryStats,
    getMobiMemStats: mockGetMobiMemStats,
    getDecayStats: mockGetDecayStats,
    isAgenticMemoryAvailable: mockIsAgenticMemoryAvailable,
    isAdaptiveMemoryAvailable: mockIsAdaptiveMemoryAvailable,
    isMobiMemAvailable: mockIsMobiMemAvailable,
    isDecayManagerAvailable: mockIsDecayManagerAvailable,
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
        expect(result.data.includePromotion).toBe(true);
      }
    });

    it('should validate full input', () => {
      const input: MemoryStatsInput = {
        includeDecay: false,
        includePromotion: false,
      };
      const result = MemoryStatsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDecay).toBe(false);
        expect(result.data.includePromotion).toBe(false);
      }
    });

    it('should validate partial input', () => {
      const result = MemoryStatsInputSchema.safeParse({ includeDecay: false });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDecay).toBe(false);
        expect(result.data.includePromotion).toBe(true);
      }
    });

    it('should reject non-boolean includeDecay', () => {
      const result = MemoryStatsInputSchema.safeParse({ includeDecay: 'yes' });
      expect(result.success).toBe(false);
    });

    it('should reject non-boolean includePromotion', () => {
      const result = MemoryStatsInputSchema.safeParse({ includePromotion: 1 });
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

      // Defaults: no backends available
      mockGetRelevantLearnings.mockReturnValue(undefined);
      mockGetTypedMemoryStats.mockResolvedValue(undefined);
      mockGetMobiMemStats.mockReturnValue(undefined);
      mockGetDecayStats.mockReturnValue(undefined);
      mockIsAgenticMemoryAvailable.mockReturnValue(false);
      mockIsAdaptiveMemoryAvailable.mockReturnValue(false);
      mockIsMobiMemAvailable.mockReturnValue(false);
      mockIsDecayManagerAvailable.mockReturnValue(false);

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

    it('counts learnings from session memory', async () => {
      mockGetRelevantLearnings.mockReturnValue('- learning 1\n- learning 2\n- learning 3');

      const result = await registeredHandler({}, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.session.learningsCount).toBe(3);
    });
  });
});
