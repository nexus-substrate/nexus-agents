/**
 * nexus-agents/benchmarks - Benchmark Report Tests
 *
 * @module benchmarks/benchmark-report.test
 */

import { describe, it, expect } from 'vitest';
import {
  MEM0_TARGETS,
  generateBenchmarkReport,
  formatBenchmarkReport,
} from './benchmark-report.js';
import type { BenchmarkSuiteResult, OperationBenchmark } from './benchmark-types.js';
import type { BenchmarkComparison } from './memory-benchmarks-helpers.js';
import type { TokenBenchmarkResult } from './token-benchmark.js';

function createMockSuite(searchF1: number = 0.5): BenchmarkSuiteResult {
  const searchOp: OperationBenchmark = {
    operation: 'search',
    datasetSize: 100,
    latency: {
      min: 1,
      max: 10,
      mean: 5,
      p50: 4,
      p75: 7,
      p90: 9,
      p95: 9.5,
      p99: 10,
      stdDev: 2,
      sampleCount: 100,
    },
    throughput: { opsPerSecond: 1000, totalOps: 100, durationMs: 100 },
    resources: { peakMemoryBytes: 50e6, avgMemoryBytes: 40e6, cpuTimeMs: 100 },
    quality: { precision: 0.8, recall: 0.6, f1Score: searchF1, mrr: 0.7, ndcgAtK: 0.65 },
    timestamp: new Date().toISOString(),
  };

  return {
    name: 'Test Suite',
    component: 'memory-backend',
    version: '2.0.0',
    operations: [searchOp],
    environment: {
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      cpuModel: 'Test CPU',
      cpuCores: 8,
      totalMemory: 16e9,
    },
    summary: {
      totalDurationMs: 100,
      totalOperations: 100,
      overallThroughput: 1000,
      avgP95Latency: 9.5,
      passed: true,
      failures: [],
    },
  };
}

function createMockComparison(latencyChangePercent: number): BenchmarkComparison {
  return {
    baseline: 'Baseline',
    current: 'Current',
    comparisons: [
      {
        operation: 'store',
        datasetSize: 100,
        baselineP95: 100,
        currentP95: 100 + latencyChangePercent,
        latencyChangePercent,
        baselineThroughput: 500,
        currentThroughput: 500,
        throughputChangePercent: 0,
        improved: latencyChangePercent < 0,
      },
    ],
    overallLatencyChangePercent: latencyChangePercent,
    meetsMemZeroTarget: latencyChangePercent <= -91,
  };
}

function createMockTokenResult(savingsPercent: number): TokenBenchmarkResult {
  return {
    datasetSize: 100,
    baseline: { inputTokens: 1000, outputTokens: 0, totalTokens: 1000, avgTokensPerOp: 200 },
    optimized: {
      inputTokens: 1000 * (1 - savingsPercent / 100),
      outputTokens: 0,
      totalTokens: 1000 * (1 - savingsPercent / 100),
      avgTokensPerOp: 200 * (1 - savingsPercent / 100),
    },
    savingsPercent,
    meetsMemZeroTarget: savingsPercent >= 90,
    searchesFailed: 0,
  };
}

describe('MEM0_TARGETS', () => {
  it('should define latency reduction target', () => {
    expect(MEM0_TARGETS.latencyReductionPercent).toBe(91);
  });

  it('should define token savings target', () => {
    expect(MEM0_TARGETS.tokenSavingsPercent).toBe(90);
  });

  it('should define quality improvement target', () => {
    expect(MEM0_TARGETS.qualityImprovementPercent).toBe(26);
  });
});

