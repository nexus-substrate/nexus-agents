/**
 * Tests for Testing Result Schemas
 * @module testing/schemas.test
 */

import { describe, it, expect } from 'vitest';
import {
  TestStatus,
  CliAdapter,
  RegressionSeverity,
  BaselineTargets,
  AssertionResultSchema,
  TestCaseResultSchema,
  TestSuiteResultSchema,
  TokenUsageSchema,
  LatencyMetricsSchema,
  TaskTimestampsSchema,
  TaskErrorSchema,
  PerformanceResultSchema,
  TestSummarySchema,
  ResultWriterConfigSchema,
  EnvironmentInfoSchema,
  TestRunConfigSchema,
} from './schemas.js';

// ============================================================================
// TestStatus
// ============================================================================

describe('TestStatus', () => {
  it('has passed value', () => {
    expect(TestStatus.PASSED).toBe('passed');
  });

  it('has failed value', () => {
    expect(TestStatus.FAILED).toBe('failed');
  });

  it('has skipped value', () => {
    expect(TestStatus.SKIPPED).toBe('skipped');
  });

  it('has error value', () => {
    expect(TestStatus.ERROR).toBe('error');
  });

  it('has timeout value', () => {
    expect(TestStatus.TIMEOUT).toBe('timeout');
  });

  it('has exactly 5 values', () => {
    expect(Object.keys(TestStatus)).toHaveLength(5);
  });
});

// ============================================================================
// CliAdapter
// ============================================================================

describe('CliAdapter', () => {
  it('has claude value', () => {
    expect(CliAdapter.CLAUDE).toBe('claude');
  });

  it('has gemini value', () => {
    expect(CliAdapter.GEMINI).toBe('gemini');
  });

  it('has codex value', () => {
    expect(CliAdapter.CODEX).toBe('codex');
  });

  it('has exactly 3 values', () => {
    expect(Object.keys(CliAdapter)).toHaveLength(3);
  });
});

// ============================================================================
// RegressionSeverity
// ============================================================================

describe('RegressionSeverity', () => {
  it('has minor value', () => {
    expect(RegressionSeverity.MINOR).toBe('minor');
  });

  it('has moderate value', () => {
    expect(RegressionSeverity.MODERATE).toBe('moderate');
  });

  it('has severe value', () => {
    expect(RegressionSeverity.SEVERE).toBe('severe');
  });

  it('has exactly 3 values', () => {
    expect(Object.keys(RegressionSeverity)).toHaveLength(3);
  });
});

// ============================================================================
// BaselineTargets
// ============================================================================

