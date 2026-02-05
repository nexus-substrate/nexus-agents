/**
 * Tests for Outcome Feedback Helpers
 * @module learning/outcome-feedback-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  RoutingDecision,
  TaskOutcome,
  OutcomeClass,
  RouterType,
} from './outcome-feedback-types.js';
import {
  countOutcomesByClass,
  countDecisionsByRouter,
  calculateAverageQuality,
  generateRewardExplanation,
  createRoutingDecision,
  createTaskOutcome,
} from './outcome-feedback-helpers.js';

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({
      now: () => 1700000000000,
      nowIso: () => '2023-11-14T22:13:20.000Z',
    }),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    decisionId: 'dec-1',
    success: true,
    outcomeClass: 'success' as OutcomeClass,
    qualityScore: 0.85,
    durationMs: 5000,
    timestamp: '2023-11-14T22:13:20.000Z',
    qualitySignals: {
      completionRatio: 1.0,
      retryCount: 0,
      errorRecovery: false,
      outputQuality: 0.9,
    },
    ...overrides,
  };
}

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    id: 'dec-1',
    taskDescription: 'test task',
    selectedModel: 'claude',
    routerType: 'linucb' as RouterType,
    confidence: 0.85,
    timestamp: '2023-11-14T22:13:20.000Z',
    features: {},
    ...overrides,
  };
}

// ============================================================================
// countOutcomesByClass
// ============================================================================

describe('countOutcomesByClass', () => {
  it('counts outcomes by class', () => {
    const outcomes = [
      makeOutcome({ outcomeClass: 'success' }),
      makeOutcome({ outcomeClass: 'success' }),
      makeOutcome({ outcomeClass: 'failure' }),
      makeOutcome({ outcomeClass: 'timeout' }),
    ];
    const counts = countOutcomesByClass(outcomes);
    expect(counts.success).toBe(2);
    expect(counts.failure).toBe(1);
    expect(counts.timeout).toBe(1);
    expect(counts.partial).toBe(0);
    expect(counts.error).toBe(0);
  });

  it('returns zeros for empty array', () => {
    const counts = countOutcomesByClass([]);
    expect(counts.success).toBe(0);
    expect(counts.failure).toBe(0);
  });
});

// ============================================================================
// countDecisionsByRouter
// ============================================================================

describe('countDecisionsByRouter', () => {
  it('counts decisions by router type', () => {
    const decisions = [
      makeDecision({ routerType: 'linucb' }),
      makeDecision({ routerType: 'linucb' }),
      makeDecision({ routerType: 'topsis' }),
    ];
    const counts = countDecisionsByRouter(decisions);
    expect(counts.linucb).toBe(2);
    expect(counts.topsis).toBe(1);
    expect(counts.preference).toBe(0);
  });

  it('returns zeros for empty array', () => {
    const counts = countDecisionsByRouter([]);
    expect(counts.linucb).toBe(0);
    expect(counts.topsis).toBe(0);
  });
});

// ============================================================================
// calculateAverageQuality
// ============================================================================

describe('calculateAverageQuality', () => {
  it('returns 0 for empty array', () => {
    expect(calculateAverageQuality([])).toBe(0);
  });

  it('calculates average quality', () => {
    const outcomes = [makeOutcome({ qualityScore: 0.8 }), makeOutcome({ qualityScore: 0.6 })];
    expect(calculateAverageQuality(outcomes)).toBeCloseTo(0.7);
  });

  it('handles single outcome', () => {
    expect(calculateAverageQuality([makeOutcome({ qualityScore: 0.9 })])).toBe(0.9);
  });
});

// ============================================================================
// generateRewardExplanation
// ============================================================================

describe('generateRewardExplanation', () => {
  it('includes success message for successful outcome', () => {
    const explanation = generateRewardExplanation(makeOutcome(), 0.85);
    expect(explanation).toContain('Task succeeded');
    expect(explanation).toContain('0.85');
    expect(explanation).toContain('0.850');
  });

  it('includes partial completion for partial outcome', () => {
    const outcome = makeOutcome({
      success: false,
      outcomeClass: 'partial',
      qualitySignals: {
        completionRatio: 0.75,
        retryCount: 0,
        errorRecovery: false,
        outputQuality: 0.5,
      },
    });
    const explanation = generateRewardExplanation(outcome, 0.5);
    expect(explanation).toContain('Partial completion');
    expect(explanation).toContain('75%');
  });

  it('shows outcome class for failure', () => {
    const outcome = makeOutcome({ success: false, outcomeClass: 'failure' });
    const explanation = generateRewardExplanation(outcome, 0);
    expect(explanation).toContain('Task failure');
  });

  it('includes retry count when present', () => {
    const outcome = makeOutcome({
      qualitySignals: {
        completionRatio: 1.0,
        retryCount: 3,
        errorRecovery: false,
        outputQuality: 0.9,
      },
    });
    const explanation = generateRewardExplanation(outcome, 0.5);
    expect(explanation).toContain('retries=3');
  });

  it('omits retry count when zero', () => {
    const explanation = generateRewardExplanation(makeOutcome(), 0.85);
    expect(explanation).not.toContain('retries');
  });

  it('includes duration', () => {
    const explanation = generateRewardExplanation(makeOutcome({ durationMs: 1234 }), 0.5);
    expect(explanation).toContain('1234ms');
  });
});

// ============================================================================
// createRoutingDecision
// ============================================================================

describe('createRoutingDecision', () => {
  it('creates decision with generated id and timestamp', () => {
    const decision = createRoutingDecision({
      taskDescription: 'test',
      selectedModel: 'claude',
      routerType: 'linucb',
      confidence: 0.9,
      features: {},
    });
    expect(decision.id).toBeDefined();
    expect(decision.timestamp).toBe('2023-11-14T22:13:20.000Z');
    expect(decision.taskDescription).toBe('test');
  });
});

// ============================================================================
// createTaskOutcome
// ============================================================================

describe('createTaskOutcome', () => {
  it('creates outcome with timestamp', () => {
    const outcome = createTaskOutcome({
      decisionId: 'dec-1',
      success: true,
      outcomeClass: 'success',
      qualityScore: 0.9,
      durationMs: 1000,
      qualitySignals: {
        completionRatio: 1.0,
        retryCount: 0,
        errorRecovery: false,
        outputQuality: 0.9,
      },
    });
    expect(outcome.timestamp).toBe('2023-11-14T22:13:20.000Z');
    expect(outcome.success).toBe(true);
  });
});
