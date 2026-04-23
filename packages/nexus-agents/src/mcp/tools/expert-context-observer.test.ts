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
  it('uses fail-closed 8k default window when modelId is undefined (#2177)', () => {
    const u = computeExpertContextUtilization({ modelId: undefined, tokensUsed: 4_096 });
    expect(u.contextWindow).toBe(8_192);
    expect(u.utilization).toBeCloseTo(0.5, 5);
    expect(u.warned).toBe(false);
  });

  it('sets warned=true when utilization >= threshold', () => {
    const u = computeExpertContextUtilization({ modelId: undefined, tokensUsed: 7_000 }, 0.85);
    expect(u.utilization).toBeGreaterThanOrEqual(0.85);
    expect(u.warned).toBe(true);
  });

  it('sets warned=false when utilization < threshold', () => {
    const u = computeExpertContextUtilization({ modelId: undefined, tokensUsed: 4_000 }, 0.85);
    expect(u.warned).toBe(false);
  });

  it('honors custom threshold', () => {
    const u = computeExpertContextUtilization({ modelId: undefined, tokensUsed: 3_000 }, 0.3);
    expect(u.warned).toBe(true);
  });
});

describe('observeExpertContext', () => {
  it('emits warn log when threshold crossed', () => {
    const logger = makeLogger();
    // claude-opus has a 1M context window per model-capabilities.ts, so
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
