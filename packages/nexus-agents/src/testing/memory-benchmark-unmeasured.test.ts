/**
 * The decay benchmark must not report a perfect score for a failed measurement
 * (#5260).
 *
 * `measureDecayConsistency` returned `{ consistencyScore: 1.0, itemsChecked: 0 }`
 * when the backend search **failed** — logging `'Cannot measure decay
 * consistency - search failed'` on the line directly above. `itemsChecked: 0`
 * was the honest disclosure and it was discarded at the `buildBenchmarkResult`
 * boundary, so `Decay consistency: 100.0%` reached the user and the CSV.
 *
 * A benchmark that reports 100% on backend failure is worse than one that
 * crashes: a broken memory backend produces output identical to a perfectly
 * consistent one, and the CSV rows are indistinguishable in a time series.
 *
 * Idiom follows #5255, ratified unanimously for this exact shape: `null` means
 * UNMEASURED and never zero, and the denominator travels with the number.
 */

import { describe, it, expect } from 'vitest';

import { formatBenchmarkResult, validateBenchmarkResults } from './memory-benchmark-output.js';
import { runMemoryBenchmark, type MemoryBenchmarkResult } from './memory-benchmark.js';
import {
  measurePromotionEffectiveness,
  measureDecayAppropriateness,
} from './memory-benchmark-phase3.js';
import type { IContextMemoryBackend } from '../context/memory-backend-types.js';

function resultWith(overrides: Partial<MemoryBenchmarkResult>): MemoryBenchmarkResult {
  return {
    recallAtK: { 5: 0.8 },
    precisionAtK: { 5: 0.8 },
    mrr: 0.9,
    latencyP50Ms: 1,
    latencyP95Ms: 2,
    latencyP99Ms: 3,
    storageBytes: 100,
    entryCount: 10,
    coherenceScore: 1,
    timestamp: new Date(0),
    durationMs: 1,
    avgBytesPerEntry: 10,
    orphanedRefCount: 0,
    growthRateBytesPerOp: 0,
    decayConsistencyScore: null,
    decayItemsChecked: 0,
    promotionRetentionRate: 1,
    decayRegretScore: 0,
    ...overrides,
  };
}

describe('decay consistency reports absence as absence (#5260)', () => {
  it('renders unmeasured rather than a percentage when nothing was checked', () => {
    const out = formatBenchmarkResult(resultWith({ decayConsistencyScore: null }));
    expect(out).toContain('Decay consistency: unmeasured');
    expect(out).not.toContain('Decay consistency: 100.0%');
  });

  it('still renders a real perfect score when items WERE checked', () => {
    // The control. Without it, hardcoding "unmeasured" would pass the test
    // above and silently destroy the measurement this benchmark exists for.
    const out = formatBenchmarkResult(
      resultWith({ decayConsistencyScore: 1.0, decayItemsChecked: 12 })
    );
    expect(out).toContain('Decay consistency: 100.0%');
    expect(out).not.toContain('unmeasured');
  });

  it('still renders a real imperfect score', () => {
    // The second control: the field must be able to take a value other than
    // 1 and null, or "consistency" is not a measurement at all.
    const out = formatBenchmarkResult(
      resultWith({ decayConsistencyScore: 0.5, decayItemsChecked: 8 })
    );
    expect(out).toContain('Decay consistency: 50.0%');
  });
});

// ============================================================================
// The producer seam — the real measurement, not just the renderer
// ============================================================================

