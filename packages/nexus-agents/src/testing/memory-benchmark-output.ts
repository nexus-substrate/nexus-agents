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
}

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
  const op = comparison === 'min' ? '<' : '>';
  return `${label} ${format(value)} ${op} ${format(threshold)}`;
}

/** Validate benchmark results against thresholds. */
export function validateBenchmarkResults(
  result: MemoryBenchmarkResult,
  thresholds: BenchmarkThresholds
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const dec = (v: number): string => v.toFixed(3);
  const ms = (v: number): string => `${v.toFixed(2)}ms`;
  const bytes = (v: number): string => `${v.toFixed(0)}B/op`;

  const checks = [
    checkThreshold(result.recallAtK[5] ?? 0, thresholds.minRecallAt5, 'min', 'Recall@5', pct),
    checkThreshold(
      result.precisionAtK[5] ?? 0,
      thresholds.minPrecisionAt5,
      'min',
      'Precision@5',
      pct
    ),
    checkThreshold(result.mrr, thresholds.minMrr, 'min', 'MRR', dec),
    checkThreshold(result.latencyP95Ms, thresholds.maxLatencyP95Ms, 'max', 'P95 latency', ms),
    checkThreshold(result.coherenceScore, thresholds.minCoherenceScore, 'min', 'Coherence', pct),
    // Phase 2 thresholds
    checkThreshold(
      result.growthRateBytesPerOp,
      thresholds.maxGrowthRateBytesPerOp,
      'max',
      'Growth rate',
      bytes
    ),
    checkThreshold(
      result.decayConsistencyScore,
      thresholds.minDecayConsistencyScore,
      'min',
      'Decay consistency',
      pct
    ),
  ];

  for (const check of checks) {
    if (check !== null) failures.push(check);
  }

  return { pass: failures.length === 0, failures };
}
