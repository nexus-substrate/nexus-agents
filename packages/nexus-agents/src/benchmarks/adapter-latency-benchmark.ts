/**
 * nexus-agents/benchmarks - Adapter Latency Benchmark
 *
 * Measures latency overhead of CLI subprocess invocation vs direct API adapter calls.
 * Supports both mock adapters (CI) and real adapters (local manual runs).
 *
 * @module benchmarks/adapter-latency-benchmark
 * (Source: Issue #694, CLI subprocess vs API adapter latency)
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { ICliAdapter } from '../cli-adapters/types-capability.js';
import type { CliName, CliTransport } from '../cli-adapters/types-core.js';
import { LatencySampler, getBenchmarkEnvironment } from './benchmark-runner.js';
import type {
  BenchmarkSuiteResult,
  BenchmarkEnvironment,
  LatencyMetrics,
} from './benchmark-types.js';

const logger = createLogger({ component: 'adapter-latency-benchmark' });

/**
 * Configuration for adapter latency benchmarks.
 */
export interface AdapterLatencyConfig {
  /** Number of warmup iterations (not measured). */
  readonly warmupIterations: number;
  /** Number of measured iterations per scenario. */
  readonly measurementIterations: number;
  /** Timeout per operation in milliseconds. */
  readonly timeoutMs: number;
}

/**
 * Default adapter latency benchmark configuration.
 */
export const DEFAULT_ADAPTER_LATENCY_CONFIG: AdapterLatencyConfig = {
  warmupIterations: 3,
  measurementIterations: 10,
  timeoutMs: 60_000,
};

/**
 * A single scenario to benchmark.
 */
export interface LatencyScenario {
  /** Scenario name (e.g., 'simple-prompt', 'complex-prompt'). */
  readonly name: string;
  /** Input prompt content. */
  readonly content: string;
  /** Optional system prompt. */
  readonly systemPrompt?: string;
  /** Max tokens for generation. */
  readonly maxTokens?: number;
}

/**
 * Default scenarios matching issue #694 requirements.
 */
export const DEFAULT_SCENARIOS: readonly LatencyScenario[] = [
  {
    name: 'simple-prompt',
    content: 'What is 2+2?',
    maxTokens: 50,
  },
  {
    name: 'complex-prompt',
    content: [
      'Analyze the following code for security vulnerabilities,',
      'performance issues, and best practice violations.',
      'Provide a structured report with severity ratings.',
      'Code: function processInput(data) {',
      '  const query = `SELECT * FROM users WHERE id = ${data.id}`;',
      '  return db.execute(query);',
      '}',
    ].join(' '),
    systemPrompt: 'You are a senior security engineer.',
    maxTokens: 500,
  },
] as const;

/**
 * Result for a single adapter + scenario combination.
 */
export interface AdapterScenarioResult {
  /** CLI adapter name. */
  readonly adapterName: CliName;
  /** Transport type used. */
  readonly transport: CliTransport;
  /** Scenario name. */
  readonly scenario: string;
  /** Latency metrics from measured iterations. */
  readonly latency: LatencyMetrics;
  /** Number of successful iterations. */
  readonly successCount: number;
  /** Number of failed iterations. */
  readonly failureCount: number;
  /** Error messages from failures. */
  readonly errors: readonly string[];
}

/**
 * Complete adapter latency benchmark result.
 */
export interface AdapterLatencyResult {
  /** Timestamp of the benchmark run. */
  readonly timestamp: string;
  /** Environment information. */
  readonly environment: BenchmarkEnvironment;
  /** Per-adapter, per-scenario results. */
  readonly results: readonly AdapterScenarioResult[];
  /** Total benchmark duration in milliseconds. */
  readonly totalDurationMs: number;
}

/**
 * Run latency benchmarks across adapters and scenarios.
 */
export async function runAdapterLatencyBenchmark(
  adapters: readonly ICliAdapter[],
  scenarios: readonly LatencyScenario[] = DEFAULT_SCENARIOS,
  config: Partial<AdapterLatencyConfig> = {}
): Promise<AdapterLatencyResult> {
  const cfg = { ...DEFAULT_ADAPTER_LATENCY_CONFIG, ...config };
  const environment = getBenchmarkEnvironment();
  const overallStart = getTimeProvider().now();
  const results: AdapterScenarioResult[] = [];

  for (const adapter of adapters) {
    for (const scenario of scenarios) {
      const result = await benchmarkScenario(adapter, scenario, cfg);
      results.push(result);
    }
  }

  return {
    timestamp: getTimeProvider().nowIso(),
    environment,
    results,
    totalDurationMs: getTimeProvider().now() - overallStart,
  };
}

/**
 * Benchmark a single adapter against a single scenario.
 */
async function benchmarkScenario(
  adapter: ICliAdapter,
  scenario: LatencyScenario,
  config: AdapterLatencyConfig
): Promise<AdapterScenarioResult> {
  const sampler = new LatencySampler();
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  logger.info('Benchmarking scenario', {
    adapter: adapter.name,
    scenario: scenario.name,
    warmup: config.warmupIterations,
    iterations: config.measurementIterations,
  });

  // Warmup (not measured)
  for (let i = 0; i < config.warmupIterations; i++) {
    await executeScenario(adapter, scenario, config.timeoutMs);
  }

  // Measured iterations
  for (let i = 0; i < config.measurementIterations; i++) {
    const id = `${adapter.name}-${scenario.name}-${String(i)}`;
    sampler.start(id);
    const result = await executeScenario(adapter, scenario, config.timeoutMs);
    sampler.end(id);

    if (result.ok) {
      successCount++;
    } else {
      failureCount++;
      errors.push(result.error);
    }
  }

  return {
    adapterName: adapter.name,
    transport: adapter.transport,
    scenario: scenario.name,
    latency: sampler.getMetrics(),
    successCount,
    failureCount,
    errors,
  };
}

