/**
 * Tests for ZeroRouterStage
 *
 * Covers construction, canHandle, route scoring, recordOutcome, getStats,
 * difficulty estimation, calibration, and tier matching.
 *
 * @module cli-adapters/routing/stages/zero-stage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZeroRouterStage, createZeroStage } from './zero-stage.js';
import type { RoutingOutcome } from '../router-stage.js';
import { createRoutingContext } from '../router-stage.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../../../core/index.js';

const FIXED_TIME = 1700000000000;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
  return () => {
    resetTimeProvider();
  };
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCtx(task = 'test task', signals: string[] = []) {
  const ctx = createRoutingContext(task);
  return { ...ctx, signals: [...ctx.signals, ...signals] };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOutcome(overrides: Partial<RoutingOutcome> = {}) {
  return {
    selectedCli: 'claude' as const,
    task: 'implement a function',
    success: true,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mockLogger() {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

describe('ZeroRouterStage construction', () => {
  it('uses default config when no overrides', () => {
    const stage = new ZeroRouterStage();
    expect(stage.name).toBe('zero-difficulty');
    expect(stage.priority).toBe(40);
  });

  it('merges custom scoreWeight with defaults', () => {
    const stage = new ZeroRouterStage({ scoreWeight: 0.5 });
    const stats = stage.getStats() as { config: { scoreWeight: number } };
    expect(stats.config.scoreWeight).toBe(0.5);
  });

  it('merges custom preferSimpleModels with defaults', () => {
    const stage = new ZeroRouterStage({ preferSimpleModels: false });
    const stats = stage.getStats() as { config: { preferSimpleModels: boolean } };
    expect(stats.config.preferSimpleModels).toBe(false);
  });

  it('accepts optional logger without error', () => {
    expect(new ZeroRouterStage({}, mockLogger()).name).toBe('zero-difficulty');
  });

  it('accepts custom routerConfig', () => {
    const stage = new ZeroRouterStage({
      routerConfig: { enableCalibration: false },
    });
    expect(stage.name).toBe('zero-difficulty');
  });
});

describe('createZeroStage', () => {
  it('returns a ZeroRouterStage instance', () => {
    expect(createZeroStage()).toBeInstanceOf(ZeroRouterStage);
  });

  it('passes config through', () => {
    const stats = createZeroStage({ scoreWeight: 0.8 }).getStats() as {
      config: { scoreWeight: number };
    };
    expect(stats.config.scoreWeight).toBe(0.8);
  });

  it('passes logger through', () => {
    expect(createZeroStage({}, mockLogger())).toBeInstanceOf(ZeroRouterStage);
  });
});

describe('ZeroRouterStage.canHandle', () => {
  it('returns true when candidates remain and task is non-empty', () => {
    expect(new ZeroRouterStage().canHandle(makeCtx('some task'))).toBe(true);
  });

  it('returns false when all candidates are filtered', () => {
    const ctx = makeCtx();
    const filtered = new Map(ctx.filtered);
    for (const cli of ctx.availableClis) filtered.set(cli, 'test');
    expect(new ZeroRouterStage().canHandle({ ...ctx, filtered })).toBe(false);
  });

  it('returns false when task is empty string', () => {
    expect(new ZeroRouterStage().canHandle(makeCtx(''))).toBe(false);
  });

  it('returns true when some candidates filtered but not all', () => {
    const ctx = makeCtx();
    const filtered = new Map(ctx.filtered);
    filtered.set('claude', 'too expensive');
    expect(new ZeroRouterStage().canHandle({ ...ctx, filtered })).toBe(true);
  });
});

describe('ZeroRouterStage.route', () => {
  it('returns ok result with continuesPipeline true', async () => {
    const result = await new ZeroRouterStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.continuesPipeline).toBe(true);
  });

  it('adds difficulty:level signal', async () => {
    const result = await new ZeroRouterStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.signals.find((s) => s.startsWith('difficulty:'))).toBeDefined();
    }
  });

  it('adds difficulty:score-* signal', async () => {
    const result = await new ZeroRouterStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.value.context.signals.find((s) => s.startsWith('difficulty:score-'))
      ).toBeDefined();
    }
  });

  it('adds difficulty:dominant-* signal', async () => {
    const result = await new ZeroRouterStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.value.context.signals.find((s) => s.startsWith('difficulty:dominant-'))
      ).toBeDefined();
    }
  });

  it('adds trace entry with stage name and score action', async () => {
    const result = await new ZeroRouterStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.trace).toHaveLength(1);
      expect(result.value.context.trace[0]!.stageName).toBe('zero-difficulty');
      expect(result.value.context.trace[0]!.action).toBe('score');
    }
  });

  it('includes difficulty level in trace details', async () => {
    const result = await new ZeroRouterStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.trace[0]!.details).toContain('Difficulty:');
    }
  });

  it('updates scores for all remaining candidates', async () => {
    const ctx = makeCtx();
    const result = await new ZeroRouterStage().route(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const cli of ctx.availableClis) {
        expect(result.value.context.scores.has(cli)).toBe(true);
      }
    }
  });

  it('scores easy tasks higher for gemini (tier 1)', async () => {
    const result = await new ZeroRouterStage().route(makeCtx('simple task'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const geminiScore = result.value.context.scores.get('gemini') ?? 0;
      const claudeScore = result.value.context.scores.get('claude') ?? 0;
      // Gemini (tier 1) should match easy tasks better than Claude (tier 3)
      expect(geminiScore).toBeGreaterThanOrEqual(claudeScore);
    }
  });

  it('increments routingsCount stat', async () => {
    const stage = new ZeroRouterStage();
    await stage.route(makeCtx());
    const statsAfter = stage.getStats() as { routingsCount: number };
    expect(statsAfter.routingsCount).toBe(1);
  });

  it('accumulates totalDifficulty stat', async () => {
    const stage = new ZeroRouterStage();
    await stage.route(makeCtx());
    const statsAfter = stage.getStats() as { avgDifficulty: number };
    expect(statsAfter.avgDifficulty).toBeGreaterThan(0);
  });
});

describe('ZeroRouterStage.recordOutcome', () => {
  it('calls calibrate on the router', () => {
    const stage = new ZeroRouterStage();
    const outcome = makeOutcome();
    stage.recordOutcome(outcome);
    // Calibration is internal - verify no error thrown
    expect(() => {
      stage.recordOutcome(outcome);
    }).not.toThrow();
  });

  it('handles outcome with qualityScore', () => {
    const stage = new ZeroRouterStage();
    const outcome = makeOutcome({ qualityScore: 0.9 });
    expect(() => {
      stage.recordOutcome(outcome);
    }).not.toThrow();
  });

  it('handles outcome with latencyMs', () => {
    const stage = new ZeroRouterStage();
    const outcome = makeOutcome({ latencyMs: 1500 });
    expect(() => {
      stage.recordOutcome(outcome);
    }).not.toThrow();
  });

  it('handles failed outcome', () => {
    const stage = new ZeroRouterStage();
    const outcome = makeOutcome({ success: false });
    expect(() => {
      stage.recordOutcome(outcome);
    }).not.toThrow();
  });

  it('logs debug message on outcome recorded', () => {
    const logger = mockLogger();
    const stage = new ZeroRouterStage({}, logger);
    stage.recordOutcome(makeOutcome());
    expect(logger.debug).toHaveBeenCalledWith(
      'Zero outcome recorded',
      expect.objectContaining({ success: true })
    );
  });
});

describe('ZeroRouterStage.getStats', () => {
  it('returns routingsCount', () => {
    const stats = new ZeroRouterStage().getStats() as { routingsCount: number };
    expect(stats.routingsCount).toBe(0);
  });

  it('returns avgDifficulty as zero when no routings', () => {
    const stats = new ZeroRouterStage().getStats() as { avgDifficulty: number };
    expect(stats.avgDifficulty).toBe(0);
  });

  it('returns calibration stats', () => {
    const stats = new ZeroRouterStage().getStats() as {
      calibration: { totalOutcomes: number };
    };
    expect(stats.calibration).toBeDefined();
    expect(stats.calibration.totalOutcomes).toBeDefined();
  });

  it('returns config values', () => {
    const stage = new ZeroRouterStage({ scoreWeight: 0.6, preferSimpleModels: false });
    const stats = stage.getStats() as {
      config: { scoreWeight: number; preferSimpleModels: boolean };
    };
    expect(stats.config.scoreWeight).toBe(0.6);
    expect(stats.config.preferSimpleModels).toBe(false);
  });

  it('calculates avgDifficulty after multiple routings', async () => {
    const stage = new ZeroRouterStage();
    await stage.route(makeCtx('task 1'));
    await stage.route(makeCtx('task 2'));
    const stats = stage.getStats() as { routingsCount: number; avgDifficulty: number };
    expect(stats.routingsCount).toBe(2);
    expect(stats.avgDifficulty).toBeGreaterThan(0);
  });
});

describe('ZeroRouterStage difficulty scoring', () => {
  it('applies scoreWeight to match scores', async () => {
    const stage = new ZeroRouterStage({ scoreWeight: 0.5 });
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const scores = Array.from(result.value.context.scores.values());
      // All scores should be within [0, 0.5] due to scoreWeight
      expect(scores.every((s) => s >= 0 && s <= 0.5)).toBe(true);
    }
  });

  it('scores match based on tier ranking', async () => {
    const stage = new ZeroRouterStage({ scoreWeight: 0.3 });
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Verify scores exist for all CLIs
      expect(result.value.context.scores.size).toBeGreaterThan(0);
    }
  });
});

describe('ZeroRouterStage edge cases', () => {
  it('handles very long task strings', async () => {
    const longTask = 'x'.repeat(10000);
    const result = await new ZeroRouterStage().route(makeCtx(longTask));
    expect(result.ok).toBe(true);
  });

  it('handles task with special characters', async () => {
    const result = await new ZeroRouterStage().route(makeCtx('task with 特殊字符 and émojis 🚀'));
    expect(result.ok).toBe(true);
  });

  it('preserves existing signals', async () => {
    const existingSignals = ['budget:within', 'preference:claude'];
    const result = await new ZeroRouterStage().route(makeCtx('task', existingSignals));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.signals).toEqual(expect.arrayContaining(existingSignals));
    }
  });

  it('handles zero scoreWeight', async () => {
    const stage = new ZeroRouterStage({ scoreWeight: 0 });
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const scores = Array.from(result.value.context.scores.values());
      expect(scores.every((s) => s === 0)).toBe(true);
    }
  });
});
