/**
 * Tests for RoutingPipeline
 *
 * Covers pipeline execution, stage management, timeout handling,
 * outcome recording, and statistics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoutingPipeline, createRoutingPipeline } from './routing-pipeline.js';
import type { IRouterStage, RoutingContext, CliName } from './router-stage.js';
import { ok } from '../../core/index.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../../core/index.js';

// ============================================================================
// Setup
// ============================================================================

const FIXED_TIME = 1700000000000;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
  return () => {
    resetTimeProvider();
  };
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockStage(name: string, priority: number, scoreAdj?: Record<string, number>) {
  return {
    name,
    priority,
    canHandle: vi.fn().mockReturnValue(true),
    route: vi.fn().mockImplementation((ctx: RoutingContext) => {
      let updatedCtx = ctx;
      if (scoreAdj) {
        const newScores = new Map<CliName, number>(ctx.scores);
        for (const [cli, delta] of Object.entries(scoreAdj)) {
          newScores.set(cli as CliName, (newScores.get(cli as CliName) ?? 0) + delta);
        }
        updatedCtx = { ...ctx, scores: newScores };
      }
      return Promise.resolve(ok({ context: updatedCtx, continuesPipeline: true }));
    }),
    recordOutcome: vi.fn(),
    getStats: vi.fn().mockReturnValue({ custom: 'stat' }),
  } satisfies IRouterStage;
}

// ============================================================================
// Construction
// ============================================================================

describe('RoutingPipeline', () => {
  it('creates with defaults', () => {
    const pipeline = new RoutingPipeline();
    expect(pipeline.getStages()).toEqual([]);
  });

  it('createRoutingPipeline factory works', () => {
    const pipeline = createRoutingPipeline();
    expect(pipeline).toBeDefined();
  });
});

// ============================================================================
// Stage management
// ============================================================================

describe('RoutingPipeline.addStage', () => {
  it('adds a stage', () => {
    const pipeline = new RoutingPipeline();
    pipeline.addStage(createMockStage('test', 50));
    expect(pipeline.getStages().length).toBe(1);
  });

  it('replaces stage with same name', () => {
    const pipeline = new RoutingPipeline();
    pipeline.addStage(createMockStage('test', 50));
    pipeline.addStage(createMockStage('test', 30));
    expect(pipeline.getStages().length).toBe(1);
  });

  it('returns stages sorted by priority', () => {
    const pipeline = new RoutingPipeline();
    pipeline.addStage(createMockStage('last', 90));
    pipeline.addStage(createMockStage('first', 10));
    pipeline.addStage(createMockStage('middle', 50));
    const stages = pipeline.getStages();
    expect(stages[0]?.name).toBe('first');
    expect(stages[1]?.name).toBe('middle');
    expect(stages[2]?.name).toBe('last');
  });
});

describe('RoutingPipeline.removeStage', () => {
  it('removes existing stage', () => {
    const pipeline = new RoutingPipeline();
    pipeline.addStage(createMockStage('test', 50));
    expect(pipeline.removeStage('test')).toBe(true);
    expect(pipeline.getStages().length).toBe(0);
  });

  it('returns false for non-existing stage', () => {
    const pipeline = new RoutingPipeline();
    expect(pipeline.removeStage('nope')).toBe(false);
  });
});

// ============================================================================
// execute
// ============================================================================

describe('RoutingPipeline.execute', () => {
  it('returns decision when stages score candidates', async () => {
    const pipeline = new RoutingPipeline();
    pipeline.addStage(createMockStage('scorer', 50, { gemini: 10 }));
    const result = await pipeline.execute('test task');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.selectedCli).toBe('gemini');
    }
  });

  it('uses default CLI when no stages', async () => {
    const pipeline = new RoutingPipeline({ defaultCli: 'claude' });
    const result = await pipeline.execute('test task');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // All scores are 0, so first available CLI (claude) wins
      expect(result.value.selectedCli).toBe('claude');
    }
  });

  it('executes stages in priority order', async () => {
    const pipeline = new RoutingPipeline();
    const callOrder: string[] = [];
    const stage1 = createMockStage('first', 10);
    stage1.route.mockImplementation((ctx: RoutingContext) => {
      callOrder.push('first');
      return Promise.resolve(ok({ context: ctx, continuesPipeline: true }));
    });
    const stage2 = createMockStage('second', 20);
    stage2.route.mockImplementation((ctx: RoutingContext) => {
      callOrder.push('second');
      return Promise.resolve(ok({ context: ctx, continuesPipeline: true }));
    });
    pipeline.addStage(stage2);
    pipeline.addStage(stage1);
    await pipeline.execute('task');
    expect(callOrder).toEqual(['first', 'second']);
  });

  it('skips stages that return canHandle=false', async () => {
    const pipeline = new RoutingPipeline();
    const stage = createMockStage('skip-me', 50);
    stage.canHandle.mockReturnValue(false);
    pipeline.addStage(stage);
    await pipeline.execute('task');
    expect(stage.route).not.toHaveBeenCalled();
  });

  it('stops pipeline when continuesPipeline is false', async () => {
    const pipeline = new RoutingPipeline();
    const stage1 = createMockStage('stopper', 10);
    stage1.route.mockImplementation((ctx: RoutingContext) =>
      Promise.resolve(ok({ context: ctx, continuesPipeline: false }))
    );
    const stage2 = createMockStage('never-runs', 20);
    pipeline.addStage(stage1);
    pipeline.addStage(stage2);
    await pipeline.execute('task');
    expect(stage2.route).not.toHaveBeenCalled();
  });

  it('returns error when all candidates filtered', async () => {
    const pipeline = new RoutingPipeline();
    const stage = createMockStage('filter-all', 10);
    stage.route.mockImplementation((ctx: RoutingContext) => {
      const filtered = new Map<CliName, string>();
      for (const cli of ctx.availableClis) {
        filtered.set(cli, 'filtered');
      }
      return Promise.resolve(ok({ context: { ...ctx, filtered }, continuesPipeline: true }));
    });
    pipeline.addStage(stage);
    const result = await pipeline.execute('task');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('no_candidates');
    }
  });

  it('continues past failed stages', async () => {
    const pipeline = new RoutingPipeline();
    const failStage = createMockStage('fail', 10);
    failStage.route.mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: { stage: 'fail', code: 'stage_failed' as const, message: 'oops', cause: undefined },
      })
    );
    const goodStage = createMockStage('good', 20, { gemini: 5 });
    pipeline.addStage(failStage);
    pipeline.addStage(goodStage);
    const result = await pipeline.execute('task');
    expect(result.ok).toBe(true);
    expect(goodStage.route).toHaveBeenCalled();
  });

  it('includes trace in decision', async () => {
    const pipeline = new RoutingPipeline();
    pipeline.addStage(createMockStage('tracer', 50));
    const result = await pipeline.execute('task');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.trace).toBeDefined();
      expect(result.value.routingTimeMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// recordOutcome
// ============================================================================

describe('RoutingPipeline.recordOutcome', () => {
  it('calls recordOutcome on all stages', () => {
    const pipeline = new RoutingPipeline();
    const stage1 = createMockStage('s1', 10);
    const stage2 = createMockStage('s2', 20);
    pipeline.addStage(stage1);
    pipeline.addStage(stage2);
    pipeline.recordOutcome({
      selectedCli: 'claude',
      task: 'test',
      success: true,
    });
    expect(stage1.recordOutcome).toHaveBeenCalled();
    expect(stage2.recordOutcome).toHaveBeenCalled();
  });

  it('does not throw when stage recordOutcome fails', () => {
    const pipeline = new RoutingPipeline();
    const stage = createMockStage('bad', 10);
    stage.recordOutcome.mockImplementation(() => {
      throw new Error('oops');
    });
    pipeline.addStage(stage);
    expect(() => {
      pipeline.recordOutcome({ selectedCli: 'claude', task: 'test', success: true });
    }).not.toThrow();
  });
});

// ============================================================================
// getStats
// ============================================================================

describe('RoutingPipeline.getStats', () => {
  it('returns initial stats', () => {
    const pipeline = new RoutingPipeline();
    const stats = pipeline.getStats();
    expect(stats.totalRoutings).toBe(0);
    expect(stats.averageLatencyMs).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  it('tracks stats after execution', async () => {
    const pipeline = new RoutingPipeline();
    pipeline.addStage(createMockStage('s', 50));
    await pipeline.execute('task');
    const stats = pipeline.getStats();
    expect(stats.totalRoutings).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  it('includes stage stats', () => {
    const pipeline = new RoutingPipeline();
    pipeline.addStage(createMockStage('my-stage', 50));
    const stats = pipeline.getStats();
    expect(stats.stageStats['my-stage']).toEqual({ custom: 'stat' });
  });
});
