/**
 * Tests for KnnRoutingStage
 *
 * @module cli-adapters/routing/stages/knn-routing-stage.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KnnRoutingStage,
  createKnnRoutingStage,
  cosineSimilarity,
  extractKeywordVector,
} from './knn-routing-stage.js';
import type { RoutingContext } from '../router-stage.js';
import type { IRoutingMemory, ExperiencePattern } from '../../../context/routing-memory.js';

describe('KnnRoutingStage', () => {
  let stage: KnnRoutingStage;
  let mockMemory: IRoutingMemory;

  beforeEach(() => {
    mockMemory = createMockMemory([]);
    stage = new KnnRoutingStage(mockMemory);
  });

  describe('constructor', () => {
    it('creates stage with correct name and priority', () => {
      expect(stage.name).toBe('knn-routing');
      expect(stage.priority).toBe(38);
    });
  });

  describe('canHandle', () => {
    it('returns true when candidates remain', () => {
      expect(stage.canHandle(createContext('test task'))).toBe(true);
    });

    it('returns false when no candidates', () => {
      expect(stage.canHandle(createContext('test task', []))).toBe(false);
    });
  });

  describe('route', () => {
    it('returns cold-start signal when no experience', async () => {
      const result = await stage.route(createContext('implement a feature'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('knn:cold-start');
        expect(result.value.continuesPipeline).toBe(true);
      }
    });

    it('returns experience-matched when patterns exist', async () => {
      const patterns: ExperiencePattern[] = [
        makePattern('coding', ['claude'], 0.85, 3),
        makePattern('coding', ['codex'], 0.92, 5),
        makePattern('coding', ['claude'], 0.7, 2),
      ];
      mockMemory = createMockMemory(patterns);
      stage = new KnnRoutingStage(mockMemory);

      const result = await stage.route(createContext('implement a new function'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('knn:experience-matched');
      }
    });

    it('scores CLIs based on historical success rates', async () => {
      const patterns: ExperiencePattern[] = [
        makePattern('coding', ['codex'], 0.95, 10),
        makePattern('coding', ['claude'], 0.6, 8),
        makePattern('coding', ['gemini'], 0.75, 4),
      ];
      mockMemory = createMockMemory(patterns);
      stage = new KnnRoutingStage(mockMemory);

      const result = await stage.route(createContext('implement a code refactor'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        const codexScore = result.value.context.scores.get('codex') ?? 0;
        const claudeScore = result.value.context.scores.get('claude') ?? 0;
        // Codex has higher historical success → higher KNN score
        expect(codexScore).toBeGreaterThan(claudeScore);
      }
    });

    it('adds trace entry', async () => {
      const result = await stage.route(createContext('test task'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        const trace = result.value.context.trace.find((t) => t.stageName === 'knn-routing');
        expect(trace).toBeDefined();
        expect(trace?.action).toBe('score');
      }
    });

    it('handles multiple workflow types', async () => {
      const patterns: ExperiencePattern[] = [
        makePattern('coding', ['codex'], 0.9, 5),
        makePattern('debugging', ['claude'], 0.88, 4),
      ];
      mockMemory = createMockMemory(patterns);
      stage = new KnnRoutingStage(mockMemory);

      // Task matches both coding and debugging
      const result = await stage.route(createContext('debug and fix this code implementation'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('knn:experience-matched');
      }
    });
  });

  describe('recordOutcome', () => {
    it('records outcome without error', () => {
      expect(() => {
        stage.recordOutcome({
          selectedCli: 'claude',
          task: 'test',
          success: true,
          qualityScore: 0.9,
          latencyMs: 1000,
          tokensUsed: 500,
        });
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('returns initial stats', () => {
      const stats = stage.getStats();
      expect(stats['routingsCount']).toBe(0);
      expect(stats['matchCount']).toBe(0);
      expect(stats['hitRate']).toBe(0);
    });

    it('tracks routing count and hit rate', async () => {
      const patterns: ExperiencePattern[] = [
        makePattern('coding', ['codex'], 0.9, 5),
        makePattern('coding', ['claude'], 0.8, 3),
      ];
      mockMemory = createMockMemory(patterns);
      stage = new KnnRoutingStage(mockMemory);

      await stage.route(createContext('implement a function'));
      await stage.route(createContext('hello world'));

      const stats = stage.getStats();
      expect(stats['routingsCount']).toBe(2);
      expect(stats['matchCount']).toBe(1); // Only first has matches
    });
  });

  describe('createKnnRoutingStage', () => {
    it('creates stage with factory function', () => {
      const created = createKnnRoutingStage(mockMemory);
      expect(created).toBeInstanceOf(KnnRoutingStage);
    });

    it('passes config to factory function', () => {
      const created = createKnnRoutingStage(mockMemory, { k: 3 });
      const stats = created.getStats();
      const config = stats['config'] as Record<string, unknown>;
      expect(config['k']).toBe(3);
    });
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Map([['x', 1]]);
    const b = new Map([['y', 1]]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity(new Map(), new Map())).toBe(0);
  });

  it('returns value between 0 and 1 for partial overlap', () => {
    const a = new Map([
      ['x', 1],
      ['y', 1],
    ]);
    const b = new Map([
      ['x', 1],
      ['z', 1],
    ]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe('extractKeywordVector', () => {
  it('extracts coding keywords', () => {
    const vec = extractKeywordVector('implement a new function and refactor');
    expect(vec.get('coding')).toBeGreaterThan(0);
  });

  it('extracts multiple workflow types', () => {
    const vec = extractKeywordVector('review and test this code');
    expect(vec.has('review')).toBe(true);
    expect(vec.has('testing')).toBe(true);
  });

  it('returns empty for unrecognized content', () => {
    const vec = extractKeywordVector('hello world');
    expect(vec.size).toBe(0);
  });
});

// ============================================================================
// Helpers
// ============================================================================

function createContext(
  task: string,
  availableClis: Array<'claude' | 'gemini' | 'codex'> = ['claude', 'gemini', 'codex']
): RoutingContext {
  return {
    task,
    availableClis,
    scores: new Map(availableClis.map((c) => [c, 0])),
    filtered: new Map(),
    signals: [],
    trace: [],
    metadata: undefined,
  };
}

function makePattern(
  workflow: string,
  models: Array<'claude' | 'gemini' | 'codex'>,
  successRate: number,
  usageCount: number
): ExperiencePattern {
  return {
    workflow,
    modelSequence: models,
    successRate,
    avgDurationMs: 5000,
    usageCount,
  };
}

function createMockMemory(patterns: ExperiencePattern[]): IRoutingMemory {
  return {
    storePreference: vi.fn(),
    getPreferences: vi.fn().mockReturnValue([]),
    recordExperience: vi.fn(),
    getExperiencePatterns: vi
      .fn()
      .mockImplementation((workflow: string) => patterns.filter((p) => p.workflow === workflow)),
    cacheAction: vi.fn(),
    getCachedAction: vi.fn().mockReturnValue(undefined),
    getRecommendation: vi.fn().mockReturnValue(undefined),
    getStats: vi.fn().mockReturnValue({
      totalPreferences: 0,
      totalExperiences: patterns.length,
      cacheHits: 0,
      cacheMisses: 0,
      recommendationsMade: 0,
    }),
  };
}