describe('generateBenchmarkReport', () => {
  it('should generate report with version and timestamp', () => {
    const report = generateBenchmarkReport({});

    expect(report.version).toBe('1.0.0');
    expect(report.timestamp).toBeDefined();
  });

  it('should include suite results when provided', () => {
    const suite = createMockSuite();
    const report = generateBenchmarkReport({ suite });

    expect(report.suite).toBe(suite);
  });

  it('should set suite to null when not provided', () => {
    const report = generateBenchmarkReport({});

    expect(report.suite).toBeNull();
  });

  it('should validate latency claim from comparison', () => {
    const comparison = createMockComparison(-92);
    const report = generateBenchmarkReport({ comparison });

    const latencyClaim = report.mem0Validation.find((v) => v.claim === 'Latency reduction');
    expect(latencyClaim).toBeDefined();
    expect(latencyClaim?.met).toBe(true);
    expect(latencyClaim?.actualPercent).toBe(92);
  });

  it('should fail latency claim when not met', () => {
    const comparison = createMockComparison(-50);
    const report = generateBenchmarkReport({ comparison });

    const latencyClaim = report.mem0Validation.find((v) => v.claim === 'Latency reduction');
    expect(latencyClaim?.met).toBe(false);
  });

  it('should validate token savings claim', () => {
    const tokenResults = [createMockTokenResult(95)];
    const report = generateBenchmarkReport({ tokenResults });

    const tokenClaim = report.mem0Validation.find((v) => v.claim === 'Token savings');
    expect(tokenClaim).toBeDefined();
    expect(tokenClaim?.met).toBe(true);
    expect(tokenClaim?.actualPercent).toBe(95);
  });

  it('should fail token claim when not met', () => {
    const tokenResults = [createMockTokenResult(50)];
    const report = generateBenchmarkReport({ tokenResults });

    const tokenClaim = report.mem0Validation.find((v) => v.claim === 'Token savings');
    expect(tokenClaim?.met).toBe(false);
  });

  it('should validate quality claim from suite F1 score', () => {
    const suite = createMockSuite(0.4); // 40% F1
    const report = generateBenchmarkReport({ suite });

    const qualityClaim = report.mem0Validation.find((v) => v.claim.includes('Quality'));
    expect(qualityClaim).toBeDefined();
    expect(qualityClaim?.met).toBe(true); // 40 >= 26
  });

  it('should fail quality claim when F1 too low', () => {
    const suite = createMockSuite(0.1); // 10% F1
    const report = generateBenchmarkReport({ suite });

    const qualityClaim = report.mem0Validation.find((v) => v.claim.includes('Quality'));
    expect(qualityClaim?.met).toBe(false); // 10 < 26
  });

  it('should set overallPass when all claims met', () => {
    const report = generateBenchmarkReport({
      comparison: createMockComparison(-92),
      tokenResults: [createMockTokenResult(95)],
      suite: createMockSuite(0.4),
    });

    expect(report.overallPass).toBe(true);
  });

  it('should set overallPass false when any claim fails', () => {
    const report = generateBenchmarkReport({
      comparison: createMockComparison(-50), // fails
      tokenResults: [createMockTokenResult(95)],
      suite: createMockSuite(0.4),
    });

    expect(report.overallPass).toBe(false);
  });

  it('should calculate delta for each claim', () => {
    const report = generateBenchmarkReport({
      comparison: createMockComparison(-80),
    });

    const latencyClaim = report.mem0Validation.find((v) => v.claim === 'Latency reduction');
    // actual 80, target 91, delta = -11
    expect(latencyClaim?.delta).toBe(-11);
  });

  it('should average token savings across multiple results', () => {
    const tokenResults = [createMockTokenResult(80), createMockTokenResult(100)];
    const report = generateBenchmarkReport({ tokenResults });

    const tokenClaim = report.mem0Validation.find((v) => v.claim === 'Token savings');
    expect(tokenClaim?.actualPercent).toBe(90);
  });
});

describe('formatBenchmarkReport', () => {
  it('should include report header', () => {
    const report = generateBenchmarkReport({});
    const formatted = formatBenchmarkReport(report);

    expect(formatted).toContain('Mem0 Memory Benchmark Report');
  });

  it('should include claim validation results', () => {
    const report = generateBenchmarkReport({
      comparison: createMockComparison(-92),
    });
    const formatted = formatBenchmarkReport(report);

    expect(formatted).toContain('[PASS] Latency reduction');
  });

  it('should include FAIL for unmet claims', () => {
    const report = generateBenchmarkReport({
      comparison: createMockComparison(-50),
    });
    const formatted = formatBenchmarkReport(report);

    expect(formatted).toContain('[FAIL] Latency reduction');
  });

  it('should include token savings section', () => {
    const report = generateBenchmarkReport({
      tokenResults: [createMockTokenResult(95)],
    });
    const formatted = formatBenchmarkReport(report);

    expect(formatted).toContain('Token Savings by Dataset Size');
    expect(formatted).toContain('95.0% saved');
  });

  it('should show overall status', () => {
    const report = generateBenchmarkReport({});
    const formatted = formatBenchmarkReport(report);

    expect(formatted).toMatch(/Overall:/);
  });
});