describe('BaselineTargets', () => {
  it('has routing optimal rate', () => {
    expect(BaselineTargets.ROUTING_OPTIMAL_RATE).toBe(0.75);
  });

  it('has routing acceptable rate', () => {
    expect(BaselineTargets.ROUTING_ACCEPTABLE_RATE).toBe(0.9);
  });

  it('has quality pass rate', () => {
    expect(BaselineTargets.QUALITY_PASS_RATE).toBe(0.8);
  });

  it('has quality average score', () => {
    expect(BaselineTargets.QUALITY_AVERAGE_SCORE).toBe(70);
  });

  it('has latency p95', () => {
    expect(BaselineTargets.LATENCY_P95_MS).toBe(120_000);
  });

  it('has success rate', () => {
    expect(BaselineTargets.SUCCESS_RATE).toBe(0.95);
  });

  it('all rate targets are between 0 and 1', () => {
    expect(BaselineTargets.ROUTING_OPTIMAL_RATE).toBeGreaterThan(0);
    expect(BaselineTargets.ROUTING_OPTIMAL_RATE).toBeLessThanOrEqual(1);
    expect(BaselineTargets.ROUTING_ACCEPTABLE_RATE).toBeGreaterThan(0);
    expect(BaselineTargets.ROUTING_ACCEPTABLE_RATE).toBeLessThanOrEqual(1);
    expect(BaselineTargets.QUALITY_PASS_RATE).toBeGreaterThan(0);
    expect(BaselineTargets.QUALITY_PASS_RATE).toBeLessThanOrEqual(1);
    expect(BaselineTargets.SUCCESS_RATE).toBeGreaterThan(0);
    expect(BaselineTargets.SUCCESS_RATE).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// AssertionResultSchema
// ============================================================================

describe('AssertionResultSchema', () => {
  it('accepts valid assertion', () => {
    const result = AssertionResultSchema.safeParse({
      name: 'check_output',
      passed: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts assertion with optional fields', () => {
    const result = AssertionResultSchema.safeParse({
      name: 'check_output',
      passed: false,
      expected: 42,
      actual: 43,
      message: 'Values differ',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = AssertionResultSchema.safeParse({ passed: true });
    expect(result.success).toBe(false);
  });

  it('rejects missing passed', () => {
    const result = AssertionResultSchema.safeParse({ name: 'test' });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// TestCaseResultSchema
// ============================================================================

describe('TestCaseResultSchema', () => {
  it('accepts valid test case result', () => {
    const result = TestCaseResultSchema.safeParse({
      name: 'test_routing',
      status: 'passed',
      durationMs: 150,
      assertions: [{ name: 'check', passed: true }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = TestCaseResultSchema.safeParse({
      name: 'test_routing',
      status: 'invalid_status',
      durationMs: 150,
      assertions: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative duration', () => {
    const result = TestCaseResultSchema.safeParse({
      name: 'test_routing',
      status: 'passed',
      durationMs: -1,
      assertions: [],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// TokenUsageSchema
// ============================================================================

describe('TokenUsageSchema', () => {
  it('accepts valid token usage', () => {
    const result = TokenUsageSchema.safeParse({
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
    });
    expect(result.success).toBe(true);
  });

  it('accepts with optional cached tokens', () => {
    const result = TokenUsageSchema.safeParse({
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      cachedTokens: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative tokens', () => {
    const result = TokenUsageSchema.safeParse({
      inputTokens: -1,
      outputTokens: 200,
      totalTokens: 300,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// LatencyMetricsSchema
// ============================================================================

describe('LatencyMetricsSchema', () => {
  it('accepts valid latency metrics', () => {
    const result = LatencyMetricsSchema.safeParse({
      p50: 100,
      p75: 150,
      p90: 200,
      p95: 250,
      p99: 500,
      mean: 175,
      stdDev: 50,
      min: 10,
      max: 600,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = LatencyMetricsSchema.safeParse({
      p50: 100,
      p75: 150,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// TaskTimestampsSchema
// ============================================================================

describe('TaskTimestampsSchema', () => {
  it('accepts valid timestamps', () => {
    const result = TaskTimestampsSchema.safeParse({
      startedAt: '2026-02-05T10:00:00.000Z',
      completedAt: '2026-02-05T10:00:05.000Z',
      durationMs: 5000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-datetime string', () => {
    const result = TaskTimestampsSchema.safeParse({
      startedAt: 'not-a-date',
      completedAt: '2026-02-05T10:00:05.000Z',
      durationMs: 5000,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// TaskErrorSchema
// ============================================================================

describe('TaskErrorSchema', () => {
  it('accepts valid error', () => {
    const result = TaskErrorSchema.safeParse({
      code: 'TIMEOUT',
      message: 'Task timed out after 60s',
      retryable: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts with optional stack', () => {
    const result = TaskErrorSchema.safeParse({
      code: 'RUNTIME_ERROR',
      message: 'Unexpected failure',
      stack: 'Error: at line 42',
      retryable: false,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// PerformanceResultSchema
// ============================================================================

describe('PerformanceResultSchema', () => {
  it('accepts valid performance result', () => {
    const result = PerformanceResultSchema.safeParse({
      durationMs: 5000,
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      stopReason: 'end_turn',
      truncated: false,
      retries: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid stop reason', () => {
    const result = PerformanceResultSchema.safeParse({
      durationMs: 5000,
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      stopReason: 'invalid_reason',
      truncated: false,
      retries: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// TestSummarySchema
// ============================================================================

describe('TestSummarySchema', () => {
  it('accepts valid summary', () => {
    const result = TestSummarySchema.safeParse({
      totalTasks: 100,
      passedTasks: 80,
      failedTasks: 15,
      skippedTasks: 3,
      errorTasks: 2,
      passRate: 0.8,
      averageQualityScore: 75,
      routingOptimalRate: 0.85,
      routingAcceptableRate: 0.95,
    });
    expect(result.success).toBe(true);
  });

  it('rejects passRate > 1', () => {
    const result = TestSummarySchema.safeParse({
      totalTasks: 10,
      passedTasks: 10,
      failedTasks: 0,
      skippedTasks: 0,
      errorTasks: 0,
      passRate: 1.5,
      averageQualityScore: 90,
      routingOptimalRate: 0.9,
      routingAcceptableRate: 0.95,
    });
    expect(result.success).toBe(false);
  });

  it('rejects averageQualityScore > 100', () => {
    const result = TestSummarySchema.safeParse({
      totalTasks: 10,
      passedTasks: 10,
      failedTasks: 0,
      skippedTasks: 0,
      errorTasks: 0,
      passRate: 1.0,
      averageQualityScore: 150,
      routingOptimalRate: 0.9,
      routingAcceptableRate: 0.95,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// TestSuiteResultSchema
// ============================================================================

describe('TestSuiteResultSchema', () => {
  it('accepts valid suite result', () => {
    const result = TestSuiteResultSchema.safeParse({
      name: 'routing-suite',
      adapter: 'claude',
      testCases: [],
      durationMs: 30000,
      passed: 10,
      failed: 2,
      skipped: 0,
      errors: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid adapter', () => {
    const result = TestSuiteResultSchema.safeParse({
      name: 'suite',
      adapter: 'invalid_adapter',
      testCases: [],
      durationMs: 1000,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ResultWriterConfigSchema
// ============================================================================

describe('ResultWriterConfigSchema', () => {
  it('accepts valid config', () => {
    const result = ResultWriterConfigSchema.safeParse({
      outputDir: './results',
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults', () => {
    const result = ResultWriterConfigSchema.parse({
      outputDir: './results',
    });
    expect(result.keepHistory).toBe(10);
    expect(result.includeDetailedResults).toBe(true);
    expect(result.prettyPrint).toBe(true);
  });

  it('accepts overridden defaults', () => {
    const result = ResultWriterConfigSchema.parse({
      outputDir: './out',
      keepHistory: 5,
      includeDetailedResults: false,
      prettyPrint: false,
    });
    expect(result.keepHistory).toBe(5);
    expect(result.includeDetailedResults).toBe(false);
    expect(result.prettyPrint).toBe(false);
  });

  it('rejects keepHistory <= 0', () => {
    const result = ResultWriterConfigSchema.safeParse({
      outputDir: './results',
      keepHistory: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// EnvironmentInfoSchema
// ============================================================================

describe('EnvironmentInfoSchema', () => {
  it('accepts valid environment', () => {
    const result = EnvironmentInfoSchema.safeParse({
      nodeVersion: '22.0.0',
      os: 'linux',
      osVersion: '6.14.0',
      arch: 'x64',
      timezone: 'America/New_York',
      cliVersions: { claude: '1.0.0', gemini: null, codex: null },
      packageVersion: '2.3.0',
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// TestRunConfigSchema
// ============================================================================

describe('TestRunConfigSchema', () => {
  it('accepts valid config', () => {
    const result = TestRunConfigSchema.safeParse({
      temperature: 0.0,
      taskTimeoutMs: 60000,
      maxRetries: 3,
      parallel: true,
      parallelWorkers: 4,
      includeCategories: ['routing', 'quality'],
      targetClis: ['claude', 'gemini'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects temperature > 2', () => {
    const result = TestRunConfigSchema.safeParse({
      temperature: 3.0,
      taskTimeoutMs: 60000,
      maxRetries: 3,
      parallel: false,
      parallelWorkers: 1,
      includeCategories: [],
      targetClis: ['claude'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive taskTimeoutMs', () => {
    const result = TestRunConfigSchema.safeParse({
      temperature: 0.0,
      taskTimeoutMs: 0,
      maxRetries: 0,
      parallel: false,
      parallelWorkers: 1,
      includeCategories: [],
      targetClis: ['claude'],
    });
    expect(result.success).toBe(false);
  });
});
