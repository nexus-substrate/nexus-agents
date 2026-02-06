/**
 * Tests for Harness File Operations (pure functions only)
 *
 * @module swe-bench/harness-file-operations.test
 */

import { describe, it, expect } from 'vitest';
import {
  buildHarnessArgs,
  buildHarnessCommand,
  calculateEstimatedRemaining,
  createInitialProgress,
  getResultsFilePath,
} from './harness-file-operations.js';
import type { HarnessExecutionConfig } from './harness-executor-types.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeConfig(overrides: Partial<HarnessExecutionConfig> = {}) {
  return {
    predictionsPath: './predictions.jsonl',
    datasetName: 'lite' as const,
    maxWorkers: 4,
    runId: 'run-test',
    timeoutSeconds: 1800,
    outputDir: './logs',
    useDocker: true,
    cacheLevel: 'env' as const,
    ...overrides,
  } satisfies HarnessExecutionConfig;
}

// ============================================================================
// buildHarnessArgs
// ============================================================================

describe('buildHarnessArgs', () => {
  it('includes all required arguments', () => {
    const args = buildHarnessArgs(makeConfig());
    expect(args).toContain('--predictions_path');
    expect(args).toContain('./predictions.jsonl');
    expect(args).toContain('--dataset_name');
    expect(args).toContain('--max_workers');
    expect(args).toContain('4');
    expect(args).toContain('--run_id');
    expect(args).toContain('run-test');
    expect(args).toContain('--timeout');
    expect(args).toContain('1800');
    expect(args).toContain('--output_dir');
    expect(args).toContain('./logs');
    expect(args).toContain('--cache_level');
    expect(args).toContain('env');
  });

  it('capitalizes dataset name correctly', () => {
    const args = buildHarnessArgs(makeConfig({ datasetName: 'lite' }));
    expect(args).toContain('princeton-nlp/SWE-bench_Lite');
  });

  it('includes instance_ids when provided', () => {
    const config = makeConfig({ instanceIds: ['django__django-1', 'flask__flask-2'] });
    const args = buildHarnessArgs(config);
    expect(args).toContain('--instance_ids');
    expect(args).toContain('django__django-1,flask__flask-2');
  });

  it('omits instance_ids when undefined', () => {
    const args = buildHarnessArgs(makeConfig());
    expect(args).not.toContain('--instance_ids');
  });

  it('omits instance_ids when empty array', () => {
    const args = buildHarnessArgs(makeConfig({ instanceIds: [] }));
    expect(args).not.toContain('--instance_ids');
  });
});

// ============================================================================
// buildHarnessCommand
// ============================================================================

describe('buildHarnessCommand', () => {
  it('constructs full command string', () => {
    const cmd = buildHarnessCommand(makeConfig());
    expect(cmd).toContain('python3');
    expect(cmd).toContain('-m swebench.harness.run_evaluation');
    expect(cmd).toContain('--predictions_path');
  });

  it('includes all args from buildHarnessArgs', () => {
    const cmd = buildHarnessCommand(makeConfig({ runId: 'my-run' }));
    expect(cmd).toContain('--run_id my-run');
  });
});

// ============================================================================
// calculateEstimatedRemaining
// ============================================================================

describe('calculateEstimatedRemaining', () => {
  it('returns undefined when completedCount is 0', () => {
    expect(calculateEstimatedRemaining(0, 10, 5000)).toBeUndefined();
  });

  it('returns undefined when totalCount is 0', () => {
    expect(calculateEstimatedRemaining(5, 0, 5000)).toBeUndefined();
  });

  it('calculates estimated remaining time', () => {
    // 5 completed in 10000ms = 2000ms/instance. 5 remaining = 10000ms
    const result = calculateEstimatedRemaining(5, 10, 10000);
    expect(result).toBe(10000);
  });

  it('returns 0 when all complete', () => {
    const result = calculateEstimatedRemaining(10, 10, 10000);
    expect(result).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // 3 completed in 10000ms = 3333.33ms/instance. 7 remaining = 23333.33ms → 23333
    const result = calculateEstimatedRemaining(3, 10, 10000);
    expect(result).toBe(Math.round((10000 / 3) * 7));
  });
});

// ============================================================================
// createInitialProgress
// ============================================================================

describe('createInitialProgress', () => {
  it('creates idle progress with given total', () => {
    const progress = createInitialProgress(50);
    expect(progress.state).toBe('idle');
    expect(progress.completedCount).toBe(0);
    expect(progress.totalCount).toBe(50);
    expect(progress.resolvedCount).toBe(0);
    expect(progress.elapsedMs).toBe(0);
  });

  it('handles zero total', () => {
    const progress = createInitialProgress(0);
    expect(progress.totalCount).toBe(0);
  });
});

// ============================================================================
// getResultsFilePath
// ============================================================================

describe('getResultsFilePath', () => {
  it('joins outputDir, runId, and results.json', () => {
    const config = makeConfig({ outputDir: '/output', runId: 'run-1' });
    expect(getResultsFilePath(config)).toBe('/output/run-1/results.json');
  });

  it('handles nested output directory', () => {
    const config = makeConfig({ outputDir: '/data/logs/swe-bench', runId: 'eval-42' });
    expect(getResultsFilePath(config)).toBe('/data/logs/swe-bench/eval-42/results.json');
  });
});
