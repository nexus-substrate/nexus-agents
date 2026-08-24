/**
 * Tests for Workflow Engine Helpers
 * @module workflows/workflow-engine-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { StepResult } from '../core/index.js';
import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENCY,
  MAX_TRACKED_EXECUTIONS,
  resolveConfig,
  buildFinalOutput,
} from './workflow-engine-helpers.js';

// ============================================================================
// Constants
// ============================================================================

describe('constants', () => {
  it('DEFAULT_TIMEOUT_MS is 5 minutes', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(300000);
  });

  it('DEFAULT_MAX_CONCURRENCY is 5', () => {
    expect(DEFAULT_MAX_CONCURRENCY).toBe(5);
  });

  it('MAX_TRACKED_EXECUTIONS is 1000', () => {
    expect(MAX_TRACKED_EXECUTIONS).toBe(1000);
  });
});

// ============================================================================
// resolveConfig
// ============================================================================

describe('resolveConfig', () => {
  it('returns defaults when no config provided', () => {
    const config = resolveConfig();
    expect(config.defaultTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(config.maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(config.templatePaths).toEqual([]);
  });

  it('returns defaults when undefined passed', () => {
    const config = resolveConfig(undefined);
    expect(config.defaultTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('overrides timeout', () => {
    const config = resolveConfig({ defaultTimeoutMs: 60000 });
    expect(config.defaultTimeoutMs).toBe(60000);
  });

  it('overrides max concurrency', () => {
    const config = resolveConfig({ maxConcurrency: 10 });
    expect(config.maxConcurrency).toBe(10);
  });

  it('uses template paths from config', () => {
    const config = resolveConfig({ templatePaths: ['/path/to/templates'] });
    expect(config.templatePaths).toEqual(['/path/to/templates']);
  });

  it('defaults template paths to empty array', () => {
    const config = resolveConfig({ maxConcurrency: 3 });
    expect(config.templatePaths).toEqual([]);
  });

  it('preserves unset fields at defaults', () => {
    const config = resolveConfig({ defaultTimeoutMs: 1000 });
    expect(config.maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY);
  });
});

// ============================================================================
// buildFinalOutput
// ============================================================================

describe('buildFinalOutput', () => {
  it('returns null for empty results', () => {
    expect(buildFinalOutput([])).toBeNull();
  });

  it('returns output of last successful step', () => {
    const results: StepResult[] = [
      { stepId: 's1', output: 'first', durationMs: 100, status: 'success' },
      { stepId: 's2', output: 'second', durationMs: 200, status: 'success' },
    ];
    expect(buildFinalOutput(results)).toBe('second');
  });

  it('skips failed steps', () => {
    const results: StepResult[] = [
      { stepId: 's1', output: 'good', durationMs: 100, status: 'success' },
      { stepId: 's2', output: 'bad', durationMs: 200, status: 'failed', error: 'oops' },
    ];
    expect(buildFinalOutput(results)).toBe('good');
  });

  it('returns null when all steps failed', () => {
    const results: StepResult[] = [
      { stepId: 's1', output: 'x', durationMs: 100, status: 'failed', error: 'err' },
    ];
    expect(buildFinalOutput(results)).toBeNull();
  });

  it('skips skipped steps', () => {
    const results: StepResult[] = [
      { stepId: 's1', output: 'result', durationMs: 100, status: 'success' },
      { stepId: 's2', output: 'skipped', durationMs: 0, status: 'skipped' },
    ];
    expect(buildFinalOutput(results)).toBe('result');
  });

  it('handles complex output types', () => {
    const results: StepResult[] = [
      { stepId: 's1', output: { data: [1, 2, 3] }, durationMs: 100, status: 'success' },
    ];
    expect(buildFinalOutput(results)).toEqual({ data: [1, 2, 3] });
  });
});
