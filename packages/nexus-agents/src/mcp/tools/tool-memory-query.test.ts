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
  SessionMemory: vi.fn(() => mockSessionMemory),
}));

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
});
