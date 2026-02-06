/**
 * Tests for adapter-latency-benchmark.ts
 *
 * Uses mock adapters to verify benchmark harness logic.
 * (Source: Issue #694)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ICliAdapter } from '../cli-adapters/types-capability.js';
import type { CliName, CliTransport, CliResponse, CliError } from '../cli-adapters/types-core.js';
import type { Result } from '../core/index.js';
import {
  runAdapterLatencyBenchmark,
  formatAdapterLatencyReport,
  toSuiteResult,
  DEFAULT_ADAPTER_LATENCY_CONFIG,
  DEFAULT_SCENARIOS,
} from './adapter-latency-benchmark.js';
import type {
  AdapterLatencyConfig,
  AdapterLatencyResult,
  LatencyScenario,
} from './adapter-latency-benchmark.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockAdapter(
  name: CliName = 'claude',
  transport: CliTransport = 'subprocess',
  latencyMs = 10,
  shouldFail = false
) {
  const executeFn = vi.fn<ICliAdapter['execute']>();
  executeFn.mockImplementation(
    () =>
      new Promise<Result<CliResponse, CliError>>((resolve) => {
        setTimeout(() => {
          if (shouldFail) {
            resolve({
              ok: false,
              error: { code: 'EXECUTION_ERROR', message: 'Mock failure' },
            } as Result<CliResponse, CliError>);
          } else {
            resolve({
              ok: true,
              value: { text: 'Mock response', model: 'mock-model' },
            } as Result<CliResponse, CliError>);
          }
        }, latencyMs);
      })
  );

  return {
    name,
    transport,
    capabilities: {
      reasoning: 8,
      contextWindow: 200_000,
      codeGeneration: 8,
      speed: 7,
      cost: 5,
    },
    execute: executeFn,
    healthCheck: vi.fn(),
    getCapacity: vi.fn(),
    getVersion: vi.fn(() => Promise.resolve('1.0.0')),
    getModelInfo: vi.fn(() => ({
      id: 'mock-model',
      name: 'Mock Model',
      contextWindow: 200_000,
    })),
    initialize: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(() => Promise.resolve()),
  } satisfies ICliAdapter;
}

const FAST_CONFIG: Partial<AdapterLatencyConfig> = {
  warmupIterations: 1,
  measurementIterations: 3,
  timeoutMs: 5000,
};

const SINGLE_SCENARIO: LatencyScenario[] = [
  { name: 'test-prompt', content: 'Hello', maxTokens: 10 },
];

describe('runAdapterLatencyBenchmark', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns results for each adapter-scenario pair', async () => {
    const adapter1 = makeMockAdapter('claude', 'subprocess', 5);
    const adapter2 = makeMockAdapter('gemini', 'subprocess', 5);

    const result = await runAdapterLatencyBenchmark(
      [adapter1, adapter2],
      SINGLE_SCENARIO,
      FAST_CONFIG
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.adapterName).toBe('claude');
    expect(result.results[1]?.adapterName).toBe('gemini');
  });

  it('records latency metrics', async () => {
    const adapter = makeMockAdapter('claude', 'subprocess', 5);

    const result = await runAdapterLatencyBenchmark([adapter], SINGLE_SCENARIO, FAST_CONFIG);

    const r = result.results[0];
    expect(r).toBeDefined();
    expect(r?.latency.sampleCount).toBe(3);
    expect(r?.latency.mean).toBeGreaterThan(0);
    expect(r?.latency.p50).toBeGreaterThan(0);
    expect(r?.latency.p95).toBeGreaterThanOrEqual(r?.latency.p50 ?? 0);
  });

  it('tracks success and failure counts', async () => {
    const adapter = makeMockAdapter('claude', 'subprocess', 2, true);

    const result = await runAdapterLatencyBenchmark([adapter], SINGLE_SCENARIO, FAST_CONFIG);

    const r = result.results[0];
    expect(r?.failureCount).toBe(3);
    expect(r?.successCount).toBe(0);
    expect(r?.errors.length).toBeGreaterThan(0);
  });

  it('includes environment information', async () => {
    const adapter = makeMockAdapter('claude', 'subprocess', 2);

    const result = await runAdapterLatencyBenchmark([adapter], SINGLE_SCENARIO, FAST_CONFIG);

    expect(result.environment.nodeVersion).toBeTruthy();
    expect(result.environment.platform).toBeTruthy();
    expect(result.environment.cpuCores).toBeGreaterThan(0);
  });

  it('records total duration', async () => {
    const adapter = makeMockAdapter('claude', 'subprocess', 2);

    const result = await runAdapterLatencyBenchmark([adapter], SINGLE_SCENARIO, FAST_CONFIG);

    expect(result.totalDurationMs).toBeGreaterThan(0);
  });

  it('includes timestamp', async () => {
    const adapter = makeMockAdapter('claude', 'subprocess', 2);

    const result = await runAdapterLatencyBenchmark([adapter], SINGLE_SCENARIO, FAST_CONFIG);

    expect(result.timestamp).toBeTruthy();
  });

  it('runs warmup iterations before measurement', async () => {
    const adapter = makeMockAdapter('claude', 'subprocess', 2);

    await runAdapterLatencyBenchmark([adapter], SINGLE_SCENARIO, {
      warmupIterations: 2,
      measurementIterations: 3,
      timeoutMs: 5000,
    });

    // warmup (2) + measurement (3) = 5 calls
    expect(adapter.execute).toHaveBeenCalledTimes(5);
  });

  it('handles adapter throwing exceptions', async () => {
    const adapter = makeMockAdapter('claude', 'subprocess', 2);
    adapter.execute.mockRejectedValue(new Error('Connection refused'));

    const result = await runAdapterLatencyBenchmark([adapter], SINGLE_SCENARIO, FAST_CONFIG);

    const r = result.results[0];
    expect(r?.failureCount).toBe(3);
    expect(r?.errors[0]).toContain('Connection refused');
  });

  it('benchmarks multiple scenarios per adapter', async () => {
    const adapter = makeMockAdapter('claude', 'subprocess', 2);
    const scenarios: LatencyScenario[] = [
      { name: 'simple', content: 'Hi', maxTokens: 10 },
      { name: 'complex', content: 'Analyze...', maxTokens: 500 },
    ];

    const result = await runAdapterLatencyBenchmark([adapter], scenarios, FAST_CONFIG);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.scenario).toBe('simple');
    expect(result.results[1]?.scenario).toBe('complex');
  });

  it('preserves transport type in results', async () => {
    const sub = makeMockAdapter('claude', 'subprocess', 2);
    const mcp = makeMockAdapter('codex', 'mcp', 2);

    const result = await runAdapterLatencyBenchmark([sub, mcp], SINGLE_SCENARIO, FAST_CONFIG);

    expect(result.results[0]?.transport).toBe('subprocess');
    expect(result.results[1]?.transport).toBe('mcp');
  });

  it('handles empty adapter list', async () => {
    const result = await runAdapterLatencyBenchmark([], SINGLE_SCENARIO, FAST_CONFIG);

    expect(result.results).toHaveLength(0);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('formatAdapterLatencyReport', () => {
  function makeResult(overrides: Partial<AdapterLatencyResult> = {}): AdapterLatencyResult {
    return {
      timestamp: '2026-02-05T12:00:00-05:00',
      environment: {
        nodeVersion: 'v22.0.0',
        platform: 'linux',
        arch: 'x64',
        cpuModel: 'Test CPU',
        cpuCores: 8,
        totalMemory: 16 * 1024 * 1024 * 1024,
      },
      results: [
        {
          adapterName: 'claude',
          transport: 'subprocess',
          scenario: 'simple-prompt',
          latency: {
            min: 100,
            max: 200,
            mean: 150,
            p50: 145,
            p75: 170,
            p90: 185,
            p95: 195,
            p99: 200,
            stdDev: 25,
            sampleCount: 10,
          },
          successCount: 10,
          failureCount: 0,
          errors: [],
        },
        {
          adapterName: 'codex',
          transport: 'mcp',
          scenario: 'simple-prompt',
          latency: {
            min: 30,
            max: 80,
            mean: 50,
            p50: 48,
            p75: 60,
            p90: 70,
            p95: 75,
            p99: 80,
            stdDev: 12,
            sampleCount: 10,
          },
          successCount: 10,
          failureCount: 0,
          errors: [],
        },
      ],
      totalDurationMs: 5000,
      ...overrides,
    };
  }

  it('includes header and metadata', () => {
    const report = formatAdapterLatencyReport(makeResult());

    expect(report).toContain('# CLI Adapter Latency Benchmark Report');
    expect(report).toContain('2026-02-05');
    expect(report).toContain('linux');
    expect(report).toContain('v22.0.0');
  });

  it('includes scenario tables', () => {
    const report = formatAdapterLatencyReport(makeResult());

    expect(report).toContain('## Scenario: simple-prompt');
    expect(report).toContain('| claude |');
    expect(report).toContain('| codex |');
  });

  it('shows transport type in table', () => {
    const report = formatAdapterLatencyReport(makeResult());

    expect(report).toContain('subprocess');
    expect(report).toContain('mcp');
  });

  it('includes transport comparison section', () => {
    const report = formatAdapterLatencyReport(makeResult());

    expect(report).toContain('## Transport Comparison');
    expect(report).toContain('**subprocess**');
    expect(report).toContain('**mcp**');
  });

  it('calculates success rate', () => {
    const result = makeResult({
      results: [
        {
          adapterName: 'claude',
          transport: 'subprocess',
          scenario: 'test',
          latency: {
            min: 0,
            max: 0,
            mean: 0,
            p50: 0,
            p75: 0,
            p90: 0,
            p95: 0,
            p99: 0,
            stdDev: 0,
            sampleCount: 10,
          },
          successCount: 8,
          failureCount: 2,
          errors: ['err1', 'err2'],
        },
      ],
    });
    const report = formatAdapterLatencyReport(result);

    expect(report).toContain('80%');
  });

  it('handles empty results', () => {
    const result = makeResult({ results: [] });
    const report = formatAdapterLatencyReport(result);

    expect(report).toContain('# CLI Adapter Latency Benchmark Report');
    expect(report).toContain('## Transport Comparison');
  });
});

describe('toSuiteResult', () => {
  it('converts to BenchmarkSuiteResult format', () => {
    const result: AdapterLatencyResult = {
      timestamp: '2026-02-05T12:00:00-05:00',
      environment: {
        nodeVersion: 'v22.0.0',
        platform: 'linux',
        arch: 'x64',
        cpuModel: 'CPU',
        cpuCores: 4,
        totalMemory: 8 * 1024 * 1024 * 1024,
      },
      results: [
        {
          adapterName: 'claude',
          transport: 'subprocess',
          scenario: 'simple',
          latency: {
            min: 10,
            max: 20,
            mean: 15,
            p50: 14,
            p75: 17,
            p90: 19,
            p95: 20,
            p99: 20,
            stdDev: 3,
            sampleCount: 5,
          },
          successCount: 5,
          failureCount: 0,
          errors: [],
        },
      ],
      totalDurationMs: 1000,
    };

    const suite = toSuiteResult(result);

    expect(suite.name).toBe('CLI Adapter Latency');
    expect(suite.component).toBe('cli-adapters');
    expect(suite.operations).toHaveLength(1);
    expect(suite.operations[0]?.operation).toBe('claude/simple');
    expect(suite.summary.passed).toBe(true);
  });

  it('handles empty results', () => {
    const result: AdapterLatencyResult = {
      timestamp: '2026-02-05T12:00:00-05:00',
      environment: {
        nodeVersion: 'v22.0.0',
        platform: 'linux',
        arch: 'x64',
        cpuModel: 'CPU',
        cpuCores: 4,
        totalMemory: 8 * 1024 * 1024 * 1024,
      },
      results: [],
      totalDurationMs: 0,
    };

    const suite = toSuiteResult(result);

    expect(suite.operations).toHaveLength(0);
    expect(suite.summary.avgP95Latency).toBe(0);
  });
});

describe('DEFAULT_ADAPTER_LATENCY_CONFIG', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_ADAPTER_LATENCY_CONFIG.warmupIterations).toBeGreaterThan(0);
    expect(DEFAULT_ADAPTER_LATENCY_CONFIG.measurementIterations).toBeGreaterThan(0);
    expect(DEFAULT_ADAPTER_LATENCY_CONFIG.timeoutMs).toBeGreaterThan(0);
  });
});

describe('DEFAULT_SCENARIOS', () => {
  it('includes simple and complex scenarios', () => {
    expect(DEFAULT_SCENARIOS.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_SCENARIOS[0]?.name).toBe('simple-prompt');
    expect(DEFAULT_SCENARIOS[1]?.name).toBe('complex-prompt');
  });

  it('simple scenario has fewer max tokens', () => {
    const simple = DEFAULT_SCENARIOS[0];
    const complex = DEFAULT_SCENARIOS[1];

    expect(simple?.maxTokens).toBeLessThan(complex?.maxTokens ?? 0);
  });
});
