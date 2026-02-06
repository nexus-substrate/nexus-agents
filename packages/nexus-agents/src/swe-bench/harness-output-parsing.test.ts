/**
 * Tests for Harness Output Parsing
 *
 * @module swe-bench/harness-output-parsing.test
 */

import { describe, it, expect } from 'vitest';
import {
  parseHarnessOutput,
  parseProgressLine,
  transformTestResult,
  transformInstanceResult,
  transformHarnessOutput,
} from './harness-output-parsing.js';
import type {
  RawHarnessOutput,
  RawInstanceResult,
  RawTestResult,
  HarnessExecutionProgress,
} from './harness-executor-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeRawOutput(overrides: Partial<RawHarnessOutput> = {}): RawHarnessOutput {
  return {
    run_id: 'run-1',
    dataset_name: 'swe-bench-lite',
    model_name_or_path: 'claude-3',
    started_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T01:00:00Z',
    total_instances: 1,
    predicted_instances: 1,
    resolved_instances: 1,
    instance_results: [],
    ...overrides,
  };
}

function makeRawInstance(overrides: Partial<RawInstanceResult> = {}): RawInstanceResult {
  return {
    instance_id: 'django__django-12345',
    model_name_or_path: 'claude-3',
    resolved: true,
    patch_applied: true,
    tests_passed: 5,
    tests_failed: 0,
    tests_total: 5,
    duration_ms: 1000,
    ...overrides,
  };
}

function makeRawTest(overrides: Partial<RawTestResult> = {}): RawTestResult {
  return {
    test_name: 'test_basic',
    status: 'PASSED',
    ...overrides,
  };
}

function makeProgress(): HarnessExecutionProgress {
  return {
    state: 'running',
    completedCount: 0,
    totalCount: 10,
    resolvedCount: 0,
    elapsedMs: 0,
  };
}

// ============================================================================
// parseHarnessOutput
// ============================================================================

describe('parseHarnessOutput', () => {
  it('parses valid JSON output', () => {
    const raw = makeRawOutput();
    const result = parseHarnessOutput(JSON.stringify(raw));
    expect(result).not.toBeNull();
    expect(result?.run_id).toBe('run-1');
  });

  it('returns null for invalid JSON', () => {
    expect(parseHarnessOutput('not json')).toBeNull();
  });

  it('returns null for valid JSON but invalid structure', () => {
    expect(parseHarnessOutput('{"foo": "bar"}')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseHarnessOutput('')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseHarnessOutput('"string"')).toBeNull();
    expect(parseHarnessOutput('42')).toBeNull();
    expect(parseHarnessOutput('null')).toBeNull();
  });
});

// ============================================================================
// parseProgressLine
// ============================================================================

describe('parseProgressLine', () => {
  it('parses progress format [X/Y] instance_id', () => {
    const result = parseProgressLine('[3/10] django__django-12345 - PASSED', makeProgress());
    expect(result).not.toBeNull();
    expect(result?.completedCount).toBe(3);
    expect(result?.totalCount).toBe(10);
    expect(result?.currentInstanceId).toBe('django__django-12345');
  });

  it('parses resolved count format', () => {
    const result = parseProgressLine('Resolved: 5/10', makeProgress());
    expect(result).not.toBeNull();
    expect(result?.resolvedCount).toBe(5);
  });

  it('returns null for unrecognized lines', () => {
    expect(parseProgressLine('Some random log line', makeProgress())).toBeNull();
    expect(parseProgressLine('', makeProgress())).toBeNull();
  });

  it('includes latest log in result', () => {
    const line = '[1/5] instance-1 - processing';
    const result = parseProgressLine(line, makeProgress());
    expect(result?.latestLog).toBe(line);
  });
});

// ============================================================================
// transformTestResult
// ============================================================================

describe('transformTestResult', () => {
  it('transforms basic test result', () => {
    const result = transformTestResult(makeRawTest());
    expect(result.testName).toBe('test_basic');
    expect(result.status).toBeDefined();
    expect(result.durationMs).toBe(0);
  });

  it('uses duration_ms when provided', () => {
    const result = transformTestResult(makeRawTest({ duration_ms: 500 }));
    expect(result.durationMs).toBe(500);
  });

  it('includes error message when present', () => {
    const result = transformTestResult(
      makeRawTest({ error_message: 'assertion failed', status: 'FAILED' })
    );
    expect(result.errorMessage).toBe('assertion failed');
  });

  it('includes stack trace when present', () => {
    const result = transformTestResult(
      makeRawTest({ stack_trace: 'at test.py:42', status: 'ERROR' })
    );
    expect(result.stackTrace).toBe('at test.py:42');
  });

  it('does not include empty error message', () => {
    const result = transformTestResult(makeRawTest({ error_message: '' }));
    expect(result.errorMessage).toBeUndefined();
  });
});

// ============================================================================
// transformInstanceResult
// ============================================================================

describe('transformInstanceResult', () => {
  it('transforms basic instance result', () => {
    const result = transformInstanceResult(makeRawInstance());
    expect(result.instanceId).toBe('django__django-12345');
    expect(result.resolved).toBe(true);
    expect(result.testsPassed).toBe(5);
    expect(result.testsFailed).toBe(0);
    expect(result.testsTotal).toBe(5);
  });

  it('transforms nested test results', () => {
    const raw = makeRawInstance({
      test_results: [makeRawTest(), makeRawTest({ test_name: 'test_advanced' })],
    });
    const result = transformInstanceResult(raw);
    expect(result.testResults).toHaveLength(2);
    expect(result.testResults[1]?.testName).toBe('test_advanced');
  });

  it('handles missing test_results', () => {
    const result = transformInstanceResult(makeRawInstance());
    expect(result.testResults).toEqual([]);
  });

  it('includes patch error when present', () => {
    const result = transformInstanceResult(makeRawInstance({ patch_error: 'Hunk failed' }));
    expect(result.patchError).toBe('Hunk failed');
  });

  it('does not include empty patch error', () => {
    const result = transformInstanceResult(makeRawInstance({ patch_error: '' }));
    expect(result.patchError).toBeUndefined();
  });
});

// ============================================================================
// transformHarnessOutput
// ============================================================================

describe('transformHarnessOutput', () => {
  it('transforms instance results', () => {
    const raw = makeRawOutput({
      instance_results: [makeRawInstance(), makeRawInstance({ instance_id: 'second' })],
    });
    const result = transformHarnessOutput(raw);
    expect(result.instanceResults).toHaveLength(2);
    expect(result.totalCount).toBe(2);
  });

  it('counts resolved instances', () => {
    const raw = makeRawOutput({
      instance_results: [
        makeRawInstance({ resolved: true }),
        makeRawInstance({ resolved: false }),
        makeRawInstance({ resolved: true }),
      ],
    });
    const result = transformHarnessOutput(raw);
    expect(result.resolvedCount).toBe(2);
    expect(result.totalCount).toBe(3);
  });

  it('handles empty instance results', () => {
    const raw = makeRawOutput({ instance_results: [] });
    const result = transformHarnessOutput(raw);
    expect(result.instanceResults).toEqual([]);
    expect(result.resolvedCount).toBe(0);
    expect(result.totalCount).toBe(0);
  });
});
