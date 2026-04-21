/**
 * Tests for routing-scorer.ts
 *
 * Covers routing decision scoring, confidence calibration,
 * decision time scoring, and accuracy evaluation.
 */

import { describe, it, expect } from 'vitest';
import {
  RoutingScorer,
  createRoutingScorer,
  DEFAULT_ROUTING_SCORER_CONFIG,
} from './routing-scorer.js';
import type { EvaluationTask, RoutingDecisionDetails, TaskTestResult } from './types.js';
import type { TaskProfile } from '../../core/index.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(overrides: Partial<EvaluationTask> = {}) {
  return {
    id: 'test-1',
    name: 'Test Task',
    description: 'A test task',
    category: 'code_generation' as const,
    difficulty: 'medium' as const,
    expectedTaskType: 'reasoning' as const,
    ...overrides,
  } as EvaluationTask;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDecision(overrides: Partial<RoutingDecisionDetails> = {}) {
  return {
    selectedCli: 'claude' as const,
    confidence: 0.8,
    reason: 'Best fit',
    alternatives: ['codex', 'gemini'] as const,
    decisionTimeMs: 10,
    taskProfile: {} as TaskProfile,
    ...overrides,
  };
}

// ============================================================================
// RoutingScorer.score
// ============================================================================

describe('RoutingScorer.score', () => {
  it('gives high score when preferred CLI matches', () => {
    const scorer = new RoutingScorer();
    const task = makeTask({ preferredClis: ['claude'] });
    const decision = makeDecision({ selectedCli: 'claude' });
    const result = scorer.score(task, decision);
    expect(result.matchedPreferred).toBe(true);
    expect(result.overallScore).toBeGreaterThan(0.5);
  });

  it('gives lower score when preferred CLI does not match', () => {
    const scorer = new RoutingScorer();
    const task = makeTask({ preferredClis: ['codex'] });
    const decision = makeDecision({ selectedCli: 'claude' });
    const result = scorer.score(task, decision);
    expect(result.matchedPreferred).toBe(false);
  });

  it('treats no preferredClis as matching any CLI', () => {
    const scorer = new RoutingScorer();
    const task = makeTask();
    const decision = makeDecision({ selectedCli: 'gemini' });
    const result = scorer.score(task, decision);
    expect(result.matchedPreferred).toBe(true);
  });

  it('checks reasonable choice by task category', () => {
    const scorer = new RoutingScorer();
    const task = makeTask({ preferredClis: ['gemini'], category: 'code_generation' });
    const decision = makeDecision({ selectedCli: 'codex' });
    const result = scorer.score(task, decision);
    // codex is reasonable for code_generation even though not preferred
    expect(result.reasonableChoice).toBe(true);
  });

  it('calculates confidence calibration with actual score', () => {
    const scorer = new RoutingScorer();
    const task = makeTask();
    const decision = makeDecision({ confidence: 0.9 });
    // Actual score matches confidence → good calibration
    const result = scorer.score(task, decision, 0.9);
    expect(result.confidenceCalibration).toBeCloseTo(1.0);
  });

  it('penalizes poor confidence calibration', () => {
    const scorer = new RoutingScorer();
    const task = makeTask();
    const decision = makeDecision({ confidence: 0.9 });
    // Actual score is very different from confidence
    const result = scorer.score(task, decision, 0.1);
    expect(result.confidenceCalibration).toBeCloseTo(0.2);
  });

  it('uses 0.5 calibration when no actual score', () => {
    const scorer = new RoutingScorer();
    const task = makeTask();
    const decision = makeDecision({ confidence: 0.8 });
    const result = scorer.score(task, decision);
    expect(result.confidenceCalibration).toBe(0.5);
  });

  it('gives high decision time score for fast decisions', () => {
    const scorer = new RoutingScorer();
    const task = makeTask();
    const decision = makeDecision({ decisionTimeMs: 5 });
    const result = scorer.score(task, decision);
    expect(result.decisionTimeScore).toBeGreaterThan(0.9);
  });

  it('gives zero decision time score for slow decisions', () => {
    const scorer = new RoutingScorer();
    const task = makeTask();
    const decision = makeDecision({ decisionTimeMs: 200 });
    const result = scorer.score(task, decision);
    expect(result.decisionTimeScore).toBe(0);
  });

  it('gives 1.0 decision time score for instant decisions', () => {
    const scorer = new RoutingScorer();
    const task = makeTask();
    const decision = makeDecision({ decisionTimeMs: 0 });
    const result = scorer.score(task, decision);
    expect(result.decisionTimeScore).toBe(1);
  });

  it('clamps overall score to [0, 1]', () => {
    const scorer = new RoutingScorer();
    const task = makeTask();
    const decision = makeDecision();
    const result = scorer.score(task, decision, 0.8);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it('generates explanation string', () => {
    const scorer = new RoutingScorer();
    const task = makeTask({ preferredClis: ['claude'] });
    const decision = makeDecision({ selectedCli: 'claude', decisionTimeMs: 5 });
    const result = scorer.score(task, decision);
    expect(result.explanation).toContain('claude');
    expect(result.explanation).toContain('preference');
  });
});

// ============================================================================
// RoutingScorer.evaluateAccuracy
// ============================================================================

describe('RoutingScorer.evaluateAccuracy', () => {
  it('returns zeros for empty results', () => {
    const scorer = new RoutingScorer();
    const stats = scorer.evaluateAccuracy([]);
    expect(stats.accuracy).toBe(0);
    expect(stats.preferredMatchRate).toBe(0);
    expect(stats.averageConfidence).toBe(0);
  });

  it('returns zeros for results without routing decisions', () => {
    const scorer = new RoutingScorer();
    const results: TaskTestResult[] = [
      {
        task: makeTask(),
        cli: 'claude',
        response: 'done',
        durationMs: 100,
        tokenUsage: { inputTokens: 10, outputTokens: 20 },
        costUsd: 0.01,
        success: true,
      } as TaskTestResult,
    ];
    const stats = scorer.evaluateAccuracy(results);
    expect(stats.accuracy).toBe(0);
  });

  it('calculates accuracy for matched preferences', () => {
    const scorer = new RoutingScorer();
    const task = makeTask({ preferredClis: ['claude'] });
    const results: TaskTestResult[] = [
      {
        task,
        cli: 'claude',
        response: 'done',
        durationMs: 100,
        tokenUsage: { inputTokens: 10, outputTokens: 20 },
        costUsd: 0.01,
        success: true,
        routingDecision: makeDecision({ selectedCli: 'claude', confidence: 0.9 }),
      } as TaskTestResult,
    ];
    const stats = scorer.evaluateAccuracy(results);
    expect(stats.accuracy).toBe(1);
    expect(stats.preferredMatchRate).toBe(1);
  });

  it('calculates calibration error', () => {
    const scorer = new RoutingScorer();
    const task = makeTask({ preferredClis: ['claude'] });
    const results: TaskTestResult[] = [
      {
        task,
        cli: 'claude',
        response: 'done',
        durationMs: 100,
        tokenUsage: { inputTokens: 10, outputTokens: 20 },
        costUsd: 0.01,
        success: false, // failed but confidence was high
        routingDecision: makeDecision({ selectedCli: 'claude', confidence: 0.9 }),
      } as TaskTestResult,
    ];
    const stats = scorer.evaluateAccuracy(results);
    // confidence 0.9 vs actual success 0 → calibration error 0.9
    expect(stats.calibrationError).toBeCloseTo(0.9);
  });
});

// ============================================================================
// createRoutingScorer
// ============================================================================

describe('createRoutingScorer', () => {
  it('creates scorer with default config', () => {
    const scorer = createRoutingScorer();
    expect(scorer).toBeInstanceOf(RoutingScorer);
  });

  it('creates scorer with custom config', () => {
    const scorer = createRoutingScorer({ maxDecisionTimeMs: 50 });
    expect(scorer).toBeInstanceOf(RoutingScorer);
  });
});

// ============================================================================
// DEFAULT_ROUTING_SCORER_CONFIG
// ============================================================================

describe('DEFAULT_ROUTING_SCORER_CONFIG', () => {
  it('weights sum to 1.0', () => {
    const { preferredMatchWeight, reasonableChoiceWeight, confidenceWeight, decisionTimeWeight } =
      DEFAULT_ROUTING_SCORER_CONFIG;
    expect(
      preferredMatchWeight + reasonableChoiceWeight + confidenceWeight + decisionTimeWeight
    ).toBeCloseTo(1.0);
  });
});
