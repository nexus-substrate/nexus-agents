/**
 * Tests for SWE-Bench Runner Helpers
 * @module swe-bench/swe-bench-runner-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { RunState } from './swe-bench-runner-types.js';
import {
  DEFAULT_RUNNER_CONFIG,
  createInitialState,
  calculateEstimatedRemaining,
  createProgress,
  buildRunnerConfig,
} from './swe-bench-runner-helpers.js';

// We need vi.mock for getTimeProvider
import { vi } from 'vitest';

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000010000 }),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    startTime: 1700000000000,
    completed: 0,
    failed: 0,
    tokensUsed: 0,
    completedIds: new Set(),
    results: [],
    ...overrides,
  };
}

// ============================================================================
// DEFAULT_RUNNER_CONFIG
// ============================================================================

describe('DEFAULT_RUNNER_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_RUNNER_CONFIG.resume).toBe(false);
    expect(DEFAULT_RUNNER_CONFIG.modelName).toBe('nexus-agents');
  });
});

// ============================================================================
// createInitialState
// ============================================================================

describe('createInitialState', () => {
  it('creates state with mocked time', () => {
    const state = createInitialState();
    expect(state.startTime).toBe(1700000010000);
    expect(state.completed).toBe(0);
    expect(state.failed).toBe(0);
    expect(state.tokensUsed).toBe(0);
  });

  it('creates empty completedIds set', () => {
    const state = createInitialState();
    expect(state.completedIds.size).toBe(0);
  });

  it('creates empty results array', () => {
    const state = createInitialState();
    expect(state.results).toEqual([]);
  });
});

// ============================================================================
// calculateEstimatedRemaining
// ============================================================================

describe('calculateEstimatedRemaining', () => {
  it('returns 0 when no instances processed', () => {
    const state = makeRunState();
    expect(calculateEstimatedRemaining(state, 10)).toBe(0);
  });

  it('estimates remaining time based on average', () => {
    // now() = 1700000010000, startTime = 1700000000000 -> elapsed = 10000ms
    // processed = 5, avgTime = 2000ms, remaining = 5
    // estimated = 2000 * 5 = 10000
    const state = makeRunState({ completed: 3, failed: 2 });
    const remaining = calculateEstimatedRemaining(state, 5);
    expect(remaining).toBe(10000);
  });

  it('includes failed instances in average calculation', () => {
    // elapsed = 10000, processed = 2 (1 completed + 1 failed)
    // avg = 5000, remaining = 8 -> 40000
    const state = makeRunState({ completed: 1, failed: 1 });
    const remaining = calculateEstimatedRemaining(state, 8);
    expect(remaining).toBe(40000);
  });
});

// ============================================================================
// createProgress
// ============================================================================

describe('createProgress', () => {
  it('creates progress with basic fields', () => {
    const state = makeRunState({ completed: 3, failed: 1, tokensUsed: 5000 });
    const progress = createProgress(4, 10, 'instance-5', state);
    expect(progress.currentIndex).toBe(4);
    expect(progress.totalInstances).toBe(10);
    expect(progress.currentInstanceId).toBe('instance-5');
    expect(progress.completed).toBe(3);
    expect(progress.failed).toBe(1);
    expect(progress.tokensUsed).toBe(5000);
  });

  it('calculates elapsed time', () => {
    const state = makeRunState();
    const progress = createProgress(0, 10, 'inst-1', state);
    // now() - startTime = 10000
    expect(progress.elapsedMs).toBe(10000);
  });

  it('calculates resolution rate', () => {
    const state = makeRunState({ completed: 3, failed: 1 });
    const progress = createProgress(4, 10, 'inst-5', state);
    // resolutionRate = 3 / 4 = 0.75
    expect(progress.resolutionRate).toBe(0.75);
  });

  it('returns 0 resolution rate when none processed', () => {
    const state = makeRunState();
    const progress = createProgress(0, 10, 'inst-1', state);
    expect(progress.resolutionRate).toBe(0);
  });

  it('includes estimated remaining time', () => {
    // elapsed = 10000, processed = 2, remaining = 8
    // avg = 5000, estimated = 40000
    const state = makeRunState({ completed: 1, failed: 1 });
    const progress = createProgress(2, 10, 'inst-3', state);
    expect(progress.estimatedRemainingMs).toBe(40000);
  });
});

// ============================================================================
// buildRunnerConfig
// ============================================================================

describe('buildRunnerConfig', () => {
  it('uses defaults when no config provided', () => {
    const config = buildRunnerConfig({});
    expect(config.modelName).toBe('nexus-agents');
    expect(config.resume).toBe(false);
  });

  it('overrides model name', () => {
    const config = buildRunnerConfig({ modelName: 'custom-model' });
    expect(config.modelName).toBe('custom-model');
  });

  it('overrides resume flag', () => {
    const config = buildRunnerConfig({ resume: true });
    expect(config.resume).toBe(true);
  });

  it('includes optional loadOptions when provided', () => {
    const loadOptions = { variant: 'lite' as const, limit: 50 };
    const config = buildRunnerConfig({ loadOptions });
    expect(config.loadOptions).toEqual(loadOptions);
  });

  it('includes optional checkpointPath when provided', () => {
    const config = buildRunnerConfig({ checkpointPath: '/tmp/checkpoint.json' });
    expect(config.checkpointPath).toBe('/tmp/checkpoint.json');
  });

  it('includes optional onProgress callback', () => {
    const callback = vi.fn();
    const config = buildRunnerConfig({ onProgress: callback });
    expect(config.onProgress).toBe(callback);
  });

  it('excludes undefined optional fields', () => {
    const config = buildRunnerConfig({});
    expect('loadOptions' in config).toBe(false);
    expect('checkpointPath' in config).toBe(false);
    expect('onProgress' in config).toBe(false);
    expect('onMessage' in config).toBe(false);
    expect('signal' in config).toBe(false);
  });

  it('uses DEFAULT_SWE_BENCH_CONFIG for benchConfig', () => {
    const config = buildRunnerConfig({});
    expect(config.benchConfig.variant).toBe('lite');
    expect(config.benchConfig.timeout_ms).toBe(600000);
  });
});
