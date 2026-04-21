/**
 * Tests for composite-router-metrics.
 *
 * Covers: recordDecisionToMetrics, recordOutcomeToMetrics, generateTraceId
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ILogger } from '../core/index.js';
import { getTimeProvider, getRandomProvider } from '../core/index.js';
import type { ICliAdapter } from './types.js';
import type { TaskProfile } from '../core/index.js';
import type {
  CompositeRoutingDecision,
  IRoutingMetricsCollector,
} from './composite-router-types.js';
import type { MetricsRecordingDeps, RecordOutcomeOptions } from './composite-router-metrics.js';
import {
  recordDecisionToMetrics,
  recordOutcomeToMetrics,
  generateTraceId,
} from './composite-router-metrics.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockMetricsCollector() {
  return {
    recordDecision: vi.fn(),
    recordOutcome: vi.fn(),
    getMetrics: vi.fn(),
  } as unknown as IRoutingMetricsCollector;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTaskProfile(overrides: Partial<TaskProfile> = {}) {
  return {
    taskType: 'code_implementation',
    reasoningComplexity: 5,
    contextRequired: 5000,
    codeGeneration: true,
    estimatedTokens: 1000,
    ...overrides,
  } as TaskProfile;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDecision(overrides: Partial<CompositeRoutingDecision> = {}) {
  return {
    adapter: {} as ICliAdapter,
    cliName: 'claude',
    confidence: 0.85,
    reason: 'Best match',
    stagesExecuted: ['budget', 'topsis', 'linucb'],
    decisionTimeMs: 25,
    alternatives: ['gemini', 'codex'],
    taskProfile: makeTaskProfile(),
    ucbScore: 0.6,
    ...overrides,
  } as CompositeRoutingDecision;
}

// ============================================================================
// recordDecisionToMetrics
// ============================================================================

describe('recordDecisionToMetrics', () => {
  let logger: ILogger;
  let metricsCollector: IRoutingMetricsCollector;
  let deps: MetricsRecordingDeps;

  beforeEach(() => {
    logger = makeMockLogger();
    metricsCollector = makeMockMetricsCollector();
    deps = { metricsCollector, logger };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records decision to metrics collector with all fields', () => {
    const decision = makeDecision({
      cliName: 'claude',
      ucbScore: 0.7,
      decisionTimeMs: 30,
    });
    const traceId = 'test-trace-123';

    recordDecisionToMetrics(decision, traceId, deps);

    expect(metricsCollector.recordDecision).toHaveBeenCalledOnce();
    const call = vi.mocked(metricsCollector.recordDecision).mock.calls[0]![0];
    expect(call).toMatchObject({
      traceId: 'test-trace-123',
      selectedModel: 'claude',
      alternativeModels: ['gemini', 'codex'],
      isExploration: true, // ucbScore 0.7 > 0.5
      taskType: 'code_implementation',
      contextTokens: 5000,
      routingLatencyMs: 30,
    });
    expect(call.timestamp).toBeDefined();
  });

  it('sets isExploration to true when ucbScore > 0.5', () => {
    const decision = makeDecision({ ucbScore: 0.8 });

    recordDecisionToMetrics(decision, 'trace-1', deps);

    const call = vi.mocked(metricsCollector.recordDecision).mock.calls[0]![0];
    expect(call.isExploration).toBe(true);
  });

  it('sets isExploration to false when ucbScore <= 0.5', () => {
    const decision = makeDecision({ ucbScore: 0.3 });

    recordDecisionToMetrics(decision, 'trace-2', deps);

    const call = vi.mocked(metricsCollector.recordDecision).mock.calls[0]![0];
    expect(call.isExploration).toBe(false);
  });

  it('sets isExploration to false when ucbScore is undefined', () => {
    const decision = makeDecision({ ucbScore: undefined });

    recordDecisionToMetrics(decision, 'trace-3', deps);

    const call = vi.mocked(metricsCollector.recordDecision).mock.calls[0]![0];
    expect(call.isExploration).toBe(false);
  });

  it('logs debug message after recording', () => {
    const decision = makeDecision({ cliName: 'gemini' });

    recordDecisionToMetrics(decision, 'trace-4', deps);

    expect(logger.debug).toHaveBeenCalledWith('Recorded routing decision to metrics', {
      traceId: 'trace-4',
      selectedModel: 'gemini',
    });
  });

  it('does nothing when metricsCollector is undefined', () => {
    const depsNoCollector: MetricsRecordingDeps = { metricsCollector: undefined, logger };
    const decision = makeDecision();

    recordDecisionToMetrics(decision, 'trace-5', depsNoCollector);

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('handles different task types', () => {
    const decision = makeDecision({
      taskProfile: makeTaskProfile({ taskType: 'architecture' }),
    });

    recordDecisionToMetrics(decision, 'trace-6', deps);

    const call = vi.mocked(metricsCollector.recordDecision).mock.calls[0]![0];
    expect(call.taskType).toBe('architecture');
  });

  it('handles different context requirements', () => {
    const decision = makeDecision({
      taskProfile: makeTaskProfile({ contextRequired: 100000 }),
    });

    recordDecisionToMetrics(decision, 'trace-7', deps);

    const call = vi.mocked(metricsCollector.recordDecision).mock.calls[0]![0];
    expect(call.contextTokens).toBe(100000);
  });
});

// ============================================================================
// recordOutcomeToMetrics
// ============================================================================

describe('recordOutcomeToMetrics', () => {
  let logger: ILogger;
  let metricsCollector: IRoutingMetricsCollector;
  let deps: MetricsRecordingDeps;

  beforeEach(() => {
    logger = makeMockLogger();
    metricsCollector = makeMockMetricsCollector();
    deps = { metricsCollector, logger };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records outcome with all optional fields', () => {
    const opts: RecordOutcomeOptions = {
      traceId: 'trace-outcome-1',
      cliName: 'claude',
      success: true,
      reward: 0.9,
      qualityScore: 8.5,
      latencyMs: 1200,
    };

    recordOutcomeToMetrics(opts, deps);

    const call = vi.mocked(metricsCollector.recordOutcome).mock.calls[0]![0];
    expect(call).toMatchObject({
      traceId: 'trace-outcome-1',
      model: 'claude',
      success: true,
      reward: 0.9,
      qualityScore: 8.5,
      latencyMs: 1200,
    });
    expect(call.timestamp).toBeDefined();
  });

  it('records outcome without optional fields', () => {
    const opts: RecordOutcomeOptions = {
      traceId: 'trace-outcome-2',
      cliName: 'gemini',
      success: false,
      reward: 0.1,
    };

    recordOutcomeToMetrics(opts, deps);

    const call = vi.mocked(metricsCollector.recordOutcome).mock.calls[0]![0];
    expect(call).toMatchObject({
      traceId: 'trace-outcome-2',
      model: 'gemini',
      success: false,
      reward: 0.1,
    });
    expect(call.qualityScore).toBeUndefined();
    expect(call.latencyMs).toBeUndefined();
  });

  it('records outcome with only qualityScore', () => {
    const opts: RecordOutcomeOptions = {
      traceId: 'trace-outcome-3',
      cliName: 'codex',
      success: true,
      reward: 0.75,
      qualityScore: 7.0,
    };
    recordOutcomeToMetrics(opts, deps);
    const call = vi.mocked(metricsCollector.recordOutcome).mock.calls[0]![0];
    expect(call.qualityScore).toBe(7.0);
    expect(call.latencyMs).toBeUndefined();
  });

  it('records outcome with only latencyMs', () => {
    const opts: RecordOutcomeOptions = {
      traceId: 'trace-outcome-4',
      cliName: 'claude',
      success: true,
      reward: 0.8,
      latencyMs: 500,
    };
    recordOutcomeToMetrics(opts, deps);
    const call = vi.mocked(metricsCollector.recordOutcome).mock.calls[0]![0];
    expect(call.latencyMs).toBe(500);
    expect(call.qualityScore).toBeUndefined();
  });

  it('logs debug message after recording', () => {
    const opts: RecordOutcomeOptions = {
      traceId: 'trace-outcome-5',
      cliName: 'gemini',
      success: true,
      reward: 0.85,
    };
    recordOutcomeToMetrics(opts, deps);
    expect(logger.debug).toHaveBeenCalledWith('Recorded outcome to metrics', {
      traceId: 'trace-outcome-5',
      model: 'gemini',
      success: true,
      reward: 0.85,
    });
  });

  it('does nothing when metricsCollector is undefined', () => {
    const depsNoCollector: MetricsRecordingDeps = { metricsCollector: undefined, logger };
    const opts: RecordOutcomeOptions = {
      traceId: 'trace-outcome-6',
      cliName: 'claude',
      success: true,
      reward: 0.9,
    };
    recordOutcomeToMetrics(opts, depsNoCollector);
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('handles zero reward', () => {
    const opts: RecordOutcomeOptions = {
      traceId: 'trace-outcome-7',
      cliName: 'codex',
      success: false,
      reward: 0,
    };
    recordOutcomeToMetrics(opts, deps);
    const call = vi.mocked(metricsCollector.recordOutcome).mock.calls[0]![0];
    expect(call.reward).toBe(0);
  });

  it('handles negative reward', () => {
    const opts: RecordOutcomeOptions = {
      traceId: 'trace-outcome-8',
      cliName: 'claude',
      success: false,
      reward: -0.5,
    };
    recordOutcomeToMetrics(opts, deps);
    const call = vi.mocked(metricsCollector.recordOutcome).mock.calls[0]![0];
    expect(call.reward).toBe(-0.5);
  });
});

// ============================================================================
// generateTraceId
// ============================================================================

describe('generateTraceId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates trace ID with rt- prefix', () => {
    const traceId = generateTraceId();
    expect(traceId).toMatch(/^rt-/);
  });

  it('includes timestamp in trace ID', () => {
    vi.setSystemTime(new Date('2026-02-05T10:00:00Z'));
    const traceId = generateTraceId();
    const timestamp = getTimeProvider().now();
    expect(traceId).toContain(String(timestamp));
  });

  it('includes random component in trace ID', () => {
    const traceId = generateTraceId();
    const parts = traceId.split('-');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('rt');
    expect(parts[2]).toMatch(/^[0-9a-z]{6}$/);
  });

  it('generates unique trace IDs on consecutive calls', () => {
    vi.useRealTimers(); // Need real random for uniqueness
    const id1 = generateTraceId();
    const id2 = generateTraceId();
    expect(id1).not.toBe(id2);
  });

  it('generates deterministic trace ID with same time and random seed', () => {
    vi.setSystemTime(new Date('2026-02-05T10:00:00Z'));
    const mockRandom = vi.spyOn(getRandomProvider(), 'random').mockReturnValue(0.123456);

    const id1 = generateTraceId();
    const id2 = generateTraceId();

    expect(id1).toBe(id2);
    mockRandom.mockRestore();
  });

  it('format matches expected pattern', () => {
    vi.setSystemTime(new Date('2026-02-05T10:00:00Z'));
    const traceId = generateTraceId();
    // Format: rt-{timestamp}-{6 chars base36}
    expect(traceId).toMatch(/^rt-\d+-[0-9a-z]{6}$/);
  });
});
