/**
 * Tests for HarnessVerifyAdapter (#2054).
 */

import { describe, it, expect, vi } from 'vitest';
import { HarnessVerifyAdapter, translateEvaluationResult } from './harness-verify-adapter.js';
import type { InstanceEvaluationResult } from './evaluation-result-types.js';
import type { IEvaluationHarness } from './evaluation-interface-types.js';
import type { EvaluationHarnessConfig } from './evaluation-config-types.js';
import type { SWEBenchInstance } from './types.js';

function mockEvalConfig(): EvaluationHarnessConfig {
  return {} as EvaluationHarnessConfig;
}

function mockInstance(id = 'test-1'): SWEBenchInstance {
  return { instance_id: id, repo: 'test/repo', base_commit: 'HEAD' } as unknown as SWEBenchInstance;
}

function makeResult(overrides: Partial<InstanceEvaluationResult>): InstanceEvaluationResult {
  return {
    instanceId: 'test-1',
    modelNameOrPath: 'test-model',
    resolved: true,
    status: 'resolved',
    testResults: [],
    testsPassed: 0,
    testsFailed: 0,
    testsTotal: 0,
    patchApplied: true,
    durationMs: 100,
    ...overrides,
  } as InstanceEvaluationResult;
}

describe('translateEvaluationResult', () => {
  it('marks passed=true when resolved', () => {
    const r = translateEvaluationResult(makeResult({ resolved: true, status: 'resolved' }));
    expect(r.passed).toBe(true);
    expect(r.stderr).toBe('');
  });

  it('marks passed=false when unresolved', () => {
    const r = translateEvaluationResult(
      makeResult({
        resolved: false,
        status: 'unresolved',
        patchApplied: true,
        testResults: [
          { testName: 'test_foo', status: 'failed', durationMs: 50, errorMessage: 'boom' },
        ],
        testsFailed: 1,
        testsTotal: 1,
      })
    );
    expect(r.passed).toBe(false);
    expect(r.stderr).toContain('FAILED test_foo');
    expect(r.stderr).toContain('boom');
  });

  it('surfaces patch application error as stderr when patchApplied=false', () => {
    const r = translateEvaluationResult(
      makeResult({
        resolved: false,
        status: 'error',
        patchApplied: false,
        patchError: 'hunk #1 FAILED',
      })
    );
    expect(r.passed).toBe(false);
    expect(r.stderr).toContain('patch does not apply');
    expect(r.stderr).toContain('hunk #1 FAILED');
  });

  it('flags timeout in stderr', () => {
    const r = translateEvaluationResult(
      makeResult({ resolved: false, status: 'timeout', durationMs: 300_000 })
    );
    expect(r.stderr).toContain('timed out');
    expect(r.stderr).toContain('300000');
  });

  it('truncates failed-test list to 20 entries', () => {
    const testResults = Array.from({ length: 30 }, (_, i) => ({
      testName: `test_${String(i)}`,
      status: 'failed' as const,
      durationMs: 1,
    }));
    const r = translateEvaluationResult(
      makeResult({
        resolved: false,
        status: 'unresolved',
        patchApplied: true,
        testResults,
        testsFailed: 30,
        testsTotal: 30,
      })
    );
    const failedLines = r.stderr.split('\n').filter((l) => l.startsWith('FAILED'));
    expect(failedLines.length).toBe(20);
  });

  it('produces a readable stdout summary', () => {
    const r = translateEvaluationResult(
      makeResult({
        resolved: true,
        status: 'resolved',
        testsPassed: 5,
        testsTotal: 5,
        durationMs: 123,
      })
    );
    expect(r.stdout).toContain('Instance: test-1');
    expect(r.stdout).toContain('Status: resolved');
    expect(r.stdout).toContain('5/5 passed');
    expect(r.stdout).toContain('123ms');
  });
});

describe('HarnessVerifyAdapter', () => {
  it('delegates to harness.evaluateInstance', async () => {
    const evaluateInstance = vi.fn<IEvaluationHarness['evaluateInstance']>(() =>
      Promise.resolve(makeResult({ resolved: true, status: 'resolved' }))
    );
    const harness = { evaluateInstance } as unknown as IEvaluationHarness;
    const adapter = new HarnessVerifyAdapter(harness, 'test-model', mockEvalConfig());

    const result = await adapter.verify(mockInstance(), 'diff...', '/tmp');
    expect(result.passed).toBe(true);
    expect(evaluateInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        instance_id: 'test-1',
        model_name_or_path: 'test-model',
        model_patch: 'diff...',
      }),
      expect.any(Object)
    );
  });

  it('never throws — returns passed=false on harness exception', async () => {
    const evaluateInstance = vi.fn<IEvaluationHarness['evaluateInstance']>(() =>
      Promise.reject(new Error('docker unavailable'))
    );
    const harness = { evaluateInstance } as unknown as IEvaluationHarness;
    const adapter = new HarnessVerifyAdapter(harness, 'test-model', mockEvalConfig());

    const result = await adapter.verify(mockInstance(), 'diff...', '/tmp');
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain('Harness evaluation failed');
    expect(result.stderr).toContain('docker unavailable');
  });
});
