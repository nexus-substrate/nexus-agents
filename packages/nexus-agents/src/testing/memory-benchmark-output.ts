/**
 * Memory Benchmark Output Formatting
 *
 * Formatting and validation helpers for memory benchmark results.
 * Extracted from memory-benchmark.ts for maintainability.
 *
 * @module testing/memory-benchmark-output
 * (Source: Issue #748 - Memory evaluation framework)
 */

import type { MemoryBenchmarkResult } from './memory-benchmark.js';

// ============================================================================
// Result Formatting
// ============================================================================

/** Format benchmark results as a human-readable string. */
/**
 * The decay line, extracted so its phrasing lives in one place (#5260).
 *
 * `unmeasured` is not 0% and not 100%: the score is `null` when the backend
 * search failed or the store was empty. The item count travels with the number
 * so a reader can see the denominator the score was computed over.
 */
function formatDecayConsistency(result: MemoryBenchmarkResult): string {
  if (result.decayConsistencyScore === null) {
    return '  Decay consistency: unmeasured (no items checked)';
  }
  const pct = (result.decayConsistencyScore * 100).toFixed(1);
  return `  Decay consistency: ${pct}% (${String(result.decayItemsChecked)} items)`;
}

function formatCoherence(result: MemoryBenchmarkResult): string[] {
  const lines: string[] = ['▸ Coherence'];
  if (result.coherenceScore === null) {
    lines.push('  Score: unmeasured');
  } else {
    lines.push(`  Score: ${(result.coherenceScore * 100).toFixed(1)}%`);
  }
  if (result.orphanedRefCount > 0) {
    lines.push(`  ⚠ Orphaned refs: ${String(result.orphanedRefCount)}`);
  }
  return lines;
}

function formatPhase3(result: MemoryBenchmarkResult): string[] {
  const lines: string[] = ['▸ Phase 3: Promotion & Appropriateness'];
  if (result.promotionRetentionRate === null) {
    lines.push('  Promotion retention: unmeasured');
  } else {
    lines.push(`  Promotion retention: ${(result.promotionRetentionRate * 100).toFixed(1)}%`);
  }
  if (result.decayRegretScore === null) {
    lines.push('  Decay regret: unmeasured');
  } else {
    lines.push(`  Decay regret: ${(result.decayRegretScore * 100).toFixed(1)}%`);
    if (result.decayRegretScore > 0.3) {
      lines.push('  ⚠ High regret indicates important memories being decayed');
    }
  }
  return lines;
}

export function formatBenchmarkResult(result: MemoryBenchmarkResult): string {
  const lines: string[] = [
    '╔════════════════════════════════════════╗',
    '║     Memory Benchmark Results           ║',
    '╠════════════════════════════════════════╣',
    '',
    '▸ Retrieval Quality',
  ];

  for (const [k, recall] of Object.entries(result.recallAtK)) {
    const precision = result.precisionAtK[Number(k)] ?? 0;
    lines.push(
      `  Recall@${k}: ${(recall * 100).toFixed(1)}%  |  Precision@${k}: ${(precision * 100).toFixed(1)}%`
    );
  }

  lines.push(`  MRR: ${result.mrr.toFixed(3)}`);
  lines.push('');
  lines.push('▸ Latency (ms)');
  lines.push(
    `  P50: ${result.latencyP50Ms.toFixed(2)}ms  |  P95: ${result.latencyP95Ms.toFixed(2)}ms  |  P99: ${result.latencyP99Ms.toFixed(2)}ms`
  );
  lines.push('');
  lines.push('▸ Storage & Efficiency');
  lines.push(
    `  Entries: ${String(result.entryCount)}  |  Size: ${(result.storageBytes / 1024).toFixed(2)} KB`
  );
  lines.push(`  Avg bytes/entry: ${result.avgBytesPerEntry.toFixed(0)} bytes`);
  lines.push('');
  lines.push(...formatCoherence(result));
  lines.push('');
  lines.push('▸ Phase 2: Growth & Decay');
  lines.push(`  Growth rate: ${result.growthRateBytesPerOp.toFixed(0)} bytes/op`);
  lines.push(formatDecayConsistency(result));
  lines.push('');
  lines.push(...formatPhase3(result));
  lines.push('');
  lines.push(`Duration: ${String(result.durationMs)}ms  |  ${result.timestamp.toISOString()}`);
  lines.push('╚════════════════════════════════════════╝');

  return lines.join('\n');
}

// ============================================================================
// Threshold Validation
// ============================================================================