describe('the decay measurement itself reports absence (#5260)', () => {
  /**
   * Mutation testing caught this file testing only the RENDERER: reverting the
   * failed-search branch to `consistencyScore: 1.0` left all three tests above
   * green. That is the seam problem #5120 names — both halves covered, the wire
   * between them not — so this drives the real `runMemoryBenchmark` with a
   * backend whose `search` fails, exercising the producer.
   */
  function failingBackend(): IContextMemoryBackend {
    const fail = (): Promise<never> =>
      Promise.resolve({
        ok: false,
        error: { code: 'BACKEND_DOWN', message: 'search failed' },
      }) as Promise<never>;
    return {
      store: () => Promise.resolve({ ok: true, value: undefined }),
      retrieve: fail,
      search: fail,
      prune: () => Promise.resolve({ ok: true, value: 0 }),
    } as unknown as IContextMemoryBackend;
  }

  it('reports null, not 1.0, when the backend search fails', async () => {
    const result = await runMemoryBenchmark(failingBackend(), [], { quickMode: true });
    expect(result.decayConsistencyScore).toBeNull();
    expect(result.decayItemsChecked).toBe(0);
  });

  it('an unmeasured score does not clear a configured minimum threshold', () => {
    // The sharper half. Before this, a FAILED backend search produced 1.0, so
    // `minDecayConsistencyScore` passed on a broken backend — a gate that could
    // not fail for the reason it exists.
    const verdict = validateBenchmarkResults(resultWith({ decayConsistencyScore: null }), {
      minDecayConsistencyScore: 0.9,
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.failures.join(' ')).toContain('unmeasured');
  });

  it('a real score above the minimum still passes', () => {
    // The control: the gate must still be able to pass.
    const verdict = validateBenchmarkResults(
      resultWith({ decayConsistencyScore: 0.95, decayItemsChecked: 20 }),
      { minDecayConsistencyScore: 0.9 }
    );
    expect(verdict.pass).toBe(true);
  });
});

// ============================================================================
// Phase 3 metrics & coherence report absence as absence (#5664)
// ============================================================================

describe('unmeasured metrics report absence (#5664)', () => {
  /**
   * Backend whose search and store both return { ok: false, error }
   * (retrieve unused, prune returns { ok: true, value: 0 }).
   */
  function searchAndStoreFailingBackend(): IContextMemoryBackend {
    const fail = (): Promise<never> =>
      Promise.resolve({
        ok: false,
        error: { code: 'BACKEND_DOWN', message: 'operation failed' },
      }) as Promise<never>;
    return {
      store: fail,
      retrieve: fail,
      search: fail,
      prune: () => Promise.resolve({ ok: true, value: 0 }),
    } as unknown as IContextMemoryBackend;
  }

  it('reports null, not 1.0, for coherenceScore when backend search fails', async () => {
    const backend = searchAndStoreFailingBackend();
    const result = await runMemoryBenchmark(backend, [], { quickMode: true });
    expect(result.coherenceScore).toBeNull();
  });

  it('reports null, not 1.0, for retentionRate with itemsPromoted 0 when backend store fails', async () => {
    const backend = searchAndStoreFailingBackend();
    const promotion = await measurePromotionEffectiveness(backend);
    expect(promotion.retentionRate).toBeNull();
    expect(promotion.itemsPromoted).toBe(0);

    const result = await runMemoryBenchmark(backend, [], { quickMode: true });
    expect(result.promotionRetentionRate).toBeNull();
  });

  it('reports null, not 0, for regretScore with itemsDecayed 0 when seeding stores fail', async () => {
    const backend = searchAndStoreFailingBackend();
    const appropriateness = await measureDecayAppropriateness(backend);
    expect(appropriateness.regretScore).toBeNull();
    expect(appropriateness.itemsDecayed).toBe(0);

    const result = await runMemoryBenchmark(backend, [], { quickMode: true });
    expect(result.decayRegretScore).toBeNull();
  });

  it('validateBenchmarkResults fails on null metric when minCoherenceScore is set and names the metric', async () => {
    const backend = searchAndStoreFailingBackend();
    const result = await runMemoryBenchmark(backend, [], { quickMode: true });
    const verdict = validateBenchmarkResults(result, { minCoherenceScore: 0.9 });
    expect(verdict.pass).toBe(false);
    expect(verdict.failures.join(' ')).toContain('Coherence');
    expect(verdict.failures.join(' ')).toContain('unmeasured');
  });

  it('validateBenchmarkResults fails on null metric when minPromotionRetentionRate is set and names the metric', async () => {
    const backend = searchAndStoreFailingBackend();
    const result = await runMemoryBenchmark(backend, [], { quickMode: true });
    const verdict = validateBenchmarkResults(result, { minPromotionRetentionRate: 0.9 });
    expect(verdict.pass).toBe(false);
    expect(verdict.failures.join(' ')).toContain('Promotion retention');
    expect(verdict.failures.join(' ')).toContain('unmeasured');
  });

  it('validateBenchmarkResults fails on null metric when maxDecayRegretScore is set and names the metric', async () => {
    const backend = searchAndStoreFailingBackend();
    const result = await runMemoryBenchmark(backend, [], { quickMode: true });
    const verdict = validateBenchmarkResults(result, { maxDecayRegretScore: 0.1 });
    expect(verdict.pass).toBe(false);
    expect(verdict.failures.join(' ')).toContain('Decay regret');
    expect(verdict.failures.join(' ')).toContain('unmeasured');
  });

  it('validateBenchmarkResults still passes when thresholds are not set and metrics are null', async () => {
    const backend = searchAndStoreFailingBackend();
    const result = await runMemoryBenchmark(backend, [], { quickMode: true });
    const verdict = validateBenchmarkResults(result, { minMrr: 0 });
    expect(verdict.pass).toBe(true);
    expect(verdict.failures).toEqual([]);
  });
});

describe('unmeasured formatting reports absence as unmeasured (#5664)', () => {
  it('renders unmeasured rather than a percentage for null coherence, retention, and regret', () => {
    const out = formatBenchmarkResult(
      resultWith({
        coherenceScore: null,
        promotionRetentionRate: null,
        decayRegretScore: null,
      })
    );
    expect(out).toContain('Score: unmeasured');
    expect(out).not.toContain('Score: 100.0%');
    expect(out).toContain('Promotion retention: unmeasured');
    expect(out).not.toContain('Promotion retention: 100.0%');
    expect(out).toContain('Decay regret: unmeasured');
    expect(out).not.toContain('Decay regret: 0.0%');
  });

  it('still renders real scores when metrics are measured', () => {
    const out = formatBenchmarkResult(
      resultWith({
        coherenceScore: 0.95,
        promotionRetentionRate: 0.85,
        decayRegretScore: 0.15,
      })
    );
    expect(out).toContain('Score: 95.0%');
    expect(out).toContain('Promotion retention: 85.0%');
    expect(out).toContain('Decay regret: 15.0%');
  });
});
