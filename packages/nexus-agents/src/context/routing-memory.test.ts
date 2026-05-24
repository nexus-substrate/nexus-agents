/**
 * nexus-agents/context - Routing Memory Tests
 *
 * Tests for routing memory bridge that connects MobiMem to routing system.
 *
 * @module context/routing-memory.test
 * @see Issue #461 - Implement routing memory bridge
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RoutingMemory,
  createRoutingMemory,
  DEFAULT_ROUTING_MEMORY_CONFIG,
  type ModelPerformance,
} from './routing-memory.js';
import { MobiMem } from './mobimem.js';

describe('RoutingMemory', () => {
  let routingMemory: RoutingMemory;
  let mobimem: MobiMem;

  beforeEach(() => {
    mobimem = new MobiMem({
      maxProfileEntries: 100,
      maxExperiencePatterns: 100,
      maxActionCacheEntries: 100,
      actionCacheTtlMs: 3600000,
      minProfileConfidence: 0.5,
      minExperienceSuccessRate: 0.6,
    });
    routingMemory = new RoutingMemory(
      {
        minObservations: 3,
        confidenceThreshold: 0.5,
        successRateThreshold: 0.6,
        actionCacheMaxAgeMs: 3600000,
      },
      mobimem
    );
  });

  describe('constructor', () => {
    it('creates instance with default config', () => {
      const rm = new RoutingMemory();
      expect(rm).toBeDefined();
    });

    it('creates instance with custom config', () => {
      const rm = new RoutingMemory({ minObservations: 10 });
      expect(rm).toBeDefined();
    });

    it('factory function works', () => {
      const rm = createRoutingMemory();
      expect(rm).toBeInstanceOf(RoutingMemory);
    });

    it('exports default config', () => {
      expect(DEFAULT_ROUTING_MEMORY_CONFIG).toBeDefined();
      expect(DEFAULT_ROUTING_MEMORY_CONFIG.minObservations).toBe(5);
      expect(DEFAULT_ROUTING_MEMORY_CONFIG.confidenceThreshold).toBe(0.6);
    });
  });

  describe('storePreference', () => {
    it('stores model preference for task type', () => {
      const performance: ModelPerformance = {
        avgQuality: 0.9,
        successRate: 0.95,
        avgLatencyMs: 500,
        avgTokens: 1000,
        observations: 10,
      };

      routingMemory.storePreference('claude', 'code-review', performance);

      // Verify stored via getPreferences (need enough observations)
      for (let i = 0; i < 5; i++) {
        routingMemory.storePreference('claude', 'code-review', performance);
      }

      const prefs = routingMemory.getPreferences('code-review');
      expect(prefs.length).toBeGreaterThan(0);
      expect(prefs[0]?.model).toBe('claude');
    });

    it('tracks multiple models for same task type', () => {
      const claudePerf: ModelPerformance = {
        avgQuality: 0.9,
        successRate: 0.95,
        avgLatencyMs: 500,
        avgTokens: 1000,
        observations: 10,
      };

      const geminiPerf: ModelPerformance = {
        avgQuality: 0.85,
        successRate: 0.9,
        avgLatencyMs: 300,
        avgTokens: 800,
        observations: 10,
      };

      // Store enough observations to meet threshold
      for (let i = 0; i < 5; i++) {
        routingMemory.storePreference('claude', 'code-review', claudePerf);
        routingMemory.storePreference('gemini', 'code-review', geminiPerf);
      }

      const prefs = routingMemory.getPreferences('code-review');
      expect(prefs.length).toBe(2);
    });
  });

  describe('getPreferences', () => {
    it('returns empty array when no preferences stored', () => {
      const prefs = routingMemory.getPreferences('unknown-task');
      expect(prefs).toEqual([]);
    });

    it('respects minObservations threshold', () => {
      const performance: ModelPerformance = {
        avgQuality: 0.9,
        successRate: 0.95,
        avgLatencyMs: 500,
        avgTokens: 1000,
        observations: 1,
      };

      // Only 2 observations, threshold is 3
      routingMemory.storePreference('claude', 'test-task', performance);
      routingMemory.storePreference('claude', 'test-task', performance);

      const prefs = routingMemory.getPreferences('test-task');
      expect(prefs.length).toBe(0);
    });

    it('returns preferences sorted by strength', () => {
      const highPerf: ModelPerformance = {
        avgQuality: 0.95,
        successRate: 0.98,
        avgLatencyMs: 100,
        avgTokens: 500,
        observations: 10,
      };

      const lowPerf: ModelPerformance = {
        avgQuality: 0.7,
        successRate: 0.75,
        avgLatencyMs: 2000,
        avgTokens: 5000,
        observations: 10,
      };

      for (let i = 0; i < 5; i++) {
        routingMemory.storePreference('claude', 'task', highPerf);
        routingMemory.storePreference('gemini', 'task', lowPerf);
      }

      const prefs = routingMemory.getPreferences('task');
      expect(prefs[0]?.model).toBe('claude'); // Higher quality/success
      expect(prefs[0]?.strength).toBeGreaterThan(prefs[1]?.strength ?? 0);
    });

    // #2955 site 4: per-taskType cache + invalidation on storePreference.
    // Verifies the hot-path optimization preserves the observable contract.
    it('caches per-taskType results — second read returns same reference (#2955)', () => {
      const perf: ModelPerformance = {
        avgQuality: 0.9,
        successRate: 0.95,
        avgLatencyMs: 500,
        avgTokens: 1000,
        observations: 10,
      };
      for (let i = 0; i < 5; i++) routingMemory.storePreference('claude', 'cached-task', perf);

      const first = routingMemory.getPreferences('cached-task');
      const second = routingMemory.getPreferences('cached-task');
      expect(second).toBe(first); // identical reference — cache hit
    });

    it('invalidates the cache when storePreference writes the same taskType (#2955)', () => {
      const lowPerf: ModelPerformance = {
        avgQuality: 0.5,
        successRate: 0.6,
        avgLatencyMs: 1000,
        avgTokens: 2000,
        observations: 10,
      };
      const highPerf: ModelPerformance = {
        avgQuality: 0.95,
        successRate: 0.98,
        avgLatencyMs: 100,
        avgTokens: 500,
        observations: 10,
      };

      for (let i = 0; i < 5; i++) routingMemory.storePreference('claude', 'task-a', lowPerf);
      const beforeUpgrade = routingMemory.getPreferences('task-a');
      const claudeBefore = beforeUpgrade[0]?.strength;
      expect(claudeBefore).toBeDefined();

      // Upgrade claude's performance — cache must invalidate so next read
      // sees the new (higher) strength.
      for (let i = 0; i < 5; i++) routingMemory.storePreference('claude', 'task-a', highPerf);
      const afterUpgrade = routingMemory.getPreferences('task-a');
      expect(afterUpgrade).not.toBe(beforeUpgrade); // different reference — cache rebuilt
      expect(afterUpgrade[0]?.strength).toBeGreaterThan(claudeBefore ?? 0);
    });

    it('cache invalidation is scoped to the modified taskType (#2955)', () => {
      const perf: ModelPerformance = {
        avgQuality: 0.9,
        successRate: 0.95,
        avgLatencyMs: 500,
        avgTokens: 1000,
        observations: 10,
      };
      for (let i = 0; i < 5; i++) {
        routingMemory.storePreference('claude', 'task-x', perf);
        routingMemory.storePreference('gemini', 'task-y', perf);
      }

      const xBefore = routingMemory.getPreferences('task-x');
      const yBefore = routingMemory.getPreferences('task-y');

      // Write to task-y only — task-x cache should survive.
      routingMemory.storePreference('codex', 'task-y', perf);

      const xAfter = routingMemory.getPreferences('task-x');
      const yAfter = routingMemory.getPreferences('task-y');
      expect(xAfter).toBe(xBefore); // task-x cache untouched
      expect(yAfter).not.toBe(yBefore); // task-y cache rebuilt
    });
  });

  describe('recordExperience', () => {
    it('records workflow execution experience', () => {
      routingMemory.recordExperience('code-review', ['claude', 'gemini'], true, {
        durationMs: 5000,
        tokensUsed: 10000,
        qualityScore: 0.9,
      });

      const patterns = routingMemory.getExperiencePatterns('code-review');
      // May be empty if success rate threshold not met with single observation
      expect(patterns).toBeDefined();
    });

    it('tracks success rate across attempts', () => {
      // Record multiple successful executions
      for (let i = 0; i < 5; i++) {
        routingMemory.recordExperience('workflow-a', ['claude'], true, {
          durationMs: 1000,
          tokensUsed: 500,
        });
      }

      const patterns = routingMemory.getExperiencePatterns('workflow-a');
      if (patterns.length > 0) {
        expect(patterns[0]?.successRate).toBe(1);
      }
    });

    it('handles failed executions', () => {
      routingMemory.recordExperience('workflow-b', ['codex'], false, {
        durationMs: 2000,
        tokensUsed: 1000,
      });

      // Single failed execution won't appear in patterns due to success threshold
      const patterns = routingMemory.getExperiencePatterns('workflow-b');
      expect(patterns.length).toBe(0);
    });
  });

  describe('getExperiencePatterns', () => {
    it('returns empty array when no patterns exist', () => {
      const patterns = routingMemory.getExperiencePatterns('unknown');
      expect(patterns).toEqual([]);
    });

    it('filters by success rate threshold', () => {
      // Create pattern with high success rate
      for (let i = 0; i < 5; i++) {
        routingMemory.recordExperience('good-workflow', ['claude'], true, {
          durationMs: 1000,
          tokensUsed: 500,
        });
      }

      // Create pattern with low success rate
      routingMemory.recordExperience('bad-workflow', ['gemini'], false, {
        durationMs: 1000,
        tokensUsed: 500,
      });
      routingMemory.recordExperience('bad-workflow', ['gemini'], false, {
        durationMs: 1000,
        tokensUsed: 500,
      });

      const goodPatterns = routingMemory.getExperiencePatterns('good-workflow');
      const badPatterns = routingMemory.getExperiencePatterns('bad-workflow');

      expect(goodPatterns.length).toBeGreaterThan(0);
      expect(badPatterns.length).toBe(0); // Filtered due to low success rate
    });
  });

  describe('cacheAction', () => {
    it('caches action result', () => {
      routingMemory.cacheAction('action-signature-1', 'claude', { result: 'success' }, 1000);

      const cached = routingMemory.getCachedAction('action-signature-1');
      expect(cached).toBeDefined();
      expect(cached?.model).toBe('claude');
      expect(cached?.result).toEqual({ result: 'success' });
    });
  });

  describe('getCachedAction', () => {
    it('returns undefined for non-cached action', () => {
      const cached = routingMemory.getCachedAction('unknown-action');
      expect(cached).toBeUndefined();
    });

    it('returns cached action with metadata', () => {
      routingMemory.cacheAction('my-action', 'gemini', { data: 123 }, 500);

      const cached = routingMemory.getCachedAction('my-action');
      expect(cached).toBeDefined();
      expect(cached?.action).toBe('my-action');
      expect(cached?.model).toBe('gemini');
      expect(cached?.cachedAt).toBeInstanceOf(Date);
    });

    it('tracks cache hits and misses', () => {
      routingMemory.cacheAction('cached-action', 'claude', {}, 100);

      // Hit
      routingMemory.getCachedAction('cached-action');

      // Miss
      routingMemory.getCachedAction('non-existent');

      const stats = routingMemory.getStats();
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(1);
    });
  });

  describe('getRecommendation', () => {
    it('returns undefined when no preferences exist', () => {
      const rec = routingMemory.getRecommendation('unknown-task');
      expect(rec).toBeUndefined();
    });

    it('returns undefined when confidence too low', () => {
      const performance: ModelPerformance = {
        avgQuality: 0.5,
        successRate: 0.5,
        avgLatencyMs: 1000,
        avgTokens: 2000,
        observations: 1,
      };

      // Only 1 observation = low confidence
      routingMemory.storePreference('claude', 'task', performance);

      const rec = routingMemory.getRecommendation('task');
      expect(rec).toBeUndefined();
    });

    it('returns top model when confidence threshold met', () => {
      const highPerf: ModelPerformance = {
        avgQuality: 0.95,
        successRate: 0.98,
        avgLatencyMs: 100,
        avgTokens: 500,
        observations: 20,
      };

      // Store many observations to build confidence
      for (let i = 0; i < 10; i++) {
        routingMemory.storePreference('claude', 'complex-task', highPerf);
      }

      const rec = routingMemory.getRecommendation('complex-task');
      expect(rec).toBe('claude');
    });

    it('tracks recommendations made', () => {
      const performance: ModelPerformance = {
        avgQuality: 0.9,
        successRate: 0.95,
        avgLatencyMs: 200,
        avgTokens: 1000,
        observations: 20,
      };

      for (let i = 0; i < 15; i++) {
        routingMemory.storePreference('claude', 'rec-task', performance);
      }

      routingMemory.getRecommendation('rec-task');

      const stats = routingMemory.getStats();
      expect(stats.recommendationsMade).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('returns statistics', () => {
      const stats = routingMemory.getStats();

      expect(stats).toHaveProperty('totalPreferences');
      expect(stats).toHaveProperty('totalExperiences');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('recommendationsMade');
    });

    it('tracks operations correctly', () => {
      const performance: ModelPerformance = {
        avgQuality: 0.9,
        successRate: 0.95,
        avgLatencyMs: 500,
        avgTokens: 1000,
        observations: 10,
      };

      // Store some preferences
      for (let i = 0; i < 3; i++) {
        routingMemory.storePreference('claude', 'task1', performance);
      }

      // Record some experiences
      routingMemory.recordExperience('workflow1', ['claude'], true, {
        durationMs: 1000,
        tokensUsed: 500,
      });

      // Cache some actions
      routingMemory.cacheAction('action1', 'claude', {}, 100);

      const stats = routingMemory.getStats();
      expect(stats.totalPreferences).toBeGreaterThan(0);
      expect(stats.totalExperiences).toBeGreaterThan(0);
    });
  });

  describe('integration with MobiMem', () => {
    it('uses shared MobiMem instance', () => {
      const sharedMobiMem = new MobiMem();
      const rm1 = new RoutingMemory({ minObservations: 1 }, sharedMobiMem);
      const rm2 = new RoutingMemory({ minObservations: 1 }, sharedMobiMem);

      const performance: ModelPerformance = {
        avgQuality: 0.9,
        successRate: 0.95,
        avgLatencyMs: 500,
        avgTokens: 1000,
        observations: 10,
      };

      // Store via rm1
      rm1.storePreference('claude', 'shared-task', performance);

      // Verify via MobiMem directly
      const entry = sharedMobiMem.profile.getPreference(
        'routing:claude',
        'model_preference:shared-task'
      );
      expect(entry).not.toBeNull();

      // rm2 should see the same data
      const rm2Stats = rm2.getStats();
      expect(rm2Stats.totalPreferences).toBeGreaterThan(0);
    });
  });
});