/**
 * Execute a single scenario on an adapter.
 */
async function executeScenario(
  adapter: ICliAdapter,
  scenario: LatencyScenario,
  timeoutMs: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await adapter.execute(
      {
        content: scenario.content,
        systemPrompt: scenario.systemPrompt,
        maxTokens: scenario.maxTokens,
        timeoutMs,
      },
      { timeoutMs }
    );
    return result.ok ? { ok: true } : { ok: false, error: result.error.message };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Format scenario tables for the report.
 */
function formatScenarioTables(results: readonly AdapterScenarioResult[]): string[] {
  const lines: string[] = [];
  const scenarios = new Set(results.map((r) => r.scenario));

  for (const scenario of scenarios) {
    lines.push(`## Scenario: ${scenario}`);
    lines.push('');
    lines.push(
      '| Adapter | Transport | p50 (ms) | p95 (ms) | p99 (ms) | Mean (ms) | Success Rate |'
    );
    lines.push(
      '|---------|-----------|----------|----------|----------|-----------|-------------|'
    );

    const scenarioResults = results.filter((r) => r.scenario === scenario);
    for (const r of scenarioResults) {
      const total = r.successCount + r.failureCount;
      const rate = total > 0 ? ((r.successCount / total) * 100).toFixed(0) : '0';
      lines.push(
        `| ${r.adapterName} | ${r.transport} | ${r.latency.p50.toFixed(1)} | ${r.latency.p95.toFixed(1)} | ${r.latency.p99.toFixed(1)} | ${r.latency.mean.toFixed(1)} | ${rate}% |`
      );
    }
    lines.push('');
  }

  return lines;
}

/**
 * Format transport comparison for the report.
 */
function formatTransportComparison(results: readonly AdapterScenarioResult[]): string[] {
  const lines: string[] = [];
  lines.push('## Transport Comparison');
  lines.push('');

  const transports = new Map<CliTransport, AdapterScenarioResult[]>();
  for (const r of results) {
    const existing = transports.get(r.transport) ?? [];
    existing.push(r);
    transports.set(r.transport, existing);
  }

  for (const [transport, items] of transports) {
    const avgP50 = items.reduce((s, r) => s + r.latency.p50, 0) / items.length;
    const avgP95 = items.reduce((s, r) => s + r.latency.p95, 0) / items.length;
    lines.push(
      `- **${transport}**: avg p50=${avgP50.toFixed(1)}ms, avg p95=${avgP95.toFixed(1)}ms`
    );
  }

  return lines;
}

/**
 * Format adapter latency results as a markdown report.
 */
export function formatAdapterLatencyReport(result: AdapterLatencyResult): string {
  const lines: string[] = [];

  lines.push('# CLI Adapter Latency Benchmark Report');
  lines.push('');
  lines.push(`**Date:** ${result.timestamp}`);
  lines.push(`**Duration:** ${result.totalDurationMs.toFixed(0)}ms`);
  lines.push(`**Platform:** ${result.environment.platform} ${result.environment.arch}`);
  lines.push(`**Node:** ${result.environment.nodeVersion}`);
  lines.push(
    `**CPU:** ${result.environment.cpuModel} (${String(result.environment.cpuCores)} cores)`
  );
  lines.push('');

  lines.push(...formatScenarioTables(result.results));
  lines.push(...formatTransportComparison(result.results));

  lines.push('');
  lines.push('---');
  lines.push('*Generated by nexus-agents adapter-latency-benchmark*');

  return lines.join('\n');
}

/**
 * Convert adapter latency results to BenchmarkSuiteResult for compatibility
 * with the generic formatBenchmarkResults() function.
 */
export function toSuiteResult(result: AdapterLatencyResult): BenchmarkSuiteResult {
  const operations = result.results.map((r) => ({
    operation: `${r.adapterName}/${r.scenario}`,
    datasetSize: r.successCount + r.failureCount,
    latency: r.latency,
    throughput: {
      opsPerSecond:
        r.latency.sampleCount > 0
          ? (r.latency.sampleCount / (r.latency.mean * r.latency.sampleCount)) * 1000
          : 0,
      totalOps: r.latency.sampleCount,
      durationMs: r.latency.mean * r.latency.sampleCount,
    },
    resources: {
      peakMemoryBytes: 0,
      avgMemoryBytes: 0,
      cpuTimeMs: 0,
    },
    timestamp: result.timestamp,
  }));

  const totalDurationMs = operations.reduce((s, op) => s + op.throughput.durationMs, 0);
  const totalOps = operations.reduce((s, op) => s + op.throughput.totalOps, 0);
  const avgP95 =
    operations.length > 0
      ? operations.reduce((s, op) => s + op.latency.p95, 0) / operations.length
      : 0;

  return {
    name: 'CLI Adapter Latency',
    component: 'cli-adapters',
    version: '1.0.0',
    operations,
    environment: result.environment,
    summary: {
      totalDurationMs,
      totalOperations: totalOps,
      overallThroughput: totalDurationMs > 0 ? (totalOps / totalDurationMs) * 1000 : 0,
      avgP95Latency: avgP95,
      passed: true,
      failures: [],
    },
  };
}
