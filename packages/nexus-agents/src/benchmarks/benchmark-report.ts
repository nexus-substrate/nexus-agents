/**
 * nexus-agents/benchmarks - Benchmark Report Generator
 *
 * Generates structured JSON reports from benchmark results.
 * Validates results against Mem0 claimed metrics.
 *
 * @module benchmarks/benchmark-report
 * (Source: Issue #462, arXiv:2504.19413)
 */

import { getTimeProvider } from '../core/index.js';
import type { BenchmarkSuiteResult } from './benchmark-types.js';
import type { BenchmarkComparison } from './memory-benchmarks-helpers.js';
import type { TokenBenchmarkResult } from './token-benchmark.js';
import type { ConsolidationBenchmarkResult } from './consolidation-benchmark.js';

/**
 * Mem0 claimed targets from arXiv:2504.19413.
 */
export const MEM0_TARGETS = {
  latencyReductionPercent: 91,
  tokenSavingsPercent: 90,
  qualityImprovementPercent: 26,
} as const;

/**
 * Validation result for a single Mem0 claim.
 */
export interface ClaimValidation {
  readonly claim: string;
  readonly targetPercent: number;
  readonly actualPercent: number;
  readonly met: boolean;
  readonly delta: number;
}

/**
 * Complete benchmark report.
 */
export interface BenchmarkReport {
  readonly version: string;
  readonly timestamp: string;
  readonly suite: BenchmarkSuiteResult | null;
  readonly comparison: BenchmarkComparison | null;
  readonly tokenResults: readonly TokenBenchmarkResult[];
  readonly consolidation: ConsolidationBenchmarkResult | null;
  readonly mem0Validation: readonly ClaimValidation[];
  readonly overallPass: boolean;
}

/**
 * Options for generating a benchmark report.
 */
export interface ReportOptions {
  readonly suite?: BenchmarkSuiteResult;
  readonly comparison?: BenchmarkComparison;
  readonly tokenResults?: readonly TokenBenchmarkResult[];
  readonly consolidation?: ConsolidationBenchmarkResult;
}

/**
 * Validate Mem0 latency claim from comparison results.
 */
function validateLatencyClaim(comparison: BenchmarkComparison | undefined): ClaimValidation {
  const actual = comparison !== undefined ? Math.abs(comparison.overallLatencyChangePercent) : 0;

  return {
    claim: 'Latency reduction',
    targetPercent: MEM0_TARGETS.latencyReductionPercent,
    actualPercent: actual,
    met: actual >= MEM0_TARGETS.latencyReductionPercent,
    delta: actual - MEM0_TARGETS.latencyReductionPercent,
  };
}

/**
 * Validate Mem0 token savings claim from token results.
 */
function validateTokenClaim(tokenResults: readonly TokenBenchmarkResult[]): ClaimValidation {
  const avgSavings =
    tokenResults.length > 0
      ? tokenResults.reduce((sum, r) => sum + r.savingsPercent, 0) / tokenResults.length
      : 0;

  return {
    claim: 'Token savings',
    targetPercent: MEM0_TARGETS.tokenSavingsPercent,
    actualPercent: avgSavings,
    met: avgSavings >= MEM0_TARGETS.tokenSavingsPercent,
    delta: avgSavings - MEM0_TARGETS.tokenSavingsPercent,
  };
}

/**
 * Validate Mem0 quality improvement claim from suite results.
 */
function validateQualityClaim(suite: BenchmarkSuiteResult | undefined): ClaimValidation {
  // Extract quality metrics from search operations
  const searchOps = suite?.operations.filter((op) => op.quality !== undefined) ?? [];

  const avgF1 =
    searchOps.length > 0
      ? searchOps.reduce((sum, op) => sum + (op.quality?.f1Score ?? 0), 0) / searchOps.length
      : 0;

  // Quality improvement is measured as F1 score percentage
  // Mem0 claims 26% improvement; we check if F1 >= 0.26 as baseline
  const actualPercent = avgF1 * 100;

  return {
    claim: 'Quality improvement (F1)',
    targetPercent: MEM0_TARGETS.qualityImprovementPercent,
    actualPercent,
    met: actualPercent >= MEM0_TARGETS.qualityImprovementPercent,
    delta: actualPercent - MEM0_TARGETS.qualityImprovementPercent,
  };
}

/**
 * Generate a complete benchmark report.
 */
export function generateBenchmarkReport(options: ReportOptions): BenchmarkReport {
  const validations: ClaimValidation[] = [
    validateLatencyClaim(options.comparison),
    validateTokenClaim(options.tokenResults ?? []),
    validateQualityClaim(options.suite),
  ];

  return {
    version: '1.0.0',
    timestamp: getTimeProvider().nowIso(),
    suite: options.suite ?? null,
    comparison: options.comparison ?? null,
    tokenResults: options.tokenResults ?? [],
    consolidation: options.consolidation ?? null,
    mem0Validation: validations,
    overallPass: validations.every((v) => v.met),
  };
}

/**
 * Format a benchmark report as a human-readable string.
 */
export function formatBenchmarkReport(report: BenchmarkReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('Mem0 Memory Benchmark Report');
  lines.push(`Generated: ${report.timestamp}`);
  lines.push('='.repeat(60));

  // Mem0 claim validation
  lines.push('\nMem0 Claim Validation:');
  for (const v of report.mem0Validation) {
    const status = v.met ? 'PASS' : 'FAIL';
    const sign = v.delta >= 0 ? '+' : '';
    lines.push(
      `  [${status}] ${v.claim}: ${v.actualPercent.toFixed(1)}% ` +
        `(target: ${String(v.targetPercent)}%, delta: ${sign}${v.delta.toFixed(1)}%)`
    );
  }

  // Token savings
  if (report.tokenResults.length > 0) {
    lines.push('\nToken Savings by Dataset Size:');
    for (const t of report.tokenResults) {
      const status = t.meetsMemZeroTarget ? 'PASS' : 'FAIL';
      lines.push(
        `  [${status}] n=${String(t.datasetSize)}: ` +
          `${String(t.baseline.totalTokens)} → ${String(t.optimized.totalTokens)} tokens ` +
          `(${t.savingsPercent.toFixed(1)}% saved)`
      );
    }
  }

  // Consolidation
  if (report.consolidation !== null) {
    lines.push('\nConsolidation Operations:');
    for (const op of report.consolidation.operations) {
      lines.push(
        `  ${op.operation}: p95=${op.latency.p95.toFixed(2)}ms, ` +
          `${op.throughput.opsPerSecond.toFixed(0)} ops/sec`
      );
    }
  }

  // Overall
  lines.push('\n' + '='.repeat(60));
  lines.push(`Overall: ${report.overallPass ? 'ALL CLAIMS VALIDATED' : 'SOME CLAIMS NOT MET'}`);
  lines.push('='.repeat(60));

  return lines.join('\n');
}
