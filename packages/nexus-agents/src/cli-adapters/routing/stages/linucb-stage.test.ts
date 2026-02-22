/**
 * Tests for LinUCBStage
 *
 * Covers construction, canHandle, route scoring, recordOutcome, getStats,
 * bandit context building, complexity estimation, and reward calculation.
 *
 * @module cli-adapters/routing/stages/linucb-stage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinUCBStage, createLinUCBStage } from './linucb-stage.js';
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

describe('LinUCBStage construction', () => {
  it('uses default config when no overrides', () => {
    const stage = new LinUCBStage();
    expect(stage.name).toBe('linucb-bandit');
    expect(stage.priority).toBe(70);
  });

  it('merges custom scoreWeight with defaults', () => {
    const stage = new LinUCBStage({ scoreWeight: 0.5 });
    const stats = stage.getStats() as { config: { scoreWeight: number } };
    expect(stats.config.scoreWeight).toBe(0.5);
  });

  it('accepts custom minPullsForConfidence', () => {
    const stats = new LinUCBStage({ minPullsForConfidence: 10 }).getStats() as {
      config: { minPullsForConfidence: number };
    };
    expect(stats.config.minPullsForConfidence).toBe(10);
  });

  it('accepts optional logger without error', () => {
    expect(new LinUCBStage({}, mockLogger()).name).toBe('linucb-bandit');
  });
});

describe('createLinUCBStage', () => {
  it('returns a LinUCBStage instance', () => {
    expect(createLinUCBStage()).toBeInstanceOf(LinUCBStage);
  });

  it('passes config through', () => {
    const stats = createLinUCBStage({ scoreWeight: 0.8 }).getStats() as {
      config: { scoreWeight: number };
    };
    expect(stats.config.scoreWeight).toBe(0.8);
  });

  it('passes logger through', () => {
    expect(createLinUCBStage({}, mockLogger())).toBeInstanceOf(LinUCBStage);
  });
});

describe('LinUCBStage.canHandle', () => {
  it('returns true when candidates remain and task is non-empty', () => {
    expect(new LinUCBStage().canHandle(makeCtx('some task'))).toBe(true);
  });

  it('returns false when all candidates are filtered', () => {
    const ctx = makeCtx();
    const filtered = new Map(ctx.filtered);
    for (const cli of ctx.availableClis) filtered.set(cli, 'test');
    expect(new LinUCBStage().canHandle({ ...ctx, filtered })).toBe(false);
  });

  it('returns false when task is empty string', () => {
    expect(new LinUCBStage().canHandle(makeCtx(''))).toBe(false);
  });

  it('returns true when some candidates filtered but not all', () => {
    const ctx = makeCtx();
    const filtered = new Map(ctx.filtered);
    filtered.set('claude', 'too expensive');
    expect(new LinUCBStage().canHandle({ ...ctx, filtered })).toBe(true);
  });
});

describe('LinUCBStage.route', () => {
  it('returns ok result with continuesPipeline true', async () => {
    const result = await new LinUCBStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.continuesPipeline).toBe(true);
  });

  it('adds linucb:selected-* signal', async () => {
    const result = await new LinUCBStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.value.context.signals.find((s) => s.startsWith('linucb:selected-'))
      ).toBeDefined();
    }
  });

  it('adds linucb:ucb-* signal', async () => {
    const result = await new LinUCBStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.signals.find((s) => s.startsWith('linucb:ucb-'))).toBeDefined();
    }
  });

  it('adds trace entry with stage name and score action', async () => {
    const result = await new LinUCBStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.trace).toHaveLength(1);
      expect(result.value.context.trace[0]?.stageName).toBe('linucb-bandit');
      expect(result.value.context.trace[0]?.action).toBe('score');
    }
  });

  it('updates scores so at least one candidate is non-zero', async () => {
    const result = await new LinUCBStage().route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const hasNonZero = [...result.value.context.scores.values()].some((v) => v > 0);
      expect(hasNonZero).toBe(true);
    }
  });

  it('scores selected CLI higher than or equal to non-selected CLIs', async () => {
    const result = await new LinUCBStage({ scoreWeight: 0.3 }).route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sig = result.value.context.signals.find((s) => s.startsWith('linucb:selected-'));
      const selectedCli = sig!.replace('linucb:selected-', '');
      const scores = result.value.context.scores;
      const selectedScore =
        scores.get(selectedCli as 'claude' | 'gemini' | 'codex' | 'opencode') ?? 0;
      for (const [cli, score] of scores) {
        if (cli !== selectedCli) expect(score).toBeLessThanOrEqual(selectedScore);
      }
    }
  });

  it('increments routingsCount per call', async () => {
    const stage = new LinUCBStage();
    await stage.route(makeCtx());
    await stage.route(makeCtx());
    expect((stage.getStats() as { routingsCount: number }).routingsCount).toBe(2);
  });
});

describe('LinUCBStage.route task detection', () => {
  it('handles code-related tasks', async () => {
    expect((await new LinUCBStage().route(makeCtx('```typescript\nconst x = 1;\n```'))).ok).toBe(
      true
    );
  });

  it('handles reasoning-related tasks', async () => {
    expect(
      (await new LinUCBStage().route(makeCtx('explain why this architecture is better'))).ok
    ).toBe(true);
  });

  it('handles task with import keyword', async () => {
    expect((await new LinUCBStage().route(makeCtx('import React from react'))).ok).toBe(true);
  });

  it('handles very long tasks', async () => {
    expect((await new LinUCBStage().route(makeCtx('x'.repeat(20000)))).ok).toBe(true);
  });
});

describe('LinUCBStage.route budget signals', () => {
  it('extracts budget utilization from signals', async () => {
    expect((await new LinUCBStage().route(makeCtx('task', ['budget:utilization-0.8']))).ok).toBe(
      true
    );
  });

  it('uses default utilization when no signal present', async () => {
    expect((await new LinUCBStage().route(makeCtx('task', ['other-signal']))).ok).toBe(true);
  });

  it('handles malformed budget signal gracefully', async () => {
    expect(
      (await new LinUCBStage().route(makeCtx('task', ['budget:utilization-notanumber']))).ok
    ).toBe(true);
  });
});

describe('LinUCBStage.route exploration', () => {
  it('tracks exploration rate in stats as number between 0 and 1', async () => {
    const stage = new LinUCBStage();
    await stage.route(makeCtx());
    const rate = (stage.getStats() as { explorationRate: number }).explorationRate;
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });
});

describe('LinUCBStage.recordOutcome', () => {
  it('records successful outcome without error', () => {
    expect(() => {
      new LinUCBStage().recordOutcome(makeOutcome());
    }).not.toThrow();
  });

  it('records failed outcome without error', () => {
    expect(() => {
      new LinUCBStage().recordOutcome(makeOutcome({ success: false }));
    }).not.toThrow();
  });

  it('records outcome with quality score', () => {
    expect(() => {
      new LinUCBStage().recordOutcome(makeOutcome({ qualityScore: 0.9 }));
    }).not.toThrow();
  });

  it('records outcome with latency', () => {
    expect(() => {
      new LinUCBStage().recordOutcome(makeOutcome({ latencyMs: 25000 }));
    }).not.toThrow();
  });

  it('records outcome with both quality and latency', () => {
    expect(() => {
      new LinUCBStage().recordOutcome(makeOutcome({ qualityScore: 0.8, latencyMs: 5000 }));
    }).not.toThrow();
  });

  it('ignores unknown CLI names silently', () => {
    expect(() => {
      new LinUCBStage().recordOutcome(makeOutcome({ selectedCli: 'unknown' as 'claude' }));
    }).not.toThrow();
  });

  it('updates bandit totalPulls after recording', () => {
    const stage = new LinUCBStage();
    stage.recordOutcome(makeOutcome({ selectedCli: 'claude', success: true }));
    expect((stage.getStats() as { bandit: { totalPulls: number } }).bandit.totalPulls).toBe(1);
  });

  it('records outcomes for all valid CLI names', () => {
    const stage = new LinUCBStage();
    stage.recordOutcome(makeOutcome({ selectedCli: 'claude' }));
    stage.recordOutcome(makeOutcome({ selectedCli: 'gemini' }));
    stage.recordOutcome(makeOutcome({ selectedCli: 'codex' }));
    expect((stage.getStats() as { bandit: { totalPulls: number } }).bandit.totalPulls).toBe(3);
  });

  it('records reward near 0.1 for failed tasks', () => {
    const stage = new LinUCBStage();
    stage.recordOutcome(makeOutcome({ success: false }));
    const arms = (stage.getStats() as { bandit: { armStats: Array<{ avgReward: number }> } }).bandit
      .armStats;
    expect(arms.find((a) => a.avgReward > 0 && a.avgReward <= 0.15)).toBeDefined();
  });

  it('records higher reward for high quality outcomes', () => {
    const stage = new LinUCBStage();
    stage.recordOutcome(makeOutcome({ success: true, qualityScore: 1.0 }));
    const arms = (
      stage.getStats() as { bandit: { armStats: Array<{ name: string; avgReward: number }> } }
    ).bandit.armStats;
    expect(arms.find((a) => a.name === 'claude')!.avgReward).toBeGreaterThan(0.5);
  });
});

describe('LinUCBStage.getStats', () => {
  it('returns correct initial stats', () => {
    const stats = new LinUCBStage().getStats() as {
      routingsCount: number;
      explorationRate: number;
      bandit: { totalPulls: number; avgReward: number };
      config: { scoreWeight: number; minPullsForConfidence: number };
    };
    expect(stats.routingsCount).toBe(0);
    expect(stats.explorationRate).toBe(0);
    expect(stats.bandit.totalPulls).toBe(0);
    expect(stats.bandit.avgReward).toBe(0);
    expect(stats.config.scoreWeight).toBe(0.2);
    expect(stats.config.minPullsForConfidence).toBe(5);
  });

  it('includes arm stats for all four CLIs', () => {
    const arms = (
      new LinUCBStage().getStats() as {
        bandit: { armStats: Array<{ name: string }> };
      }
    ).bandit.armStats;
    expect(arms).toHaveLength(4);
    expect(arms.map((a) => a.name)).toEqual(
      expect.arrayContaining(['claude', 'gemini', 'codex', 'opencode'])
    );
  });

  it('updates avgReward after outcomes', () => {
    const stage = new LinUCBStage();
    stage.recordOutcome(makeOutcome({ selectedCli: 'claude', success: true }));
    stage.recordOutcome(makeOutcome({ selectedCli: 'claude', success: true }));
    expect(
      (stage.getStats() as { bandit: { avgReward: number } }).bandit.avgReward
    ).toBeGreaterThan(0);
  });

  it('reflects routingsCount after multiple routes', async () => {
    const stage = new LinUCBStage();
    await stage.route(makeCtx('a'));
    await stage.route(makeCtx('b'));
    await stage.route(makeCtx('c'));
    expect((stage.getStats() as { routingsCount: number }).routingsCount).toBe(3);
  });
});

describe('LinUCBStage reward edge cases', () => {
  it('caps reward at 1.0 for perfect outcomes', () => {
    const stage = new LinUCBStage();
    stage.recordOutcome(makeOutcome({ success: true, qualityScore: 1.0, latencyMs: 1 }));
    const arms = (
      stage.getStats() as { bandit: { armStats: Array<{ name: string; avgReward: number }> } }
    ).bandit.armStats;
    expect(arms.find((a) => a.name === 'claude')!.avgReward).toBeLessThanOrEqual(1.0);
  });

  it('penalizes high latency more than low latency', () => {
    const s1 = new LinUCBStage();
    s1.recordOutcome(makeOutcome({ success: true, latencyMs: 30000 }));
    const high = (
      s1.getStats() as { bandit: { armStats: Array<{ name: string; avgReward: number }> } }
    ).bandit.armStats.find((a) => a.name === 'claude')!.avgReward;

    const s2 = new LinUCBStage();
    s2.recordOutcome(makeOutcome({ success: true, latencyMs: 100 }));
    const low = (
      s2.getStats() as { bandit: { armStats: Array<{ name: string; avgReward: number }> } }
    ).bandit.armStats.find((a) => a.name === 'claude')!.avgReward;

    expect(high).toBeLessThan(low);
  });

  it('gives minimum reward for failed outcome without quality', () => {
    const stage = new LinUCBStage();
    stage.recordOutcome(makeOutcome({ success: false }));
    const arms = (
      stage.getStats() as { bandit: { armStats: Array<{ name: string; avgReward: number }> } }
    ).bandit.armStats;
    expect(arms.find((a) => a.name === 'claude')!.avgReward).toBeCloseTo(0.1, 1);
  });
});

describe('LinUCBStage logger', () => {
  it('logs debug on route', async () => {
    const logger = mockLogger();
    await new LinUCBStage({}, logger).route(makeCtx());
    expect(logger.debug).toHaveBeenCalledWith(
      'LinUCB scoring complete',
      expect.objectContaining({
        selected: expect.any(String),
        ucbScore: expect.any(String),
        isExploration: expect.any(Boolean),
      })
    );
  });

  it('logs debug on recordOutcome', () => {
    const logger = mockLogger();
    new LinUCBStage({}, logger).recordOutcome(makeOutcome());
    expect(logger.debug).toHaveBeenCalledWith(
      'LinUCB outcome recorded',
      expect.objectContaining({
        cli: 'claude',
        reward: expect.any(String),
        success: true,
      })
    );
  });
});
