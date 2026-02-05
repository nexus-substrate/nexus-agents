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
  lines.push('▸ Coherence');
  lines.push(`  Score: ${(result.coherenceScore * 100).toFixed(1)}%`);
  if (result.orphanedRefCount > 0) {
    lines.push(`  ⚠ Orphaned refs: ${String(result.orphanedRefCount)}`);
  }
  lines.push('');
  lines.push('▸ Phase 2: Growth & Decay');
  lines.push(`  Growth rate: ${result.growthRateBytesPerOp.toFixed(0)} bytes/op`);
  lines.push(`  Decay consistency: ${(result.decayConsistencyScore * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('▸ Phase 3: Promotion & Appropriateness');
  lines.push(`  Promotion retention: ${(result.promotionRetentionRate * 100).toFixed(1)}%`);
  lines.push(`  Decay regret: ${(result.decayRegretScore * 100).toFixed(1)}%`);
  if (result.decayRegretScore > 0.3) {
    lines.push('  ⚠ High regret indicates important memories being decayed');
  }
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

/** Helper to check a single threshold condition. */
function checkThreshold(
  value: number,
  threshold: number | undefined,
  comparison: 'min' | 'max',
  label: string,
  format: (v: number) => string
): string | null {
  if (threshold === undefined) return null;
  const failed = comparison === 'min' ? value < threshold : value > threshold;
  if (!failed) return null;
  return `${label} ${format(value)} ${comparison === 'min' ? '<' : '>'} ${format(threshold)}`;
}

/** Build array of threshold checks for validation. */
function buildThresholdChecks(r: MemoryBenchmarkResult, t: BenchmarkThresholds): (string | null)[] {
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
  const checks = buildThresholdChecks(result, thresholds);
  const failures = checks.filter((c): c is string => c !== null);
  return { pass: failures.length === 0, failures };
}
