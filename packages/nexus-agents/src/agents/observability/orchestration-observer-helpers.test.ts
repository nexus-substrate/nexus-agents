/**
 * Tests for Orchestration Observer Helpers
 * @module agents/observability/orchestration-observer-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { DomainEvent } from '../collaboration/event-bus-types.js';
import type {
  RoutingDecision,
  SessionMetrics,
  TokenUsage,
} from './orchestration-observer-types.js';
import {
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
    const agent = createTrackedAgent('agent-1', 'busy', 'code_expert', 'fixing bug');
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
    const tokens: TokenUsage = { inputTokens: 100, outputTokens: 200, totalTokens: 1000 };
    // 1000 / 1000 * 0.01 = 0.01
    expect(calculateTokenCost(tokens, 0.01)).toBeCloseTo(0.01);
  });

  it('returns 0 for zero tokens', () => {
    const tokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    expect(calculateTokenCost(tokens, 0.01)).toBe(0);
  });
});
