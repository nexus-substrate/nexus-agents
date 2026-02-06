/**
 * Tests for latts-controller.ts
 *
 * Covers AdaptiveLattsController: accept (high-confidence, threshold),
 * resample, backtrack, restart, stop decisions, exhausted attempts,
 * time budget, and repeated-failure patterns.
 */

import { describe, it, expect } from 'vitest';
import { AdaptiveLattsController } from './latts-controller.js';
import type { VerificationResult, LattsHistoryEntry, DecisionContext } from './latts-types.js';
import type { StepResult } from '../core/index.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeVerification(overrides: Partial<VerificationResult> = {}) {
  return {
    accepted: false,
    confidence: 0.5,
    reason: 'test reason',
    ...overrides,
  } as VerificationResult;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeContext(overrides: Partial<DecisionContext> = {}) {
  return {
    stepId: 'step-1',
    maxAttempts: 20,
    currentAttempt: 1,
    backtrackableSteps: [],
    allowRestart: true,
    elapsedMs: 0,
    maxTimeMs: 300000,
    ...overrides,
  } as DecisionContext;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeHistoryEntry(overrides: Partial<LattsHistoryEntry> = {}) {
  return {
    attempt: 1,
    result: { stepId: 'step-1', output: 'ok', durationMs: 10, status: 'success' as const },
    verification: makeVerification(),
    decision: { type: 'resample' as const, reason: 'test' },
    durationMs: 100,
    ...overrides,
  } as LattsHistoryEntry;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeFailedEntry(issues: string[] = ['issue-A']) {
  return makeHistoryEntry({
    verification: makeVerification({ accepted: false, issues }),
  });
}

// ============================================================================
// Constructor
// ============================================================================

describe('AdaptiveLattsController - constructor', () => {
  it('creates with default config', () => {
    const ctrl = new AdaptiveLattsController();
    expect(ctrl).toBeInstanceOf(AdaptiveLattsController);
  });

  it('creates with custom config', () => {
    const ctrl = new AdaptiveLattsController({ maxAttemptsPerStep: 3 });
    expect(ctrl).toBeInstanceOf(AdaptiveLattsController);
  });
});

// ============================================================================
// Accept decisions
// ============================================================================

describe('AdaptiveLattsController - accept', () => {
  const ctrl = new AdaptiveLattsController();

  it('accepts high-confidence result', () => {
    const v = makeVerification({ accepted: true, confidence: 0.96, qualityScore: 0.9 });
    const decision = ctrl.decide(v, [], makeContext());
    expect(decision.type).toBe('accept');
    expect(decision.reason).toContain('confidence=0.96');
  });

  it('accepts result meeting threshold', () => {
    const v = makeVerification({ accepted: true, confidence: 0.8, qualityScore: 0.7 });
    const decision = ctrl.decide(v, [], makeContext());
    expect(decision.type).toBe('accept');
  });

  it('accepts when quality score undefined and confidence meets threshold', () => {
    const v = makeVerification({ accepted: true, confidence: 0.8 });
    const decision = ctrl.decide(v, [], makeContext());
    expect(decision.type).toBe('accept');
  });

  it('does not accept when confidence below threshold', () => {
    const v = makeVerification({ accepted: true, confidence: 0.5, qualityScore: 0.9 });
    const decision = ctrl.decide(v, [], makeContext());
    expect(decision.type).not.toBe('accept');
  });

  it('does not accept when quality below threshold', () => {
    const v = makeVerification({ accepted: true, confidence: 0.8, qualityScore: 0.3 });
    const decision = ctrl.decide(v, [], makeContext());
    expect(decision.type).not.toBe('accept');
  });

  it('does not accept rejected verification even with high confidence', () => {
    const v = makeVerification({ accepted: false, confidence: 0.99, qualityScore: 0.99 });
    const decision = ctrl.decide(v, [], makeContext());
    expect(decision.type).not.toBe('accept');
  });
});

// ============================================================================
// Resample decisions
// ============================================================================

describe('AdaptiveLattsController - resample', () => {
  const ctrl = new AdaptiveLattsController();

  it('resamples on failure with adjustments', () => {
    const v = makeVerification({ issues: ['fix formatting'], qualityScore: 0.3 });
    const decision = ctrl.decide(v, [], makeContext());
    expect(decision.type).toBe('resample');
    if (decision.type === 'resample') {
      expect(decision.adjustments).toBeDefined();
      expect(decision.adjustments?.['focusAreas']).toEqual(['fix formatting']);
      expect(decision.adjustments?.['increaseDetail']).toBe(true);
    }
  });

  it('resamples without adjustments when no issues', () => {
    const v = makeVerification({ qualityScore: 0.55 });
    const decision = ctrl.decide(v, [], makeContext());
    expect(decision.type).toBe('resample');
    if (decision.type === 'resample') {
      expect(decision.adjustments?.['focusAreas']).toBeUndefined();
    }
  });
});

// ============================================================================
// Exhausted attempts
// ============================================================================

describe('AdaptiveLattsController - exhausted attempts', () => {
  it('stops when max attempts reached with no backtrack options', () => {
    const ctrl = new AdaptiveLattsController({
      maxAttemptsPerStep: 3,
      allowBacktrack: false,
      allowRestart: false,
    });
    const v = makeVerification();
    const ctx = makeContext({ currentAttempt: 3 });
    const decision = ctrl.decide(v, [], ctx);
    expect(decision.type).toBe('stop');
  });

  it('backtracks when max attempts reached and backtrack available', () => {
    const ctrl = new AdaptiveLattsController({ maxAttemptsPerStep: 3 });
    const v = makeVerification();
    const ctx = makeContext({ currentAttempt: 3, backtrackableSteps: ['step-0'] });
    const decision = ctrl.decide(v, [], ctx);
    expect(decision.type).toBe('backtrack');
    if (decision.type === 'backtrack') {
      expect(decision.toStepId).toBe('step-0');
    }
  });

  it('prefers backtrack target with accepted history', () => {
    const ctrl = new AdaptiveLattsController({ maxAttemptsPerStep: 3 });
    const v = makeVerification();
    const history = [
      makeHistoryEntry({
        result: { stepId: 'step-B', output: 'ok', durationMs: 10, status: 'success' } as StepResult,
        verification: makeVerification({ accepted: true }),
      }),
    ];
    const ctx = makeContext({
      currentAttempt: 3,
      backtrackableSteps: ['step-A', 'step-B'],
    });
    const decision = ctrl.decide(v, history, ctx);
    expect(decision.type).toBe('backtrack');
    if (decision.type === 'backtrack') {
      expect(decision.toStepId).toBe('step-B');
    }
  });

  it('restarts when backtrack unavailable and restart allowed', () => {
    const ctrl = new AdaptiveLattsController({ maxAttemptsPerStep: 3, allowBacktrack: false });
    const v = makeVerification();
    // currentAttempt < maxAttempts / 2 → restart allowed
    const ctx = makeContext({ currentAttempt: 3, maxAttempts: 20 });
    const decision = ctrl.decide(v, [], ctx);
    expect(decision.type).toBe('restart');
  });

  it('stops with best output when all options exhausted', () => {
    const ctrl = new AdaptiveLattsController({
      maxAttemptsPerStep: 2,
      allowBacktrack: false,
      allowRestart: false,
    });
    const history = [
      makeHistoryEntry({
        verification: makeVerification({ accepted: true, qualityScore: 0.8, confidence: 0.9 }),
        result: {
          stepId: 'step-1',
          output: 'best result',
          durationMs: 10,
          status: 'success',
        } as StepResult,
      }),
    ];
    const ctx = makeContext({ currentAttempt: 2 });
    const decision = ctrl.decide(makeVerification(), history, ctx);
    expect(decision.type).toBe('stop');
    if (decision.type === 'stop') {
      expect(decision.output).toBe('best result');
    }
  });
});

// ============================================================================
// Time budget
// ============================================================================

describe('AdaptiveLattsController - time budget', () => {
  const ctrl = new AdaptiveLattsController();

  it('stops when time budget nearly exhausted', () => {
    const v = makeVerification();
    const ctx = makeContext({ elapsedMs: 280000, maxTimeMs: 300000 });
    const decision = ctrl.decide(v, [], ctx);
    expect(decision.type).toBe('stop');
    if (decision.type === 'stop') {
      expect(decision.reason).toContain('Time budget');
    }
  });

  it('returns best output from history when time expires', () => {
    const history = [
      makeHistoryEntry({
        verification: makeVerification({ accepted: true, qualityScore: 0.7, confidence: 0.8 }),
        result: {
          stepId: 'step-1',
          output: 'partial',
          durationMs: 10,
          status: 'success',
        } as StepResult,
      }),
    ];
    const v = makeVerification();
    const ctx = makeContext({ elapsedMs: 295000, maxTimeMs: 300000 });
    const decision = ctrl.decide(v, history, ctx);
    expect(decision.type).toBe('stop');
    if (decision.type === 'stop') {
      expect(decision.output).toBe('partial');
    }
  });
});

// ============================================================================
// Repeated similar failures
// ============================================================================

describe('AdaptiveLattsController - repeated failures', () => {
  it('backtracks on repeated similar failures', () => {
    const ctrl = new AdaptiveLattsController();
    const failures = [
      makeFailedEntry(['issue-A', 'issue-B']),
      makeFailedEntry(['issue-A', 'issue-B']),
      makeFailedEntry(['issue-A', 'issue-B']),
    ];
    const v = makeVerification();
    const ctx = makeContext({ backtrackableSteps: ['step-0'] });
    const decision = ctrl.decide(v, failures, ctx);
    expect(decision.type).toBe('backtrack');
  });

  it('restarts on repeated failures when no backtrack targets', () => {
    const ctrl = new AdaptiveLattsController({ allowBacktrack: false });
    const failures = [
      makeFailedEntry(['issue-A']),
      makeFailedEntry(['issue-A']),
      makeFailedEntry(['issue-A']),
    ];
    const v = makeVerification();
    const decision = ctrl.decide(v, failures, makeContext());
    expect(decision.type).toBe('restart');
  });

  it('resamples on repeated failures when no backtrack and no restart', () => {
    const ctrl = new AdaptiveLattsController({ allowBacktrack: false, allowRestart: false });
    const failures = [
      makeFailedEntry(['issue-A']),
      makeFailedEntry(['issue-A']),
      makeFailedEntry(['issue-A']),
    ];
    const v = makeVerification();
    const decision = ctrl.decide(v, failures, makeContext());
    expect(decision.type).toBe('resample');
  });

  it('does not trigger on dissimilar failures', () => {
    const ctrl = new AdaptiveLattsController();
    const failures = [
      makeFailedEntry(['issue-A']),
      makeFailedEntry(['issue-X']),
      makeFailedEntry(['issue-Y']),
    ];
    const v = makeVerification();
    const decision = ctrl.decide(v, failures, makeContext());
    // Different issues → no similar pattern → default resample
    expect(decision.type).toBe('resample');
  });
});
