/**
 * nexus-agents/benchmarks - Benchmark Runner Tests
 *
 * Unit tests for the benchmark runner utilities.
 *
 * @module benchmarks/benchmark-runner.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LatencySampler,
  runOperationBenchmark,
  getBenchmarkEnvironment,
  createBenchmarkSummary,
  formatBenchmarkResults,
  type BenchmarkOperation,
} from './benchmark-runner.js';
import type { OperationBenchmark, BenchmarkSuiteResult } from './benchmark-types.js';
import { DEFAULT_BENCHMARK_CONFIG } from './benchmark-types.js';

describe('LatencySampler', () => {
  let sampler: LatencySampler;

  beforeEach(() => {
    sampler = new LatencySampler();
  });

  describe('start/end timing', () => {
    it('should record timing between start and end', () => {
      sampler.start('test-1');
      // Simulate some delay (hrtime.bigint is real, so timing will be minimal)
      sampler.end('test-1');

      const metrics = sampler.getMetrics();
      expect(metrics.sampleCount).toBe(1);
      expect(metrics.min).toBeGreaterThanOrEqual(0);
      expect(metrics.max).toBeGreaterThanOrEqual(0);
    });

    it('should throw when ending non-existent timing', () => {
      expect(() => sampler.end('non-existent')).toThrow('No start time for non-existent');
    });

    it('should handle multiple concurrent timings', () => {
      sampler.start('op-1');
      sampler.start('op-2');
      sampler.end('op-1');
      sampler.end('op-2');

      const metrics = sampler.getMetrics();
      expect(metrics.sampleCount).toBe(2);
    });

    it('should remove start time after end', () => {
      sampler.start('op-1');
      sampler.end('op-1');

      // Second end should throw since start time was removed
      expect(() => sampler.end('op-1')).toThrow('No start time for op-1');
    });

    it('should clamp negative durations to zero', () => {
      // Simulate clock adjustment by mocking hrtime.bigint
      const hrtimeSpy = vi.spyOn(process.hrtime, 'bigint');
      hrtimeSpy.mockReturnValueOnce(BigInt(200_000_000)); // start: 200ms
      hrtimeSpy.mockReturnValueOnce(BigInt(100_000_000)); // end: 100ms (before start)

      sampler.start('clock-adj');
      const duration = sampler.end('clock-adj');

      expect(duration).toBe(0);
      expect(sampler.getMetrics().min).toBe(0);

      hrtimeSpy.mockRestore();
    });
  });

  describe('record', () => {
    it('should record duration directly', () => {
      sampler.record(10.5);
      sampler.record(20.5);

      const metrics = sampler.getMetrics();
      expect(metrics.sampleCount).toBe(2);
      expect(metrics.min).toBe(10.5);
      expect(metrics.max).toBe(20.5);
    });
  });

  describe('getMetrics', () => {
    it('should return empty metrics when no samples', () => {
      const metrics = sampler.getMetrics();

      expect(metrics.min).toBe(0);
      expect(metrics.max).toBe(0);
      expect(metrics.mean).toBe(0);
      expect(metrics.p50).toBe(0);
      expect(metrics.p75).toBe(0);
      expect(metrics.p90).toBe(0);
      expect(metrics.p95).toBe(0);
      expect(metrics.p99).toBe(0);
      expect(metrics.stdDev).toBe(0);
      expect(metrics.sampleCount).toBe(0);
    });

    it('should calculate correct metrics for single sample', () => {
      sampler.record(100);

      const metrics = sampler.getMetrics();
      expect(metrics.min).toBe(100);
      expect(metrics.max).toBe(100);
      expect(metrics.mean).toBe(100);
      expect(metrics.p50).toBe(100);
      expect(metrics.p95).toBe(100);
      expect(metrics.p99).toBe(100);
      expect(metrics.stdDev).toBe(0);
      expect(metrics.sampleCount).toBe(1);
    });

    it('should calculate correct mean', () => {
      sampler.record(10);
      sampler.record(20);
      sampler.record(30);
      sampler.record(40);

      const metrics = sampler.getMetrics();
      expect(metrics.mean).toBe(25);
    });

    it('should calculate correct min/max', () => {
      sampler.record(5);
      sampler.record(100);
      sampler.record(50);

      const metrics = sampler.getMetrics();
      expect(metrics.min).toBe(5);
      expect(metrics.max).toBe(100);
    });

    it('should calculate correct standard deviation', () => {
      // Values: 2, 4, 4, 4, 5, 5, 7, 9
      // Mean: 5
      // Variance: ((2-5)^2 + (4-5)^2 + (4-5)^2 + (4-5)^2 + (5-5)^2 + (5-5)^2 + (7-5)^2 + (9-5)^2) / 8
      //         = (9 + 1 + 1 + 1 + 0 + 0 + 4 + 16) / 8 = 32 / 8 = 4
      // StdDev: sqrt(4) = 2
      [2, 4, 4, 4, 5, 5, 7, 9].forEach((v) => {
        sampler.record(v);
      });

      const metrics = sampler.getMetrics();
      expect(metrics.mean).toBe(5);
      expect(metrics.stdDev).toBe(2);
    });

    it('should calculate correct percentiles with linear interpolation', () => {
      // 100 samples: 1, 2, 3, ..., 100
      for (let i = 1; i <= 100; i++) {
        sampler.record(i);
      }

      const metrics = sampler.getMetrics();

      // p50 at index 49.5 (between 50 and 51)
      expect(metrics.p50).toBe(50.5);
      // p75 at index 74.25 (between 75 and 76)
      expect(metrics.p75).toBeCloseTo(75.25, 2);
      // p90 at index 89.1 (between 90 and 91)
      expect(metrics.p90).toBeCloseTo(90.1, 2);
      // p95 at index 94.05 (between 95 and 96)
      expect(metrics.p95).toBeCloseTo(95.05, 2);
      // p99 at index 98.01 (between 99 and 100)
      expect(metrics.p99).toBeCloseTo(99.01, 2);
    });
  });

  describe('reset', () => {
    it('should clear all samples and start times', () => {
      sampler.record(10);
      sampler.record(20);
      sampler.start('pending');

      sampler.reset();

      const metrics = sampler.getMetrics();
      expect(metrics.sampleCount).toBe(0);
      // Pending start time should also be cleared
      expect(() => sampler.end('pending')).toThrow();
    });
  });
});

describe('runOperationBenchmark', () => {
  let operationCallCount: number;
  let mockOperation: BenchmarkOperation;

  beforeEach(() => {
    vi.useFakeTimers();
    operationCallCount = 0;
    mockOperation = vi.fn(async () => {
      operationCallCount++;
      // Simulate small delay
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute warmup iterations', async () => {
    const config = { warmupIterations: 5, measurementIterations: 10 };

    const promise = runOperationBenchmark('test-op', 100, mockOperation, config);
    await vi.runAllTimersAsync();
    await promise;

    // Should be called warmupIterations + measurementIterations times
    expect(operationCallCount).toBe(15);
  });

  it('should use default config when not provided', async () => {
    const promise = runOperationBenchmark('test-op', 100, mockOperation);
    await vi.runAllTimersAsync();
    await promise;

    // Default: 10 warmup + 100 measurement
    expect(operationCallCount).toBe(
      DEFAULT_BENCHMARK_CONFIG.warmupIterations + DEFAULT_BENCHMARK_CONFIG.measurementIterations
    );
  });

  it('should return correct operation name and dataset size', async () => {
    const promise = runOperationBenchmark('my-operation', 500, mockOperation, {
      warmupIterations: 1,
      measurementIterations: 1,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.operation).toBe('my-operation');
    expect(result.datasetSize).toBe(500);
  });

  it('should return latency metrics', async () => {
    const promise = runOperationBenchmark('test-op', 100, mockOperation, {
      warmupIterations: 1,
      measurementIterations: 10,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.latency.sampleCount).toBe(10);
    expect(result.latency.min).toBeGreaterThanOrEqual(0);
    expect(result.latency.max).toBeGreaterThanOrEqual(result.latency.min);
    expect(result.latency.mean).toBeGreaterThanOrEqual(0);
  });

  it('should return throughput metrics', async () => {
    const promise = runOperationBenchmark('test-op', 100, mockOperation, {
      warmupIterations: 1,
      measurementIterations: 10,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.throughput.totalOps).toBe(10);
    expect(result.throughput.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.throughput.opsPerSecond).toBeGreaterThan(0);
  });

  it('should return resource metrics with peak memory', async () => {
    const promise = runOperationBenchmark('test-op', 100, mockOperation, {
      warmupIterations: 1,
      measurementIterations: 5,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.resources.peakMemoryBytes).toBeGreaterThan(0);
    expect(result.resources.avgMemoryBytes).toBeGreaterThan(0);
    expect(result.resources.cpuTimeMs).toBeGreaterThan(0);
  });

  it('should include timestamp', async () => {
    const promise = runOperationBenchmark('test-op', 100, mockOperation, {
      warmupIterations: 1,
      measurementIterations: 1,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.timestamp).toBeDefined();
    // Should be valid ISO date
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('should handle synchronous operations', async () => {
    const syncOp = vi.fn((): void => {
      // Synchronous operation
    });

    const promise = runOperationBenchmark('sync-op', 100, syncOp, {
      warmupIterations: 2,
      measurementIterations: 5,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(syncOp).toHaveBeenCalledTimes(7);
    expect(result.latency.sampleCount).toBe(5);
  });
});

describe('getBenchmarkEnvironment', () => {
  it('should return environment information', () => {
    const env = getBenchmarkEnvironment();

    expect(env.nodeVersion).toBe(process.version);
    expect(typeof env.platform).toBe('string');
    expect(typeof env.arch).toBe('string');
    expect(typeof env.cpuModel).toBe('string');
    expect(env.cpuCores).toBeGreaterThan(0);
    expect(env.totalMemory).toBeGreaterThan(0);
  });

  it('should return consistent values across calls', () => {
    const env1 = getBenchmarkEnvironment();
    const env2 = getBenchmarkEnvironment();

    expect(env1.nodeVersion).toBe(env2.nodeVersion);
    expect(env1.platform).toBe(env2.platform);
    expect(env1.arch).toBe(env2.arch);
    expect(env1.cpuCores).toBe(env2.cpuCores);
    expect(env1.totalMemory).toBe(env2.totalMemory);
  });
});

describe('createBenchmarkSummary', () => {
  const createMockOperation = (
    overrides: Partial<OperationBenchmark> = {}
  ): OperationBenchmark => ({
    operation: 'test-op',
    datasetSize: 100,
    latency: {
      min: 1,
      max: 10,
      mean: 5,
      p50: 5,
      p75: 7,
      p90: 9,
      p95: 10,
      p99: 10,
      stdDev: 2,
      sampleCount: 100,
    },
    throughput: {
      opsPerSecond: 1000,
      totalOps: 100,
      durationMs: 100,
    },
    resources: {
      peakMemoryBytes: 50 * 1024 * 1024,
      avgMemoryBytes: 40 * 1024 * 1024,
      cpuTimeMs: 100,
    },
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  it('should calculate total duration from all operations', () => {
    const operations = [
      createMockOperation({ throughput: { opsPerSecond: 100, totalOps: 10, durationMs: 100 } }),
      createMockOperation({ throughput: { opsPerSecond: 200, totalOps: 20, durationMs: 200 } }),
    ];

    const summary = createBenchmarkSummary(operations);
    expect(summary.totalDurationMs).toBe(300);
  });

  it('should calculate total operations', () => {
    const operations = [
      createMockOperation({ throughput: { opsPerSecond: 100, totalOps: 50, durationMs: 100 } }),
      createMockOperation({ throughput: { opsPerSecond: 200, totalOps: 150, durationMs: 200 } }),
    ];

    const summary = createBenchmarkSummary(operations);
    expect(summary.totalOperations).toBe(200);
  });

  it('should calculate overall throughput', () => {
    const operations = [
      createMockOperation({ throughput: { opsPerSecond: 100, totalOps: 100, durationMs: 1000 } }),
      createMockOperation({ throughput: { opsPerSecond: 200, totalOps: 200, durationMs: 1000 } }),
    ];

    const summary = createBenchmarkSummary(operations);
    // 300 ops in 2 seconds = 150 ops/sec
    expect(summary.overallThroughput).toBe(150);
  });

  it('should calculate average p95 latency', () => {
    const operations = [
      createMockOperation({
        latency: {
          min: 1,
          max: 10,
          mean: 5,
          p50: 5,
          p75: 7,
          p90: 9,
          p95: 20,
          p99: 25,
          stdDev: 2,
          sampleCount: 100,
        },
      }),
      createMockOperation({
        latency: {
          min: 1,
          max: 10,
          mean: 5,
          p50: 5,
          p75: 7,
          p90: 9,
          p95: 40,
          p99: 45,
          stdDev: 2,
          sampleCount: 100,
        },
      }),
    ];

    const summary = createBenchmarkSummary(operations);
    expect(summary.avgP95Latency).toBe(30);
  });

  it('should pass when all thresholds are met', () => {
    const operations = [
      createMockOperation({
        latency: {
          min: 1,
          max: 10,
          mean: 5,
          p50: 5,
          p75: 7,
          p90: 9,
          p95: 50,
          p99: 55,
          stdDev: 2,
          sampleCount: 100,
        },
        throughput: { opsPerSecond: 500, totalOps: 100, durationMs: 100 },
        resources: {
          peakMemoryBytes: 100 * 1024 * 1024,
          avgMemoryBytes: 80 * 1024 * 1024,
          cpuTimeMs: 100,
        },
      }),
    ];

    const summary = createBenchmarkSummary(operations);
    expect(summary.passed).toBe(true);
    expect(summary.failures).toHaveLength(0);
  });

  // #4585: `passed` was `failures.length === 0` over a loop that never ran for
  // an empty suite, so a run that benchmarked nothing certified the perf gate.
  it('should not pass when zero operations were benchmarked', () => {
    const summary = createBenchmarkSummary([]);

    expect(summary.passed).toBe(false);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]).toContain('No operations were benchmarked');
  });

  it('should report zero rather than NaN aggregates for an empty suite', () => {
    const summary = createBenchmarkSummary([]);

    expect(summary.totalOperations).toBe(0);
    expect(summary.totalDurationMs).toBe(0);
    expect(summary.overallThroughput).toBe(0);
    expect(summary.avgP95Latency).toBe(0);
  });

  it('should fail when p95 latency exceeds threshold', () => {
    const operations = [
      createMockOperation({
        operation: 'slow-op',
        latency: {
          min: 1,
          max: 200,
          mean: 100,
          p50: 100,
          p75: 150,
          p90: 180,
          p95: 200,
          p99: 220,
          stdDev: 50,
          sampleCount: 100,
        },
      }),
    ];

    const summary = createBenchmarkSummary(operations);
    expect(summary.passed).toBe(false);
    expect(summary.failures).toContain('slow-op: p95 latency 200.00ms exceeds threshold');
  });

  it('should fail when throughput is below threshold', () => {
    const operations = [
      createMockOperation({
        operation: 'slow-throughput',
        throughput: { opsPerSecond: 50, totalOps: 50, durationMs: 1000 },
      }),
    ];

    const summary = createBenchmarkSummary(operations);
    expect(summary.passed).toBe(false);
    expect(summary.failures).toContain('slow-throughput: throughput 50.00 below threshold');
  });

  it('should fail when memory exceeds threshold', () => {
    const operations = [
      createMockOperation({
        operation: 'memory-hog',
        resources: {
          peakMemoryBytes: 600 * 1024 * 1024,
          avgMemoryBytes: 550 * 1024 * 1024,
          cpuTimeMs: 100,
        },
      }),
    ];

    const summary = createBenchmarkSummary(operations);
    expect(summary.passed).toBe(false);
    expect(summary.failures.some((f) => f.includes('memory-hog') && f.includes('memory'))).toBe(
      true
    );
  });

  it('should use custom config thresholds', () => {
    const operations = [
      createMockOperation({
        latency: {
          min: 1,
          max: 10,
          mean: 5,
          p50: 5,
          p75: 7,
          p90: 9,
          p95: 50,
          p99: 55,
          stdDev: 2,
          sampleCount: 100,
        },
      }),
    ];

    const strictConfig = {
      thresholds: {
        maxP95LatencyMs: 10, // Much stricter
        minThroughput: 100,
        maxMemoryBytes: 512 * 1024 * 1024,
      },
    };

    const summary = createBenchmarkSummary(operations, strictConfig);
    expect(summary.passed).toBe(false);
    expect(summary.failures.some((f) => f.includes('p95 latency'))).toBe(true);
  });

  it('should collect multiple failures', () => {
    const operations = [
      createMockOperation({
        operation: 'bad-op',
        latency: {
          min: 1,
          max: 200,
          mean: 100,
          p50: 100,
          p75: 150,
          p90: 180,
          p95: 200,
          p99: 220,
          stdDev: 50,
          sampleCount: 100,
        },
        throughput: { opsPerSecond: 50, totalOps: 50, durationMs: 1000 },
        resources: {
          peakMemoryBytes: 600 * 1024 * 1024,
          avgMemoryBytes: 550 * 1024 * 1024,
          cpuTimeMs: 100,
        },
      }),
    ];

    const summary = createBenchmarkSummary(operations);
    expect(summary.passed).toBe(false);
    expect(summary.failures.length).toBe(3);
  });
});

describe('formatBenchmarkResults', () => {
  const createMockSuiteResult = (): BenchmarkSuiteResult => ({
    name: 'Test Suite',
    component: 'test-component',
    version: '1.0.0',
    operations: [
      {
        operation: 'store',
        datasetSize: 100,
        latency: {
          min: 1,
          max: 10,
          mean: 5,
          p50: 5,
          p75: 7,
          p90: 9,
          p95: 10,
          p99: 12,
          stdDev: 2,
          sampleCount: 100,
        },
        throughput: {
          opsPerSecond: 1000,
          totalOps: 100,
          durationMs: 100,
        },
        resources: {
          peakMemoryBytes: 50 * 1024 * 1024,
          avgMemoryBytes: 40 * 1024 * 1024,
          cpuTimeMs: 100,
        },
        timestamp: new Date().toISOString(),
      },
    ],
    environment: {
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      cpuModel: 'Test CPU',
      cpuCores: 8,
      totalMemory: 16 * 1024 * 1024 * 1024,
    },
    summary: {
      totalDurationMs: 100,
      totalOperations: 100,
      overallThroughput: 1000,
      avgP95Latency: 10,
      passed: true,
      failures: [],
    },
  });

  it('should format suite header', () => {
    const result = createMockSuiteResult();
    const formatted = formatBenchmarkResults(result);

    expect(formatted).toContain('Benchmark Suite: Test Suite');
    expect(formatted).toContain('Component: test-component v1.0.0');
  });

  it('should format environment information', () => {
    const result = createMockSuiteResult();
    const formatted = formatBenchmarkResults(result);

    expect(formatted).toContain('Node.js: v22.0.0');
    expect(formatted).toContain('Platform: linux x64');
    expect(formatted).toContain('CPU: Test CPU (8 cores)');
    expect(formatted).toContain('Memory: 16.0 GB');
  });

  it('should format operation results', () => {
    const result = createMockSuiteResult();
    const formatted = formatBenchmarkResults(result);

    expect(formatted).toContain('store (n=100)');
    expect(formatted).toContain('Latency: p50=5.00ms, p95=10.00ms, p99=12.00ms');
    expect(formatted).toContain('Throughput: 1000.00 ops/sec');
    expect(formatted).toContain('Memory: 50.00 MB peak');
  });

  it('should format summary', () => {
    const result = createMockSuiteResult();
    const formatted = formatBenchmarkResults(result);

    expect(formatted).toContain('Total Duration: 100.00ms');
    expect(formatted).toContain('Total Operations: 100');
    expect(formatted).toContain('Overall Throughput: 1000.00 ops/sec');
    expect(formatted).toContain('Average p95 Latency: 10.00ms');
    expect(formatted).toContain('Status: PASSED');
  });

  it('should format failures when present', () => {
    const base = createMockSuiteResult();
    const result: BenchmarkSuiteResult = {
      ...base,
      summary: {
        ...base.summary,
        passed: false,
        failures: ['op1: p95 latency exceeded', 'op2: throughput below threshold'],
      },
    };

    const formatted = formatBenchmarkResults(result);

    expect(formatted).toContain('Status: FAILED');
    expect(formatted).toContain('Failures:');
    expect(formatted).toContain('op1: p95 latency exceeded');
    expect(formatted).toContain('op2: throughput below threshold');
  });

  it('should not include failures section when passed', () => {
    const result = createMockSuiteResult();
    const formatted = formatBenchmarkResults(result);

    expect(formatted).not.toContain('Failures:');
  });

  it('should format multiple operations', () => {
    const base = createMockSuiteResult();
    const result: BenchmarkSuiteResult = {
      ...base,
      operations: [
        ...base.operations,
        {
          operation: 'retrieve',
          datasetSize: 200,
          latency: {
            min: 2,
            max: 20,
            mean: 10,
            p50: 10,
            p75: 15,
            p90: 18,
            p95: 20,
            p99: 25,
            stdDev: 4,
            sampleCount: 200,
          },
          throughput: {
            opsPerSecond: 500,
            totalOps: 200,
            durationMs: 400,
          },
          resources: {
            peakMemoryBytes: 60 * 1024 * 1024,
            avgMemoryBytes: 50 * 1024 * 1024,
            cpuTimeMs: 400,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const formatted = formatBenchmarkResults(result);

    expect(formatted).toContain('store (n=100)');
    expect(formatted).toContain('retrieve (n=200)');
  });
});