/** Check if benchmark results meet thresholds. */
export interface BenchmarkThresholds {
  readonly minRecallAt5?: number;
  readonly minPrecisionAt5?: number;
  readonly minMrr?: number;
  readonly maxLatencyP95Ms?: number;
  readonly minCoherenceScore?: number;
  /** Maximum acceptable growth rate in bytes per operation (Phase 2) */
  readonly maxGrowthRateBytesPerOp?: number;
  /** Minimum acceptable decay consistency score (Phase 2) */
  readonly minDecayConsistencyScore?: number;
  /** Minimum acceptable promotion retention rate (Phase 3) */
  readonly minPromotionRetentionRate?: number;
  /** Maximum acceptable decay regret score (Phase 3, lower is better) */
  readonly maxDecayRegretScore?: number;
}

/** Formatter functions for threshold display. */
const formatters = {
  pct: (v: number): string => `${(v * 100).toFixed(1)}%`,
  dec: (v: number): string => v.toFixed(3),
  ms: (v: number): string => `${v.toFixed(2)}ms`,
  bytes: (v: number): string => `${v.toFixed(0)}B/op`,
};

/**
 * Outcome of one threshold check.
 *
 * `applied: false` (no threshold configured) is deliberately distinct from a
 * clean `failure: null`: without that distinction an unconfigured check and a
 * passing check are indistinguishable, which is what let a benchmark with zero
 * thresholds report `pass` (#4585).
 */
type AppliedThresholdCheck = { readonly applied: true; readonly failure: string | null };
type ThresholdCheck = { readonly applied: false } | AppliedThresholdCheck;

/** Helper to check a single threshold condition. */
function checkThreshold(
  value: number | null,
  threshold: number | undefined,
  comparison: 'min' | 'max',
  label: string,
  format: (v: number) => string
): ThresholdCheck {
  if (threshold === undefined) return { applied: false };
  // An unmeasured value must not clear a threshold (#5260). Before this,
  // `decayConsistencyScore` was 1.0 when the backend search FAILED, so a
  // configured `minDecayConsistencyScore` passed on a broken backend — a gate
  // that cannot fail for the reason it exists. Same rule as the #4585 fix
  // below: report the failure and name it, rather than certifying nothing.
  if (value === null) {
    return { applied: true, failure: `${label} unmeasured - could not be checked` };
  }
  const failed = comparison === 'min' ? value < threshold : value > threshold;
  if (!failed) return { applied: true, failure: null };
  return {
    applied: true,
    failure: `${label} ${format(value)} ${comparison === 'min' ? '<' : '>'} ${format(threshold)}`,
  };
}

/** Build array of threshold checks for validation. */
function buildThresholdChecks(r: MemoryBenchmarkResult, t: BenchmarkThresholds): ThresholdCheck[] {
  const { pct, dec, ms, bytes } = formatters;
  return [
    checkThreshold(r.recallAtK[5] ?? 0, t.minRecallAt5, 'min', 'Recall@5', pct),
    checkThreshold(r.precisionAtK[5] ?? 0, t.minPrecisionAt5, 'min', 'Precision@5', pct),
    checkThreshold(r.mrr, t.minMrr, 'min', 'MRR', dec),
    checkThreshold(r.latencyP95Ms, t.maxLatencyP95Ms, 'max', 'P95 latency', ms),
    checkThreshold(r.coherenceScore, t.minCoherenceScore, 'min', 'Coherence', pct),
    checkThreshold(r.growthRateBytesPerOp, t.maxGrowthRateBytesPerOp, 'max', 'Growth rate', bytes),
    checkThreshold(
      r.decayConsistencyScore,
      t.minDecayConsistencyScore,
      'min',
      'Decay consistency',
      pct
    ),
    checkThreshold(
      r.promotionRetentionRate,
      t.minPromotionRetentionRate,
      'min',
      'Promotion retention',
      pct
    ),
    checkThreshold(r.decayRegretScore, t.maxDecayRegretScore, 'max', 'Decay regret', pct),
  ];
}

/** Validate benchmark results against thresholds. */
export function validateBenchmarkResults(
  result: MemoryBenchmarkResult,
  thresholds: BenchmarkThresholds
): { pass: boolean; failures: string[] } {
  const applied = buildThresholdChecks(result, thresholds).filter(
    (c): c is AppliedThresholdCheck => c.applied
  );

  // No configured threshold means no check ran, and `failures.length === 0`
  // would certify a benchmark nobody measured (#4585). `pass` is a plain
  // boolean with no way to say "unmeasured", so report `false` and name why.
  if (applied.length === 0) {
    return { pass: false, failures: ['No thresholds configured - benchmark unmeasured'] };
  }

  const failures = applied.map((c) => c.failure).filter((f): f is string => f !== null);
  return { pass: failures.length === 0, failures };
}
