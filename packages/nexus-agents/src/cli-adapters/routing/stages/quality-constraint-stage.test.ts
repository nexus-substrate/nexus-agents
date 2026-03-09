/**
 * Tests for QualityConstraintStage
 *
 * @module cli-adapters/routing/stages/quality-constraint-stage.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QualityConstraintStage,
  createQualityConstraintStage,
  resetQualityProfileCache,
} from './quality-constraint-stage.js';
import type { RoutingContext } from '../router-stage.js';

describe('QualityConstraintStage', () => {
  let stage: QualityConstraintStage;

  beforeEach(() => {
    resetQualityProfileCache();
    stage = new QualityConstraintStage();
  });

  describe('constructor', () => {
    it('creates stage with default config', () => {
      expect(stage.name).toBe('quality-constraint');
      expect(stage.priority).toBe(75);
    });

    it('accepts custom config', () => {
      const custom = new QualityConstraintStage({ minQuality: 0.9 });
      const stats = custom.getStats();
      expect(stats['config']).toEqual(expect.objectContaining({ minQuality: 0.9 }));
    });
  });

  describe('canHandle', () => {
    it('returns true when candidates remain', () => {
      const ctx = createContext('test task');
      expect(stage.canHandle(ctx)).toBe(true);
    });

    it('returns false when no candidates', () => {
      const ctx = createContext('test task', []);
      expect(stage.canHandle(ctx)).toBe(false);
    });
  });

  describe('route', () => {
    it('passes all candidates with default config', async () => {
      const ctx = createContext('test task');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('quality:meets-constraints');
        expect(result.value.continuesPipeline).toBe(true);
      }
    });

    it('filters low quality candidates', async () => {
      // Derived from registry: claude=0.95, gemini=0.95, codex=1.0
      // At minQuality=0.96, only codex (1.0) passes
      const strictStage = new QualityConstraintStage({ minQuality: 0.96 });
      const ctx = createContext('test task');
      const result = await strictStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Claude (0.95) and Gemini (0.95) should be filtered
        const filtered = result.value.context.filtered;
        expect(filtered.has('claude')).toBe(true);
        expect(filtered.has('gemini')).toBe(true);
        // Codex (1.0) should pass
        expect(filtered.has('codex')).toBe(false);
      }
    });

    it('filters high cost candidates', async () => {
      // Derived from registry pricing (inputPer1M):
      // claude-opus=$15/M → $0.015/1k, gemini-3-pro=$1.25/M → $0.00125/1k, codex-5.3=$2/M → $0.002/1k
      // At 1500 tokens: claude=$0.0225, gemini=$0.001875, codex=$0.003
      const lowBudgetStage = new QualityConstraintStage({
        maxCostUsd: 0.004,
        expectedTokens: 1500,
      });
      const ctx = createContext('test task');
      const result = await lowBudgetStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Only gemini ($0.001875) and codex ($0.003) pass
        const filtered = result.value.context.filtered;
        expect(filtered.has('claude')).toBe(true);
        expect(filtered.has('gemini')).toBe(false);
        expect(filtered.has('codex')).toBe(false);
      }
    });

    it('filters high latency candidates', async () => {
      // Derived from CLI_AVG_LATENCY: claude=800, gemini=400, codex=500
      const lowLatencyStage = new QualityConstraintStage({ maxLatencyMs: 450 });
      const ctx = createContext('test task');
      const result = await lowLatencyStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Only gemini (400ms) should pass
        const filtered = result.value.context.filtered;
        expect(filtered.has('claude')).toBe(true);
        expect(filtered.has('codex')).toBe(true);
        expect(filtered.has('gemini')).toBe(false);
      }
    });

    it('uses fallback when all filtered', async () => {
      // Make constraints impossible to meet
      // Derived: claude=0.95, gemini=0.95, codex=1.0 — need >1.0 to filter all
      const impossibleStage = new QualityConstraintStage({
        minQuality: 1.01,
        allowFallback: true,
      });
      const ctx = createContext('test task');
      const result = await impossibleStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Codex should be fallback (highest quality at 1.0)
        expect(result.value.context.signals).toContain('quality:used-fallback');
        expect(result.value.context.filtered.has('codex')).toBe(false);
        expect(result.value.continuesPipeline).toBe(true);
      }
    });

    it('stops pipeline when all filtered and no fallback', async () => {
      const impossibleStage = new QualityConstraintStage({
        minQuality: 1.01,
        allowFallback: false,
      });
      const ctx = createContext('test task');
      const result = await impossibleStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.continuesPipeline).toBe(false);
      }
    });

    it('adds constraint violation signals', async () => {
      // Derived: claude=0.95, gemini=0.95 → filtered at 0.96
      const strictStage = new QualityConstraintStage({ minQuality: 0.96 });
      const ctx = createContext('test task');
      const result = await strictStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('quality:constraint-quality');
      }
    });

    it('adds trace to context', async () => {
      const ctx = createContext('test task');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.trace.length).toBeGreaterThan(ctx.trace.length);
        const trace = result.value.context.trace.find((t) => t.stageName === 'quality-constraint');
        expect(trace).toBeDefined();
        expect(trace?.action).toBe('filter');
      }
    });
  });

  describe('recordOutcome', () => {
    it('records outcome without error', () => {
      expect(() => {
        stage.recordOutcome({
          selectedCli: 'claude',
          task: 'test task',
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
      expect(stats['filteredCount']).toBe(0);
      expect(stats['fallbackCount']).toBe(0);
      expect(stats['filterRate']).toBe(0);
      expect(stats['constraintViolations']).toEqual({
        quality: 0,
        cost: 0,
        latency: 0,
      });
    });

    it('tracks routing count', async () => {
      await stage.route(createContext('test'));
      await stage.route(createContext('test 2'));

      const stats = stage.getStats();
      expect(stats['routingsCount']).toBe(2);
    });

    it('tracks filtered count', async () => {
      // Derived: claude=0.95, gemini=0.95 filtered at 0.96; codex=1.0 passes
      const strictStage = new QualityConstraintStage({ minQuality: 0.96 });
      await strictStage.route(createContext('test'));

      const stats = strictStage.getStats();
      // 2 candidates should be filtered (claude, gemini)
      expect(stats['filteredCount']).toBe(2);
    });

    it('tracks fallback count', async () => {
      const impossibleStage = new QualityConstraintStage({
        minQuality: 1.01,
        allowFallback: true,
      });
      await impossibleStage.route(createContext('test'));

      const stats = impossibleStage.getStats();
      expect(stats['fallbackCount']).toBe(1);
    });

    it('tracks constraint violations by type', async () => {
      // Derived: claude=0.95, gemini=0.95 filtered at 0.96
      const qualityStage = new QualityConstraintStage({ minQuality: 0.96 });
      await qualityStage.route(createContext('test'));

      const stats = qualityStage.getStats();
      const violations = stats['constraintViolations'] as Record<string, number>;
      expect(violations['quality']).toBe(2); // claude and gemini
    });

    it('calculates filter rate', async () => {
      // Derived: claude=0.95, gemini=0.95 filtered at 0.96
      const strictStage = new QualityConstraintStage({ minQuality: 0.96 });
      await strictStage.route(createContext('test'));

      const stats = strictStage.getStats();
      // 2 filtered out of 1 routing = rate of 2
      expect(stats['filterRate']).toBe(2);
    });
  });

  describe('createQualityConstraintStage', () => {
    it('creates stage with factory function', () => {
      const created = createQualityConstraintStage();
      expect(created).toBeInstanceOf(QualityConstraintStage);
    });

    it('passes config to factory function', () => {
      const created = createQualityConstraintStage({ maxLatencyMs: 3000 });
      const stats = created.getStats();
      expect(stats['config']).toEqual(expect.objectContaining({ maxLatencyMs: 3000 }));
    });
  });
});

// Helper functions

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
