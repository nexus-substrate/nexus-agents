/**
 * Unit tests for TOPSIS Router Stage
 *
 * Tests multi-criteria model selection using TOPSIS algorithm.
 *
 * @module cli-adapters/routing/stages/topsis-stage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopsisRouterStage, createTopsisStage } from './topsis-stage.js';
import type { RoutingContext, CliName, RoutingOutcome } from '../router-stage.js';
import { createRoutingContext } from '../router-stage.js';
import type { ILogger } from '../../../core/index.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../../../core/index.js';

const FIXED_TIME = 1700000000000;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
  return () => {
    resetTimeProvider();
  };
});

// ============================================================================
// Helpers
// ============================================================================

const mockLogger = (): ILogger => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
};

const createMockContext = (
  clis: readonly CliName[] = ['claude', 'gemini', 'codex'],
  filtered: Map<CliName, string> = new Map()
): RoutingContext => {
  const ctx = createRoutingContext('test task', clis);
  return { ...ctx, filtered };
};

// ============================================================================
// Constructor Tests
// ============================================================================

describe('TopsisRouterStage - Constructor', () => {
  it('creates stage with default config', () => {
    const stage = new TopsisRouterStage();
    expect(stage.name).toBe('topsis');
    expect(stage.priority).toBe(60);
  });

  it('creates stage with custom config', () => {
    const stage = new TopsisRouterStage({
      qualityWeight: 0.6,
      costWeight: 0.3,
      latencyWeight: 0.1,
      minCandidates: 3,
    });
    expect(stage.name).toBe('topsis');
    const stats = stage.getStats();
    expect(stats.config).toEqual({
      qualityWeight: 0.6,
      costWeight: 0.3,
      latencyWeight: 0.1,
    });
  });

  it('throws error if weights do not sum to 1.0', () => {
    expect(
      () =>
        new TopsisRouterStage({
          qualityWeight: 0.5,
          costWeight: 0.3,
          latencyWeight: 0.3,
        })
    ).toThrow('TOPSIS weights must sum to 1.0');
  });

  it('accepts weights within tolerance', () => {
    expect(
      () =>
        new TopsisRouterStage({
          qualityWeight: 0.501,
          costWeight: 0.299,
          latencyWeight: 0.2,
        })
    ).not.toThrow();
  });

  it('validates weights sum when all weights provided', () => {
    expect(
      () =>
        new TopsisRouterStage({
          qualityWeight: 0.4,
          costWeight: 0.4,
          latencyWeight: 0.4,
        })
    ).toThrow();
  });
});

// ============================================================================
// canHandle Tests
// ============================================================================

describe('TopsisRouterStage - canHandle', () => {
  let stage: TopsisRouterStage;

  beforeEach(() => {
    stage = new TopsisRouterStage({ minCandidates: 2 }, mockLogger());
  });

  it('returns true when sufficient candidates remain', () => {
    const ctx = createMockContext(['claude', 'gemini', 'codex']);
    expect(stage.canHandle(ctx)).toBe(true);
  });

  it('returns true with exactly minCandidates', () => {
    const ctx = createMockContext(['claude', 'gemini']);
    expect(stage.canHandle(ctx)).toBe(true);
  });

  it('returns false when below minCandidates', () => {
    const filtered = new Map<CliName, string>([
      ['gemini', 'filtered'],
      ['codex', 'filtered'],
    ]);
    const ctx = createMockContext(['claude', 'gemini', 'codex'], filtered);
    expect(stage.canHandle(ctx)).toBe(false);
  });

  it('returns false with no candidates', () => {
    const filtered = new Map<CliName, string>([
      ['claude', 'filtered'],
      ['gemini', 'filtered'],
      ['codex', 'filtered'],
    ]);
    const ctx = createMockContext(['claude', 'gemini', 'codex'], filtered);
    expect(stage.canHandle(ctx)).toBe(false);
  });

  it('respects custom minCandidates configuration', () => {
    const customStage = new TopsisRouterStage({ minCandidates: 3 }, mockLogger());
    const ctx = createMockContext(['claude', 'gemini']);
    expect(customStage.canHandle(ctx)).toBe(false);
  });
});

// ============================================================================
// route Tests
// ============================================================================

describe('TopsisRouterStage - route', () => {
  let stage: TopsisRouterStage;
  let logger: ILogger;

  beforeEach(() => {
    logger = mockLogger();
    stage = new TopsisRouterStage(
      {
        qualityWeight: 0.5,
        costWeight: 0.3,
        latencyWeight: 0.2,
        expectedInputTokens: 2000,
        expectedOutputTokens: 1000,
      },
      logger
    );
  });

  it('executes TOPSIS selection and updates scores', async () => {
    const ctx = createMockContext(['claude', 'gemini', 'codex']);
    const result = await stage.route(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.continuesPipeline).toBe(true);
      expect(result.value.context.scores.size).toBe(3);
      expect(result.value.context.signals.length).toBeGreaterThan(0);
      expect(result.value.context.trace.length).toBe(1);
    }
  });

  it('updates scores for all candidates', async () => {
    const ctx = createMockContext(['claude', 'gemini', 'codex']);
    const result = await stage.route(ctx);

    if (result.ok) {
      const scores = result.value.context.scores;
      expect(scores.get('claude')).toBeGreaterThanOrEqual(0);
      expect(scores.get('gemini')).toBeGreaterThanOrEqual(0);
      expect(scores.get('codex')).toBeGreaterThanOrEqual(0);
    }
  });

  it('updates scores for remaining candidates only', async () => {
    const filtered = new Map<CliName, string>([['codex', 'filtered']]);
    const ctx = createMockContext(['claude', 'gemini', 'codex'], filtered);
    const result = await stage.route(ctx);

    if (result.ok) {
      const initialCodexScore = ctx.scores.get('codex') ?? 0;
      const updatedCodexScore = result.value.context.scores.get('codex') ?? 0;
      expect(updatedCodexScore).toBe(initialCodexScore);
    }
  });

  it('adds trace entry with duration', async () => {
    const ctx = createMockContext();
    const result = await stage.route(ctx);

    if (result.ok) {
      const trace = result.value.context.trace;
      expect(trace).toHaveLength(1);
      expect(trace[0]!.stageName).toBe('topsis');
      expect(trace[0]!.action).toBe('score');
      expect(trace[0]!.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('adds signal about selected model', async () => {
    const ctx = createMockContext();
    const result = await stage.route(ctx);

    if (result.ok) {
      const signals = result.value.context.signals;
      expect(signals.some((s) => s.startsWith('topsis:'))).toBe(true);
    }
  });

  it('logs debug information', async () => {
    const ctx = createMockContext(['claude', 'gemini']);
    await stage.route(ctx);

    expect(logger.debug).toHaveBeenCalledWith(
      'TOPSIS stage executing',
      expect.objectContaining({
        candidates: 2,
        inputTokens: 2000,
        outputTokens: 1000,
      })
    );
  });

  it('updates routing statistics', async () => {
    const ctx = createMockContext();
    await stage.route(ctx);
    await stage.route(ctx);

    const stats = stage.getStats();
    expect(stats.routingsCount).toBe(2);
  });

  it('returns ok result with continued pipeline', async () => {
    const ctx = createMockContext();
    const result = await stage.route(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.continuesPipeline).toBe(true);
      expect(result.value.decision).toBeUndefined();
    }
  });
});

// ============================================================================
// recordOutcome Tests
// ============================================================================

describe('TopsisRouterStage - recordOutcome', () => {
  let stage: TopsisRouterStage;
  let logger: ILogger;

  beforeEach(() => {
    logger = mockLogger();
    stage = new TopsisRouterStage({}, logger);
  });

  it('logs outcome information', () => {
    const outcome: RoutingOutcome = {
      selectedCli: 'claude',
      task: 'test task',
      success: true,
      latencyMs: 500,
      qualityScore: 0.9,
    };

    stage.recordOutcome(outcome);

    expect(logger.debug).toHaveBeenCalledWith(
      'TOPSIS outcome recorded',
      expect.objectContaining({
        cli: 'claude',
        success: true,
        latencyMs: 500,
      })
    );
  });

  it('accepts outcome without optional fields', () => {
    const outcome: RoutingOutcome = {
      selectedCli: 'gemini',
      task: 'test task',
      success: false,
    };

    expect(() => {
      stage.recordOutcome(outcome);
    }).not.toThrow();
  });

  it('logs failed outcomes', () => {
    const outcome: RoutingOutcome = {
      selectedCli: 'codex',
      task: 'failed task',
      success: false,
    };
    stage.recordOutcome(outcome);
    expect(logger.debug).toHaveBeenCalledWith(
      'TOPSIS outcome recorded',
      expect.objectContaining({ success: false })
    );
  });
});

// ============================================================================
// getStats Tests
// ============================================================================

describe('TopsisRouterStage - getStats', () => {
  it('returns initial stats with zero routings', () => {
    const stage = new TopsisRouterStage({
      qualityWeight: 0.6,
      costWeight: 0.25,
      latencyWeight: 0.15,
    });
    const stats = stage.getStats();
    expect(stats).toEqual({
      routingsCount: 0,
      averageLatencyMs: 0,
      config: {
        qualityWeight: 0.6,
        costWeight: 0.25,
        latencyWeight: 0.15,
      },
    });
  });

  it('calculates average latency after routing', async () => {
    const stage = new TopsisRouterStage();
    await stage.route(createMockContext());
    const stats = stage.getStats();
    expect(stats.routingsCount).toBe(1);
    expect(stats.averageLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('tracks multiple routings correctly', async () => {
    const stage = new TopsisRouterStage();
    const ctx = createMockContext();
    await stage.route(ctx);
    await stage.route(ctx);
    await stage.route(ctx);
    const stats = stage.getStats();
    expect(stats.routingsCount).toBe(3);
  });
});

// ============================================================================
// createTopsisStage Factory Tests
// ============================================================================

describe('createTopsisStage', () => {
  it('creates stage with default config', () => {
    const stage = createTopsisStage();
    expect(stage).toBeInstanceOf(TopsisRouterStage);
    expect(stage.name).toBe('topsis');
  });

  it('creates stage with custom config', () => {
    const stage = createTopsisStage({ minCandidates: 3 });
    expect(stage).toBeInstanceOf(TopsisRouterStage);
  });

  it('creates stage with custom logger', () => {
    const customLogger = mockLogger();
    const stage = createTopsisStage({}, customLogger);
    expect(stage).toBeInstanceOf(TopsisRouterStage);
  });

  it('creates stage with all config options', () => {
    const stage = createTopsisStage({
      qualityWeight: 0.4,
      costWeight: 0.4,
      latencyWeight: 0.2,
      expectedInputTokens: 3000,
      expectedOutputTokens: 1500,
      minCandidates: 2,
    });
    expect(stage.name).toBe('topsis');
  });
});
