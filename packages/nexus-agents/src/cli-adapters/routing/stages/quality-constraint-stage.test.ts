/**
 * Tests for QualityConstraintStage
 *
 * @module cli-adapters/routing/stages/quality-constraint-stage.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  QualityConstraintStage,
  createQualityConstraintStage,
} from './quality-constraint-stage.js';
import type { RoutingContext } from '../router-stage.js';
import { getDefaultRegistry } from '../../../config/model-registry.js';

describe('QualityConstraintStage', () => {
  let stage: QualityConstraintStage;

  beforeEach(() => {
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
    it('refreshes registry prices between calls on the same stage', async () => {
      const registry = getDefaultRegistry();
      const getEntry = registry.getEntry.bind(registry);
      let outputPer1M = 1;
      const spy = vi.spyOn(registry, 'getEntry').mockImplementation((id) => {
        const entry = getEntry(id);
        return id === 'gpt-6.1-sol' ? { ...entry, pricing: { inputPer1M: 1, outputPer1M } } : entry;
      });
      const stage = new QualityConstraintStage({
        maxCostUsd: 2,
        expectedTokens: 1_000_000,
        allowFallback: false,
      });
      try {
        const cheap = await stage.route(createContext('test task', ['codex']));
        expect(cheap.ok).toBe(true);
        if (cheap.ok) expect(cheap.value.context.filtered.has('codex')).toBe(false);
        outputPer1M = 3;
        const expensive = await stage.route(createContext('test task', ['codex']));
        expect(expensive.ok).toBe(true);
        if (expensive.ok) expect(expensive.value.context.filtered.has('codex')).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });

    it.each([
      {
        name: 'unknown split with input dearer than output',
        inputPer1M: 20,
        outputPer1M: 1,
        tokens: 1_000_000,
        ceiling: 2,
        split: {},
        rejects: true,
      },
      {
        name: 'input-only split remains unknown',
        inputPer1M: 20,
        outputPer1M: 1,
        tokens: 1_000_000,
        ceiling: 2,
        split: { expectedInputTokens: 0 },
        rejects: true,
      },
      {
        name: 'output-only split remains unknown',
        inputPer1M: 20,
        outputPer1M: 1,
        tokens: 1_000_000,
        ceiling: 2,
        split: { expectedOutputTokens: 1_000_000 },
        rejects: true,
      },
      {
        name: 'known all-output split uses its exact cheaper rate',
        inputPer1M: 20,
        outputPer1M: 1,
        tokens: 1_000_000,
        ceiling: 2,
        split: { expectedInputTokens: 0, expectedOutputTokens: 1_000_000 },
        rejects: false,
      },
      {
        name: 'known all-input split uses its exact dearer rate',
        inputPer1M: 20,
        outputPer1M: 1,
        tokens: 1_000_000,
        ceiling: 2,
        split: { expectedInputTokens: 1_000_000, expectedOutputTokens: 0 },
        rejects: true,
      },
      {
        name: 'one token retains per-million rate units',
        inputPer1M: 20,
        outputPer1M: 1,
        tokens: 1,
        ceiling: 0.000_01,
        split: {},
        rejects: true,
      },
      {
        name: 'explicit free prices meet a zero ceiling',
        inputPer1M: 0,
        outputPer1M: 0,
        tokens: 1_000_000,
        ceiling: 0,
        split: {},
        rejects: false,
      },
      {
        name: 'free output does not make an unknown split free',
        inputPer1M: 20,
        outputPer1M: 0,
        tokens: 1_000_000,
        ceiling: 2,
        split: {},
        rejects: true,
      },
      {
        name: 'known free-input tokens meet a zero ceiling',
        inputPer1M: 0,
        outputPer1M: 20,
        tokens: 1_000_000,
        ceiling: 0,
        split: { expectedInputTokens: 1_000_000, expectedOutputTokens: 0 },
        rejects: false,
      },
      {
        name: 'known free-output tokens meet a zero ceiling',
        inputPer1M: 20,
        outputPer1M: 0,
        tokens: 1_000_000,
        ceiling: 0,
        split: { expectedInputTokens: 0, expectedOutputTokens: 1_000_000 },
        rejects: false,
      },
    ])('bounds current registry prices: $name', async (testCase) => {
      const registry = getDefaultRegistry();
      const getEntry = registry.getEntry.bind(registry);
      const spy = vi.spyOn(registry, 'getEntry').mockImplementation((id) => {
        const entry = getEntry(id);
        return id === 'gpt-6.1-sol'
          ? {
              ...entry,
              pricing: { inputPer1M: testCase.inputPer1M, outputPer1M: testCase.outputPer1M },
            }
          : entry;
      });
      const stage = new QualityConstraintStage({
        minQuality: 0,
        expectedTokens: testCase.tokens,
        maxCostUsd: testCase.ceiling,
        allowFallback: false,
        ...testCase.split,
      });
      try {
        const result = await stage.route(createContext('priced task', ['codex']));
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.context.filtered.has('codex')).toBe(testCase.rejects);
          expect(result.value.continuesPipeline).toBe(!testCase.rejects);
          expect(result.value.context.signals).not.toContain('quality:used-fallback');
          expect(result.value.context.signals.includes('quality:constraint-cost')).toBe(
            testCase.rejects
          );
          expect(stage.getStats()['fallbackCount']).toBe(0);
        }
      } finally {
        spy.mockRestore();
      }
    });

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
      // Derived from registry (#4176): claude=1.0 (claude-fable-5),
      // gemini=0.95 (gemini-3-pro), codex=1.0 (gpt-6.1-sol, carried over per #6842)
      // At minQuality=0.96, claude and codex pass
      const strictStage = new QualityConstraintStage({ minQuality: 0.96 });
      const ctx = createContext('test task');
      const result = await strictStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Gemini (0.95) should be filtered
        const filtered = result.value.context.filtered;
        expect(filtered.has('gemini')).toBe(true);
        // Claude (1.0) and Codex (1.0) should pass
        expect(filtered.has('claude')).toBe(false);
        expect(filtered.has('codex')).toBe(false);
      }
    });

    it('filters high cost candidates using the conservative bound (#5186)', async () => {
      // This assertion previously read "only gemini ($0.003) passes", computed
      // from the INPUT rate applied to every token. That was the bug: the
      // estimate ran 5-6x under the worst case, so the ceiling ADMITTED
      // candidates it was configured to reject. The test encoded the defect.
      //
      // With no split supplied, price the whole total at the higher input/output
      // rate. Every current default exceeds this ceiling at 1500 tokens; the
      // bound must stay conservative regardless of which component is dearer.
      const lowBudgetStage = new QualityConstraintStage({
        maxCostUsd: 0.004,
        expectedTokens: 1500,
        // Fallback off: with every candidate now over the ceiling, the
        // highest-quality one would be restored and the cost filter's effect
        // would be invisible. This test is about the filter, not the fallback.
        allowFallback: false,
      });
      const ctx = createContext('test task');
      const result = await lowBudgetStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // All three now exceed the $0.004 ceiling, which is the honest answer.
        const filtered = result.value.context.filtered;
        expect(filtered.has('claude')).toBe(true);
        expect(filtered.has('codex')).toBe(true);
        expect(filtered.has('gemini')).toBe(true);
      }
    });

    it('does NOT admit a candidate whose real cost exceeds the ceiling (#5186)', async () => {
      // The regression that matters. gemini's input-rate estimate at 1500
      // tokens is $0.003; its output-rate bound is $0.018. A ceiling set
      // between them must reject — under the old arithmetic it admitted.
      const stage = new QualityConstraintStage({
        maxCostUsd: 0.01,
        expectedTokens: 1500,
        minQuality: 0,
        maxLatencyMs: 100_000,
      });
      const result = await stage.route(createContext('test task'));

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.context.filtered.has('gemini')).toBe(true);
    });

    it('prices exactly when the caller supplies the input/output split (#5186)', async () => {
      // The conservative bound is a fallback for an unknown split, not a
      // penalty. A caller that knows the mix gets the real figure — here
      // gemini at 1400 in / 100 out is (1400*2 + 100*12)/1e6 = $0.004, under a
      // $0.01 ceiling, so it survives where the worst-case bound rejected it.
      const stage = new QualityConstraintStage({
        maxCostUsd: 0.01,
        expectedTokens: 1500,
        expectedInputTokens: 1400,
        expectedOutputTokens: 100,
        minQuality: 0,
        maxLatencyMs: 100_000,
      });
      const result = await stage.route(createContext('test task'));

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.context.filtered.has('gemini')).toBe(false);
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
      // Derived: claude=1.0, gemini=0.95, codex=1.0 (#4176) — need >1.0 to filter all
      const impossibleStage = new QualityConstraintStage({
        minQuality: 1.01,
        allowFallback: true,
      });
      const ctx = createContext('test task');
      const result = await impossibleStage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Claude should be fallback (ties codex at quality 1.0; first profile wins)
        expect(result.value.context.signals).toContain('quality:used-fallback');
        expect(result.value.context.filtered.has('claude')).toBe(false);
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
      // Derived: gemini=0.95 → filtered at 0.96 (#4176)
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
      // Derived (#4176): gemini=0.95 filtered at 0.96; claude=1.0, codex=1.0 pass
      const strictStage = new QualityConstraintStage({ minQuality: 0.96 });
      await strictStage.route(createContext('test'));

      const stats = strictStage.getStats();
      // 1 candidate should be filtered (gemini)
      expect(stats['filteredCount']).toBe(1);
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
      // Derived (#4176): gemini=0.95 filtered at 0.96
      const qualityStage = new QualityConstraintStage({ minQuality: 0.96 });
      await qualityStage.route(createContext('test'));

      const stats = qualityStage.getStats();
      const violations = stats['constraintViolations'] as Record<string, number>;
      expect(violations['quality']).toBe(1); // gemini
    });

    it('calculates filter rate', async () => {
      // Derived (#4176): gemini=0.95 filtered at 0.96
      const strictStage = new QualityConstraintStage({ minQuality: 0.96 });
      await strictStage.route(createContext('test'));

      const stats = strictStage.getStats();
      // 1 filtered out of 1 routing = rate of 1
      expect(stats['filterRate']).toBe(1);
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
