/**
 * Tests for per-expert context-budget observer (#2031).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger } from '../../core/index.js';
import {
  DEFAULT_CONTEXT_WARN_THRESHOLD,
  computeExpertContextUtilization,
  observeExpertContext,
  resolveContextWarnThreshold,
  type ExpertContextObservation,
} from './expert-context-observer.js';

function makeLogger(): ILogger {
  const logger: Record<string, unknown> = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    setLevel: vi.fn(),
  };
  logger['child'] = vi.fn(() => logger as unknown as ILogger);
  return logger as unknown as ILogger;
}

function makeObservation(
  overrides: Partial<ExpertContextObservation> = {}
): ExpertContextObservation {
  return {
    expertId: 'test-expert-1',
    role: 'code',
    modelId: 'claude-opus',
    tokensUsed: 10_000,
    taskDescription: 'test task',
    durationMs: 1200,
    ...overrides,
  };
}

describe('resolveContextWarnThreshold', () => {
  beforeEach(() => {
    delete process.env['NEXUS_CONTEXT_WARN_THRESHOLD'];
  });

  afterEach(() => {
    delete process.env['NEXUS_CONTEXT_WARN_THRESHOLD'];
  });

  it('returns default when env var unset', () => {
    expect(resolveContextWarnThreshold()).toBe(DEFAULT_CONTEXT_WARN_THRESHOLD);
  });

  it('honors valid env override in (0, 1]', () => {
    process.env['NEXUS_CONTEXT_WARN_THRESHOLD'] = '0.7';
    expect(resolveContextWarnThreshold()).toBe(0.7);

    process.env['NEXUS_CONTEXT_WARN_THRESHOLD'] = '1';
    expect(resolveContextWarnThreshold()).toBe(1);
  });

  it('falls back to default on invalid values', () => {
    for (const bad of ['', 'abc', '0', '-0.5', '1.5', '2']) {
      process.env['NEXUS_CONTEXT_WARN_THRESHOLD'] = bad;
      expect(resolveContextWarnThreshold()).toBe(DEFAULT_CONTEXT_WARN_THRESHOLD);
    }
  });
});

describe('computeExpertContextUtilization', () => {
  it('leaves window and utilization unmeasured when no model is known (#7251)', () => {
    // Previously pinned the assumed 8K window (#2177) as a measurement.
    const u = computeExpertContextUtilization({ modelId: undefined, tokensUsed: 41_370 });
    expect(u.contextWindow).toBeUndefined();
    expect(u.utilization).toBeUndefined();
    expect(u.warned).toBe(false);
  });

  it('sets warned=true when utilization >= threshold', () => {
    const u = computeExpertContextUtilization(
      { modelId: 'claude-opus', tokensUsed: 850_000 },
      0.85
    );
    expect(u.utilization).toBeGreaterThanOrEqual(0.85);
    expect(u.warned).toBe(true);
  });

  it('sets warned=false when utilization < threshold', () => {
    const u = computeExpertContextUtilization(
      { modelId: 'claude-opus', tokensUsed: 400_000 },
      0.85
    );
    expect(u.contextWindow).toBe(1_000_000);
    expect(u.utilization).toBeCloseTo(0.4, 5);
    expect(u.warned).toBe(false);
  });

  it('honors custom threshold', () => {
    const u = computeExpertContextUtilization({ modelId: 'claude-opus', tokensUsed: 300_000 }, 0.3);
    expect(u.warned).toBe(true);
  });

  it('distinguishes unreported usage from a measured zero (#4743)', () => {
    const missing = computeExpertContextUtilization({
      modelId: 'claude-opus',
      tokensUsed: 0,
      tokensMeasured: false,
    });
    const zero = computeExpertContextUtilization({
      modelId: 'claude-opus',
      tokensUsed: 0,
      tokensMeasured: true,
    });
    expect(missing.contextWindow).toBe(1_000_000);
    expect(missing.utilization).toBeUndefined();
    expect(missing.warned).toBe(false);
    expect(zero.utilization).toBe(0);
    expect(zero.warned).toBe(false);
  });
});

describe('observeExpertContext', () => {
  it('logs unmeasured utilization without warning when no model is known', () => {
    const logger = makeLogger();
    const result = observeExpertContext(
      makeObservation({ modelId: undefined, tokensUsed: 41_370 }),
      logger
    );
    expect(result.contextWindow).toBeUndefined();
    expect(result.utilization).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'context_utilization',
      expect.objectContaining({
        modelId: undefined,
        utilizationPercent: undefined,
      })
    );
  });

  it('returns unmeasured utilization if telemetry fails', () => {
    const logger = makeLogger();
    vi.mocked(logger.debug).mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    const result = observeExpertContext(makeObservation(), logger);
    expect(result.contextWindow).toBeUndefined();
    expect(result.utilization).toBeUndefined();
    expect(result.warned).toBe(false);
  });

  it('emits warn log when threshold crossed', () => {
    const logger = makeLogger();
    // claude-opus has a 1M context window per config/in-tree-data.ts, so
    // 900k tokens is 90% utilization → above default threshold.
    observeExpertContext(makeObservation({ modelId: 'claude-opus', tokensUsed: 900_000 }), logger);
    expect(logger.warn).toHaveBeenCalledWith(
      'context_warning',
      expect.objectContaining({
        event: 'context_warning',
        expertId: 'test-expert-1',
        role: 'code',
        modelId: 'claude-opus',
        utilizationPercent: 90,
        thresholdPercent: 85,
      })
    );
  });

  it('emits debug log when below threshold', () => {
    const logger = makeLogger();
    observeExpertContext(makeObservation({ modelId: 'claude-opus', tokensUsed: 100_000 }), logger);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'context_utilization',
      expect.objectContaining({
        event: 'context_utilization',
        utilizationPercent: 10,
      })
    );
  });

  it('honors custom threshold argument', () => {
    const logger = makeLogger();
    observeExpertContext(
      makeObservation({ modelId: 'claude-opus', tokensUsed: 400_000 }),
      logger,
      0.3
    );
    // 400k / 1M = 40% > 30% → warn
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns safe defaults when logger is undefined', () => {
    const result = observeExpertContext(
      makeObservation({ modelId: 'claude-opus', tokensUsed: 900_000 }),
      undefined
    );
    expect(result.warned).toBe(true);
    expect(result.utilization).toBeCloseTo(0.9, 5);
  });

  it('never throws even on adversarial inputs', () => {
    const logger = makeLogger();
    expect(() =>
      observeExpertContext(makeObservation({ tokensUsed: Number.NaN }), logger)
    ).not.toThrow();
  });
});
