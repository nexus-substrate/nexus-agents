/**
 * Tests for Orchestration Observer Helpers
 * @module agents/observability/orchestration-observer-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { DomainEvent } from '../collaboration/event-bus-types.js';
import type {
  RoutingDecision,
  SessionMetrics,
  SessionTokenTotals,
} from './orchestration-observer-types.js';
import {
  resolveModelCost,
  registryCostForModel,
  extractStringField,
  extractNumberField,
  extractBooleanField,
  extractStringArrayField,
  extractSessionId,
  createInitialSessionMetrics,
  createInitialTokenUsage,
  createInitialCostMetrics,
  createTrackedAgent,
  calculateRoutingDistribution,
  calculateMetricsTotals,
  countActiveSessions,
  findActiveSession,
  identifySessionsToRemove,
  calculateTokenCost,
} from './orchestration-observer-helpers.js';

vi.mock('../../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000, nowIso: () => '2023-11-14T22:13:20.000Z' }),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeSessionMetrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    sessionId: 'session-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 0,
    taskCount: 0,
    successCount: 0,
    failureCount: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    costMetrics: { totalCostUsd: 0, costPerModel: new Map() },
    routingDecisions: 0,
    eventsProcessed: 0,
    ...overrides,
  };
}

// ============================================================================
// Payload Extraction Helpers
// ============================================================================

describe('extractStringField', () => {
  it('returns string value', () => {
    expect(extractStringField({ name: 'hello' }, 'name')).toBe('hello');
  });

  it('returns empty for non-string', () => {
    expect(extractStringField({ name: 42 }, 'name')).toBe('');
  });

  it('returns empty for missing field', () => {
    expect(extractStringField({}, 'name')).toBe('');
  });
});

describe('extractNumberField', () => {
  it('returns number value', () => {
    expect(extractNumberField({ count: 5 }, 'count')).toBe(5);
  });

  it('returns default for non-number', () => {
    expect(extractNumberField({ count: 'five' }, 'count', 10)).toBe(10);
  });

  it('returns 0 by default', () => {
    expect(extractNumberField({}, 'count')).toBe(0);
  });
});

describe('extractBooleanField', () => {
  it('returns true for true value', () => {
    expect(extractBooleanField({ active: true }, 'active')).toBe(true);
  });

  it('returns false for non-true values', () => {
    expect(extractBooleanField({ active: false }, 'active')).toBe(false);
    expect(extractBooleanField({ active: 'yes' }, 'active')).toBe(false);
    expect(extractBooleanField({}, 'active')).toBe(false);
  });
});

describe('extractStringArrayField', () => {
  it('returns string array', () => {
    expect(extractStringArrayField({ tags: ['a', 'b'] }, 'tags')).toEqual(['a', 'b']);
  });

  it('returns empty for non-array', () => {
    expect(extractStringArrayField({ tags: 'not array' }, 'tags')).toEqual([]);
  });
});

describe('extractSessionId', () => {
  it('uses event sessionId first', () => {
    const event = { sessionId: 'from-event' } as DomainEvent;
    expect(extractSessionId(event, { sessionId: 'from-payload' })).toBe('from-event');
  });

  it('falls back to payload sessionId', () => {
    const event = {} as DomainEvent;
    expect(extractSessionId(event, { sessionId: 'from-payload' })).toBe('from-payload');
  });

  it('returns empty when neither has sessionId', () => {
    const event = {} as DomainEvent;
    expect(extractSessionId(event, {})).toBe('');
  });
});

// ============================================================================
// Object Creation Helpers
// ============================================================================

describe('createInitialTokenUsage', () => {
  it('creates zero token usage', () => {
    const usage = createInitialTokenUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });
});

describe('createInitialCostMetrics', () => {
  it('creates zero cost metrics', () => {
    const metrics = createInitialCostMetrics();
    expect(metrics.totalCostUsd).toBe(0);
    expect(metrics.costPerModel.size).toBe(0);
  });
});

describe('createInitialSessionMetrics', () => {
  it('creates session metrics with defaults', () => {
    const metrics = createInitialSessionMetrics('session-42');
    expect(metrics.sessionId).toBe('session-42');
    expect(metrics.durationMs).toBe(0);
    expect(metrics.taskCount).toBe(0);
    expect(metrics.tokenUsage.totalTokens).toBe(0);
  });
});

describe('createTrackedAgent', () => {
  it('creates tracked agent with defaults', () => {
    const agent = createTrackedAgent('agent-1', 'idle');
    expect(agent.id).toBe('agent-1');
    expect(agent.state).toBe('idle');
    expect(agent.role).toBe('unknown');
    expect(agent.taskCount).toBe(0);
    expect(agent.errorCount).toBe(0);
  });

  it('accepts custom role and task', () => {
    const agent = createTrackedAgent('agent-1', 'executing', 'code_expert', 'fixing bug');
    expect(agent.role).toBe('code_expert');
    expect(agent.currentTask).toBe('fixing bug');
  });
});

// ============================================================================
// Statistics Calculation Helpers
// ============================================================================

describe('calculateRoutingDistribution', () => {
  it('counts routing decisions by CLI', () => {
    const history: RoutingDecision[] = [
      { selectedCli: 'claude' } as RoutingDecision,
      { selectedCli: 'claude' } as RoutingDecision,
      { selectedCli: 'gemini' } as RoutingDecision,
    ];
    const dist = calculateRoutingDistribution(history);
    expect(dist.claude).toBe(2);
    expect(dist.gemini).toBe(1);
    expect(dist.codex).toBe(0);
  });

  it('returns zeros for empty history', () => {
    const dist = calculateRoutingDistribution([]);
    expect(dist.claude).toBe(0);
    expect(dist.gemini).toBe(0);
    expect(dist.codex).toBe(0);
  });
});

describe('calculateMetricsTotals', () => {
  it('sums tokens and costs', () => {
    const metrics = [
      makeSessionMetrics({
        tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 100 },
        costMetrics: { totalCostUsd: 0.5, costPerModel: new Map() },
      }),
      makeSessionMetrics({
        sessionId: 's2',
        tokenUsage: { inputTokens: 5, outputTokens: 10, totalTokens: 50 },
        costMetrics: { totalCostUsd: 0.3, costPerModel: new Map() },
      }),
    ];
    const totals = calculateMetricsTotals(metrics);
    expect(totals.totalTokens).toBe(150);
    expect(totals.totalCost).toBeCloseTo(0.8);
  });

  it('returns zeros for empty', () => {
    const totals = calculateMetricsTotals([]);
    expect(totals.totalTokens).toBe(0);
    expect(totals.totalCost).toBe(0);
  });
});

describe('countActiveSessions', () => {
  it('counts sessions without completedAt', () => {
    const metrics = [
      makeSessionMetrics(),
      makeSessionMetrics({ sessionId: 's2', completedAt: '2026-01-01T01:00:00.000Z' }),
      makeSessionMetrics({ sessionId: 's3' }),
    ];
    expect(countActiveSessions(metrics)).toBe(2);
  });
});

describe('findActiveSession', () => {
  it('returns first active session', () => {
    const metrics = [
      makeSessionMetrics({ completedAt: '2026-01-01T01:00:00.000Z' }),
      makeSessionMetrics({ sessionId: 's2' }),
    ];
    expect(findActiveSession(metrics)?.sessionId).toBe('s2');
  });

  it('returns undefined when all completed', () => {
    const metrics = [makeSessionMetrics({ completedAt: '2026-01-01T01:00:00.000Z' })];
    expect(findActiveSession(metrics)).toBeUndefined();
  });
});

// ============================================================================
// Pruning Helpers
// ============================================================================

describe('identifySessionsToRemove', () => {
  it('returns empty when under limit', () => {
    const sessions: Array<[string, SessionMetrics]> = [
      ['s1', makeSessionMetrics({ startedAt: '2026-01-01T00:00:00.000Z' })],
    ];
    expect(identifySessionsToRemove(sessions, 5)).toEqual([]);
  });

  it('removes oldest sessions over limit', () => {
    const sessions: Array<[string, SessionMetrics]> = [
      ['s1', makeSessionMetrics({ startedAt: '2026-01-01T00:00:00.000Z' })],
      ['s2', makeSessionMetrics({ sessionId: 's2', startedAt: '2026-01-02T00:00:00.000Z' })],
      ['s3', makeSessionMetrics({ sessionId: 's3', startedAt: '2026-01-03T00:00:00.000Z' })],
    ];
    const toRemove = identifySessionsToRemove(sessions, 2);
    expect(toRemove).toHaveLength(1);
    expect(toRemove).toContain('s1');
  });
});

// ============================================================================
// Token Cost Calculation
// ============================================================================

describe('calculateTokenCost', () => {
  it('calculates cost from tokens and rate', () => {
    const tokens: SessionTokenTotals = { inputTokens: 100, outputTokens: 200, totalTokens: 1000 };
    // 1000 / 1000 * 0.01 = 0.01
    expect(calculateTokenCost(tokens, 0.01)).toBeCloseTo(0.01);
  });

  it('returns 0 for zero tokens', () => {
    const tokens: SessionTokenTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    expect(calculateTokenCost(tokens, 0.01)).toBe(0);
  });
});

describe('cost resolution reads split rates from the registry (#5180)', () => {
  const t = (input: number, output: number): SessionTokenTotals => ({
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  });

  describe('back-compat: a scalar override keeps its historical meaning', () => {
    // The binding condition from the ratifying panel: a bare number was always a
    // BLENDED per-1K rate, and must not be quietly reinterpreted as an input
    // rate — that would move every existing operator's numbers silently.
    it.each([
      [10_000, 90_000, 0.015, 1.5],
      [1000, 1000, 0.015, 0.03],
      [50_000, 50_000, 0.01, 1],
      [10_000, 90_000, 0.001, 0.1],
    ])('%i in / %i out at %f per 1K stays $%f', (i, o, rate, expected) => {
      expect(resolveModelCost(t(i, o), rate)).toBeCloseTo(expected, 10);
    });

    it('zero tokens cost zero at any scalar rate', () => {
      expect(resolveModelCost(t(0, 0), 0.015)).toBe(0);
    });
  });

  describe('a split override prices input and output separately', () => {
    it('charges output at its own rate', () => {
      // 10k at $0.01/1K + 90k at $0.05/1K = 0.1 + 4.5 = $4.60.
      expect(resolveModelCost(t(10_000, 90_000), { input: 0.01, output: 0.05 })).toBeCloseTo(
        4.6,
        10
      );
    });

    it('differs from the blended answer for the same tokens, which is the point', () => {
      const blended = resolveModelCost(t(10_000, 90_000), 0.015);
      const split = resolveModelCost(t(10_000, 90_000), { input: 0.01, output: 0.05 });
      expect(split).not.toBeCloseTo(blended as number, 3);
    });
  });

  describe('no override falls back to the registry, never to zero', () => {
    it('prices claude 10k in / 90k out at the registry split', () => {
      // The pinned figure from the ratified decision. The old private table
      // charged $1.50 for this; the registry's 10/50 per 1M gives $4.60.
      expect(registryCostForModel(t(10_000, 90_000), 'claude')).toBeCloseTo(4.6, 10);
    });

    it('resolves a CliName to its default model, not the CliName itself', () => {
      // 'claude' is a CliName; the registry keys on model ids like
      // 'claude-fable-5'. Looking up the CliName directly returns unpriced, so
      // without this resolution every model would report $0 — a 100%
      // understatement replacing a 3x one. Any non-zero result proves the
      // resolution happened.
      for (const cli of ['claude', 'gemini', 'codex', 'opencode']) {
        expect(registryCostForModel(t(1000, 1000), cli), cli).toBeGreaterThan(0);
      }
    });

    it('fails SOFT on an unrecognised name rather than throwing', () => {
      // This runs on the routing hot path. getDefaultModelForCli throws on an
      // unknown CliName, and taking down a routing call to record a metric
      // would be worse than the mispricing being fixed.
      expect(() => registryCostForModel(t(1000, 1000), 'not-a-cli')).not.toThrow();
      expect(registryCostForModel(t(1000, 1000), 'not-a-cli')).toBe(0);
    });

    it('names the empty case: zero tokens is zero, not an error', () => {
      expect(registryCostForModel(t(0, 0), 'claude')).toBe(0);
    });
  });

  describe('resolveModelCost signals absence so the caller can fall back', () => {
    it('returns undefined when there is no override at all', () => {
      // Returning 0 here would make "no override" indistinguishable from "free"
      // and the registry fallback would never run.
      expect(resolveModelCost(t(1000, 1000), undefined)).toBeUndefined();
    });
  });
});
