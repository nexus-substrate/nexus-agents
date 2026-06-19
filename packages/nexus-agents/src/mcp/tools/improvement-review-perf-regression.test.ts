/**
 * Tests for the deterministic perf-regression detector (#3692 + #3246).
 *
 * Pure-function tests: a benchmark measurement vs a STATIC baseline + fixed
 * tolerance. Plus a wiring test that the signal is SURFACED-ONLY through
 * `runImprovementReview` and mutates no fitness/governance score.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPerfRegressionSignals,
  baselineKey,
  DEFAULT_REGRESSION_TOLERANCE_FRACTION,
  type PerfBaseline,
  type PerfBaselineMap,
} from './improvement-review-perf-regression.js';
import { runImprovementReview, ImprovementReviewInputSchema } from './improvement-review.js';
import type {
  BenchmarkSuiteResult,
  OperationBenchmark,
  LatencyMetrics,
  ThroughputMetrics,
} from '../../benchmarks/benchmark-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function latency(p95: number): LatencyMetrics {
  return {
    min: 0,
    max: p95,
    mean: p95,
    p50: p95,
    p75: p95,
    p90: p95,
    p95,
    p99: p95,
    stdDev: 0,
    sampleCount: 100,
  };
}

function throughput(opsPerSecond: number): ThroughputMetrics {
  return { opsPerSecond, totalOps: 1000, durationMs: 1000 };
}

function operation(name: string, p95Ms: number, opsPerSecond: number): OperationBenchmark {
  return {
    operation: name,
    datasetSize: 1000,
    latency: latency(p95Ms),
    throughput: throughput(opsPerSecond),
    resources: { peakMemoryBytes: 0, avgMemoryBytes: 0, cpuTimeMs: 0 },
    timestamp: '2026-06-19T00:00:00.000Z',
  };
}

function suite(component: string, ops: readonly OperationBenchmark[]): BenchmarkSuiteResult {
  return {
    name: `${component}-suite`,
    component,
    version: '1.0.0',
    operations: ops,
    environment: {
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      cpuModel: 'test',
      cpuCores: 8,
      totalMemory: 0,
    },
    summary: {
      totalDurationMs: 0,
      totalOperations: ops.length,
      overallThroughput: 0,
      avgP95Latency: 0,
      passed: true,
      failures: [],
    },
  };
}

function baselines(entries: Record<string, PerfBaseline>): PerfBaselineMap {
  return new Map(Object.entries(entries));
}

// ============================================================================
// (a) measurement above baseline*tolerance → exactly one signal, correct payload
// ============================================================================

describe('detectPerfRegressionSignals — latency regression', () => {
  it('emits exactly one perf-regression signal when p95 exceeds baseline*(1+tolerance)', () => {
    // baseline 100ms, tolerance 20% → threshold 120ms; measured 150ms regresses.
    const result = suite('memory-store', [operation('search', 150, 500)]);
    const signals = detectPerfRegressionSignals(result, baselines({ 'memory-store::search': { baselineP95Ms: 100 } }));

    expect(signals).toHaveLength(1);
    const sig = signals[0];
    expect(sig).toBeDefined();
    if (sig === undefined) return;
    expect(sig.category).toBe('perf-regression');
    expect(sig.signalKey).toBe('perf-regression:latency:memory-store:search');
    expect(sig.severity).toBe('warning');
    expect(sig.title).toContain('150ms');
    expect(sig.title).toContain('100ms');
    expect(sig.evidence.observedValue).toBe(150);
    expect(sig.evidence.threshold).toBe(120);
    expect(sig.body).toContain('static/configured');
    expect(sig.body).toContain('No fitness/governance score is mutated');
  });

  it('emits a throughput-regression signal when throughput drops below baseline*(1-tolerance)', () => {
    // baseline 1000 ops/s, tolerance 20% → threshold 800 ops/s; measured 700 regresses.
    const result = suite('router', [operation('route', 10, 700)]);
    const signals = detectPerfRegressionSignals(result, baselines({ 'router::route': { baselineThroughput: 1000 } }));

    expect(signals).toHaveLength(1);
    const sig = signals[0];
    if (sig === undefined) throw new Error('expected a signal');
    expect(sig.signalKey).toBe('perf-regression:throughput:router:route');
    expect(sig.evidence.observedValue).toBe(700);
    expect(sig.evidence.threshold).toBe(800);
  });

  it('can emit BOTH a latency and a throughput signal for one operation', () => {
    const result = suite('store', [operation('write', 200, 600)]);
    const signals = detectPerfRegressionSignals(
      result,
      baselines({ 'store::write': { baselineP95Ms: 100, baselineThroughput: 1000 } })
    );
    expect(signals).toHaveLength(2);
    expect(signals.map((s) => s.signalKey).sort()).toEqual([
      'perf-regression:latency:store:write',
      'perf-regression:throughput:store:write',
    ]);
  });

  it('is deterministic — same inputs produce identical output', () => {
    const result = suite('store', [operation('write', 200, 600)]);
    const map = baselines({ 'store::write': { baselineP95Ms: 100, baselineThroughput: 1000 } });
    expect(detectPerfRegressionSignals(result, map)).toEqual(detectPerfRegressionSignals(result, map));
  });
});

// ============================================================================
// (b) within tolerance → no signal
// ============================================================================

describe('detectPerfRegressionSignals — within tolerance', () => {
  it('emits nothing when latency is within tolerance', () => {
    // baseline 100, threshold 120; measured 115 is within tolerance.
    const result = suite('store', [operation('search', 115, 1000)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::search': { baselineP95Ms: 100 } }))
    ).toHaveLength(0);
  });

  it('emits nothing when throughput is within tolerance', () => {
    // baseline 1000, threshold 800; measured 850 is within tolerance.
    const result = suite('store', [operation('search', 10, 850)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::search': { baselineThroughput: 1000 } }))
    ).toHaveLength(0);
  });

  it('emits nothing when the measurement is BETTER than baseline', () => {
    const result = suite('store', [operation('search', 50, 2000)]);
    expect(
      detectPerfRegressionSignals(
        result,
        baselines({ 'store::search': { baselineP95Ms: 100, baselineThroughput: 1000 } })
      )
    ).toHaveLength(0);
  });
});

// ============================================================================
// (c) boundary — EXCLUSIVE: exactly at the threshold is NOT a regression
// ============================================================================

describe('detectPerfRegressionSignals — threshold boundary (exclusive)', () => {
  it('does NOT emit when latency is EXACTLY at baseline*(1+tolerance)', () => {
    // baseline 100, tolerance 20% → threshold exactly 120; measured 120 → no signal.
    const result = suite('store', [operation('search', 120, 1000)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::search': { baselineP95Ms: 100 } }))
    ).toHaveLength(0);
  });

  it('DOES emit one tick above the latency threshold', () => {
    const result = suite('store', [operation('search', 120.01, 1000)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::search': { baselineP95Ms: 100 } }))
    ).toHaveLength(1);
  });

  it('does NOT emit when throughput is EXACTLY at baseline*(1-tolerance)', () => {
    // baseline 1000, tolerance 20% → threshold exactly 800; measured 800 → no signal.
    const result = suite('store', [operation('route', 10, 800)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::route': { baselineThroughput: 1000 } }))
    ).toHaveLength(0);
  });

  it('DOES emit one tick below the throughput threshold', () => {
    const result = suite('store', [operation('route', 10, 799.99)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::route': { baselineThroughput: 1000 } }))
    ).toHaveLength(1);
  });
});

// ============================================================================
// (d) no configured baseline → no signal (conservative; never invents a baseline)
// ============================================================================

describe('detectPerfRegressionSignals — no configured baseline', () => {
  it('emits nothing when the component+operation has no baseline entry', () => {
    const result = suite('store', [operation('search', 9999, 1)]);
    expect(detectPerfRegressionSignals(result, baselines({}))).toHaveLength(0);
  });

  it('only flags operations that have a baseline; others are silent', () => {
    const result = suite('store', [
      operation('search', 999, 1), // no baseline → silent
      operation('write', 200, 1000), // baseline present → flagged
    ]);
    const signals = detectPerfRegressionSignals(
      result,
      baselines({ 'store::write': { baselineP95Ms: 100 } })
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]?.signalKey).toBe('perf-regression:latency:store:write');
  });

  it('skips a baseline whose component matches but operation does not', () => {
    const result = suite('store', [operation('search', 9999, 1)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::other': { baselineP95Ms: 1 } }))
    ).toHaveLength(0);
  });

  it('exposes the default tolerance as 0.2 (20%) and uses it when omitted', () => {
    expect(DEFAULT_REGRESSION_TOLERANCE_FRACTION).toBe(0.2);
    // measured 121 with baseline 100 → > 120 default threshold → regression.
    const result = suite('store', [operation('search', 121, 1000)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::search': { baselineP95Ms: 100 } }))
    ).toHaveLength(1);
  });

  it('honors a custom tolerance override', () => {
    // tolerance 50% → threshold 150; measured 140 within → no signal.
    const result = suite('store', [operation('search', 140, 1000)]);
    expect(
      detectPerfRegressionSignals(result, baselines({ 'store::search': { baselineP95Ms: 100 } }), 0.5)
    ).toHaveLength(0);
  });

  it('baselineKey builds the documented "component::operation" key', () => {
    expect(baselineKey('store', 'search')).toBe('store::search');
  });
});

// ============================================================================
// (e) SURFACED-ONLY — wiring through runImprovementReview mutates no score
// ============================================================================

describe('runImprovementReview — perf-regression is surfaced, not auto-acted', () => {
  it('surfaces a perf-regression signal without mutating fitness/governance scores', async () => {
    const result = suite('memory-store', [operation('search', 300, 1000)]);
    const perfBaselines = baselines({ 'memory-store::search': { baselineP95Ms: 100 } });
    const input = ImprovementReviewInputSchema.parse({ lookbackDays: 7, fileIssues: false });

    // Run WITHOUT the perf input — establishes the surfaced-signal baseline and the
    // fitness-derived state of the review with no perf detector active.
    const without = await runImprovementReview(input);

    // Run WITH the perf input. fileIssues:false → nothing is filed/executed.
    const withPerf = await runImprovementReview(input, {
      perfRegression: { result, baselines: perfBaselines },
    });

    const perfSignals = withPerf.signals.filter((s) => s.category === 'perf-regression');
    expect(perfSignals).toHaveLength(1);

    // SURFACED-ONLY guarantee: the perf signal is purely additive. Every NON-perf
    // signal is byte-identical to the run without the perf input — emitting the
    // signal mutated no fitness/governance/other detector state.
    const nonPerfWith = withPerf.signals.filter((s) => s.category !== 'perf-regression');
    expect(nonPerfWith).toEqual(without.signals);

    // It surfaces in the response signals + suggest-only remediation tasks, and
    // nothing is filed (no autonomous action).
    expect(withPerf.issuesFiled).toEqual([]);
    const perfTasks = withPerf.remediationTasks.filter((t) =>
      t.id.startsWith('improvement-perf-regression:')
    );
    expect(perfTasks).toHaveLength(1);
  });

  it('runs the perf detector only when a benchmark+baseline is injected', async () => {
    const input = ImprovementReviewInputSchema.parse({ lookbackDays: 7, fileIssues: false });
    const response = await runImprovementReview(input);
    expect(response.signals.filter((s) => s.category === 'perf-regression')).toHaveLength(0);
  });
});
