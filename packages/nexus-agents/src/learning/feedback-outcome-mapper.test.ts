/**
 * Tests for the feedback→routing TaskOutcome mapper (#3146, epic #3143 P1).
 */

import { describe, it, expect } from 'vitest';
import {
  feedbackToRoutingOutcome,
  failureCategoryFromOutcomeClass,
  type RoutingOutcomeContext,
} from './feedback-outcome-mapper.js';
import type { TaskOutcome as FeedbackTaskOutcome } from './outcome-feedback-types.js';
import { TaskOutcomeSchema } from '../orchestration/outcomes/outcome-types.js';

function feedback(overrides: Partial<FeedbackTaskOutcome> = {}): FeedbackTaskOutcome {
  return {
    routingDecisionId: '11111111-1111-1111-1111-111111111111',
    timestamp: '2026-06-01T10:00:00Z',
    outcomeClass: 'success',
    success: true,
    qualityScore: 0.9,
    durationMs: 1200,
    tokenUsage: 800,
    qualitySignals: { completionRatio: 1, retryCount: 0, coherenceScore: 0.9 },
    traceId: 'trace-xyz',
    ...overrides,
  };
}

const ctx: RoutingOutcomeContext = {
  cli: 'claude',
  category: 'code_generation',
  model: 'claude-sonnet-4-6',
};

describe('feedbackToRoutingOutcome (#3146)', () => {
  it('produces a schema-valid routing TaskOutcome from a successful feedback outcome', () => {
    const out = feedbackToRoutingOutcome(feedback(), ctx);
    const parsed = TaskOutcomeSchema.safeParse(out);
    expect(parsed.success).toBe(true);
    expect(out).toMatchObject({
      id: '11111111-1111-1111-1111-111111111111',
      cli: 'claude',
      category: 'code_generation',
      model: 'claude-sonnet-4-6',
      success: true,
      source: 'delegate',
    });
    expect(out.failureCategory).toBeUndefined(); // no failureCategory on success
  });

  it('carries the feedback traceId into the routing outcome (cross-layer correlation)', () => {
    expect(feedbackToRoutingOutcome(feedback({ traceId: 'corr-42' }), ctx).traceId).toBe('corr-42');
  });

  it('maps outcomeClass → failureCategory for failures', () => {
    expect(failureCategoryFromOutcomeClass('timeout')).toBe('timeout');
    expect(failureCategoryFromOutcomeClass('error')).toBe('execution');
    expect(failureCategoryFromOutcomeClass('failure')).toBe('generic');
    expect(failureCategoryFromOutcomeClass('success')).toBeUndefined();
    expect(failureCategoryFromOutcomeClass('partial')).toBeUndefined();
  });

  it('sets failureCategory on a failed outcome and stays schema-valid', () => {
    const out = feedbackToRoutingOutcome(
      feedback({ success: false, outcomeClass: 'timeout', errorMessage: 'timed out' }),
      ctx
    );
    expect(out.failureCategory).toBe('timeout');
    expect(out.errorMessage).toBe('timed out');
    expect(TaskOutcomeSchema.safeParse(out).success).toBe(true);
  });

  it('clips an over-long errorMessage to the routing schema max (500)', () => {
    const out = feedbackToRoutingOutcome(
      feedback({ success: false, outcomeClass: 'error', errorMessage: 'x'.repeat(900) }),
      ctx
    );
    expect(out.errorMessage?.length).toBe(500);
    expect(TaskOutcomeSchema.safeParse(out).success).toBe(true);
  });

  it('honours an explicit source', () => {
    expect(feedbackToRoutingOutcome(feedback(), { ...ctx, source: 'consensus' }).source).toBe(
      'consensus'
    );
  });
});
