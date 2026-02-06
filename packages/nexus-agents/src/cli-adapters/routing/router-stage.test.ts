/**
 * Tests for router-stage helpers
 *
 * Covers createRoutingContext, addTrace, filterCandidate, updateScore,
 * getRemainingCandidates, selectBestCandidate, createStageError, and Zod schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  createRoutingContext,
  addTrace,
  filterCandidate,
  updateScore,
  getRemainingCandidates,
  selectBestCandidate,
  createStageError,
  CliNameSchema,
  StageConfigSchema,
  RoutingOutcomeSchema,
} from './router-stage.js';

// ============================================================================
// createRoutingContext
// ============================================================================

describe('createRoutingContext', () => {
  it('creates context with defaults', () => {
    const ctx = createRoutingContext('test task');
    expect(ctx.task).toBe('test task');
    expect(ctx.availableClis).toEqual(['claude', 'gemini', 'codex']);
    expect(ctx.scores.size).toBe(3);
    expect(ctx.filtered.size).toBe(0);
    expect(ctx.signals).toEqual([]);
    expect(ctx.trace).toEqual([]);
  });

  it('creates context with custom CLIs', () => {
    const ctx = createRoutingContext('task', ['claude', 'gemini']);
    expect(ctx.availableClis).toEqual(['claude', 'gemini']);
    expect(ctx.scores.size).toBe(2);
  });

  it('initializes all scores to 0', () => {
    const ctx = createRoutingContext('task');
    for (const [, score] of ctx.scores) {
      expect(score).toBe(0);
    }
  });

  it('passes metadata through', () => {
    const meta = { key: 'value' };
    const ctx = createRoutingContext('task', undefined, meta);
    expect(ctx.metadata).toEqual({ key: 'value' });
  });

  it('metadata is undefined when not provided', () => {
    const ctx = createRoutingContext('task');
    expect(ctx.metadata).toBeUndefined();
  });
});

// ============================================================================
// addTrace
// ============================================================================

describe('addTrace', () => {
  it('appends trace entry to context', () => {
    const ctx = createRoutingContext('task');
    const updated = addTrace(ctx, 'test-stage', 10, 'score', 'details');
    expect(updated.trace.length).toBe(1);
    expect(updated.trace[0]?.stageName).toBe('test-stage');
    expect(updated.trace[0]?.durationMs).toBe(10);
    expect(updated.trace[0]?.action).toBe('score');
    expect(updated.trace[0]?.details).toBe('details');
  });

  it('preserves existing trace entries', () => {
    const ctx = createRoutingContext('task');
    const step1 = addTrace(ctx, 'stage-1', 5, 'filter');
    const step2 = addTrace(step1, 'stage-2', 10, 'score');
    expect(step2.trace.length).toBe(2);
    expect(step2.trace[0]?.stageName).toBe('stage-1');
    expect(step2.trace[1]?.stageName).toBe('stage-2');
  });

  it('does not mutate original context', () => {
    const ctx = createRoutingContext('task');
    addTrace(ctx, 'stage', 5, 'skip');
    expect(ctx.trace.length).toBe(0);
  });
});

// ============================================================================
// filterCandidate
// ============================================================================

describe('filterCandidate', () => {
  it('adds CLI to filtered map', () => {
    const ctx = createRoutingContext('task');
    const updated = filterCandidate(ctx, 'claude', 'too expensive');
    expect(updated.filtered.has('claude')).toBe(true);
    expect(updated.filtered.get('claude')).toBe('too expensive');
  });

  it('does not mutate original context', () => {
    const ctx = createRoutingContext('task');
    filterCandidate(ctx, 'claude', 'reason');
    expect(ctx.filtered.size).toBe(0);
  });

  it('preserves existing filtered entries', () => {
    const ctx = createRoutingContext('task');
    const step1 = filterCandidate(ctx, 'claude', 'reason 1');
    const step2 = filterCandidate(step1, 'gemini', 'reason 2');
    expect(step2.filtered.size).toBe(2);
  });
});

// ============================================================================
// updateScore
// ============================================================================

describe('updateScore', () => {
  it('adds score delta to existing score', () => {
    const ctx = createRoutingContext('task');
    const updated = updateScore(ctx, 'claude', 5);
    expect(updated.scores.get('claude')).toBe(5);
  });

  it('accumulates scores across multiple updates', () => {
    const ctx = createRoutingContext('task');
    const step1 = updateScore(ctx, 'claude', 3);
    const step2 = updateScore(step1, 'claude', 7);
    expect(step2.scores.get('claude')).toBe(10);
  });

  it('does not mutate original context', () => {
    const ctx = createRoutingContext('task');
    updateScore(ctx, 'claude', 5);
    expect(ctx.scores.get('claude')).toBe(0);
  });

  it('handles negative deltas', () => {
    const ctx = createRoutingContext('task');
    const step1 = updateScore(ctx, 'claude', 10);
    const step2 = updateScore(step1, 'claude', -3);
    expect(step2.scores.get('claude')).toBe(7);
  });
});

// ============================================================================
// getRemainingCandidates
// ============================================================================

describe('getRemainingCandidates', () => {
  it('returns all CLIs when none filtered', () => {
    const ctx = createRoutingContext('task');
    expect(getRemainingCandidates(ctx)).toEqual(['claude', 'gemini', 'codex']);
  });

  it('excludes filtered CLIs', () => {
    const ctx = createRoutingContext('task');
    const filtered = filterCandidate(ctx, 'claude', 'reason');
    const remaining = getRemainingCandidates(filtered);
    expect(remaining).toEqual(['gemini', 'codex']);
  });

  it('returns empty when all filtered', () => {
    let ctx = createRoutingContext('task');
    ctx = filterCandidate(ctx, 'claude', 'r');
    ctx = filterCandidate(ctx, 'gemini', 'r');
    ctx = filterCandidate(ctx, 'codex', 'r');
    expect(getRemainingCandidates(ctx)).toEqual([]);
  });
});

// ============================================================================
// selectBestCandidate
// ============================================================================

describe('selectBestCandidate', () => {
  it('returns undefined when all filtered', () => {
    let ctx = createRoutingContext('task');
    ctx = filterCandidate(ctx, 'claude', 'r');
    ctx = filterCandidate(ctx, 'gemini', 'r');
    ctx = filterCandidate(ctx, 'codex', 'r');
    expect(selectBestCandidate(ctx)).toBeUndefined();
  });

  it('returns highest scoring candidate', () => {
    let ctx = createRoutingContext('task');
    ctx = updateScore(ctx, 'claude', 5);
    ctx = updateScore(ctx, 'gemini', 10);
    ctx = updateScore(ctx, 'codex', 3);
    const best = selectBestCandidate(ctx);
    expect(best?.cli).toBe('gemini');
    expect(best?.score).toBe(10);
  });

  it('returns first candidate on tie', () => {
    const ctx = createRoutingContext('task');
    // All scores are 0, so first candidate wins
    const best = selectBestCandidate(ctx);
    expect(best?.cli).toBe('claude');
    expect(best?.score).toBe(0);
  });

  it('ignores filtered candidates even with higher scores', () => {
    let ctx = createRoutingContext('task');
    ctx = updateScore(ctx, 'claude', 100);
    ctx = filterCandidate(ctx, 'claude', 'filtered');
    ctx = updateScore(ctx, 'gemini', 5);
    const best = selectBestCandidate(ctx);
    expect(best?.cli).toBe('gemini');
    expect(best?.score).toBe(5);
  });
});

// ============================================================================
// createStageError
// ============================================================================

describe('createStageError', () => {
  it('creates error with all fields', () => {
    const cause = new Error('root cause');
    const error = createStageError('test-stage', 'stage_failed', 'something broke', cause);
    expect(error.stage).toBe('test-stage');
    expect(error.code).toBe('stage_failed');
    expect(error.message).toBe('something broke');
    expect(error.cause).toBe(cause);
  });

  it('creates error without cause', () => {
    const error = createStageError('stage', 'no_candidates', 'none left');
    expect(error.cause).toBeUndefined();
  });
});

// ============================================================================
// Zod Schemas
// ============================================================================

describe('CliNameSchema', () => {
  it('accepts valid CLI names', () => {
    expect(CliNameSchema.parse('claude')).toBe('claude');
    expect(CliNameSchema.parse('gemini')).toBe('gemini');
    expect(CliNameSchema.parse('codex')).toBe('codex');
  });

  it('rejects invalid CLI names', () => {
    expect(() => CliNameSchema.parse('invalid')).toThrow();
  });
});

describe('StageConfigSchema', () => {
  it('applies defaults', () => {
    const config = StageConfigSchema.parse({});
    expect(config.enabled).toBe(true);
    expect(config.priority).toBe(50);
  });

  it('validates priority range', () => {
    expect(() => StageConfigSchema.parse({ priority: 200 })).toThrow();
    expect(() => StageConfigSchema.parse({ priority: -1 })).toThrow();
  });
});

describe('RoutingOutcomeSchema', () => {
  it('validates valid outcome', () => {
    const outcome = RoutingOutcomeSchema.parse({
      selectedCli: 'claude',
      task: 'test',
      success: true,
    });
    expect(outcome.selectedCli).toBe('claude');
  });

  it('validates optional fields', () => {
    const outcome = RoutingOutcomeSchema.parse({
      selectedCli: 'gemini',
      task: 'test',
      success: false,
      qualityScore: 0.8,
      latencyMs: 500,
      tokensUsed: 1000,
    });
    expect(outcome.qualityScore).toBe(0.8);
  });

  it('rejects invalid quality score', () => {
    expect(() =>
      RoutingOutcomeSchema.parse({
        selectedCli: 'claude',
        task: 'test',
        success: true,
        qualityScore: 2.0,
      })
    ).toThrow();
  });
});
