/**
 * Tests for Protocol Helpers
 * @module agents/collaboration/protocol-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../core/index.js';
import {
  extractApproval,
  extractFeedback,
  extractVote,
  createReviewTask,
  createVotingTask,
} from './protocol-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    description: 'Test task',
    context: {
      metadata: {},
    },
    ...overrides,
  };
}

// ============================================================================
// extractApproval
// ============================================================================

describe('extractApproval', () => {
  it('extracts from object with approved field', () => {
    expect(extractApproval({ approved: true })).toBe(true);
    expect(extractApproval({ approved: false })).toBe(false);
  });

  it('coerces truthy/falsy approved field', () => {
    expect(extractApproval({ approved: 1 })).toBe(true);
    expect(extractApproval({ approved: 0 })).toBe(false);
  });

  it('detects "approved" in string output', () => {
    expect(extractApproval('This is approved')).toBe(true);
  });

  it('detects "lgtm" in string output', () => {
    expect(extractApproval('LGTM, ship it')).toBe(true);
  });

  it('returns false for rejection string', () => {
    expect(extractApproval('This needs changes')).toBe(false);
  });

  it('defaults to true for non-string/non-object', () => {
    expect(extractApproval(42)).toBe(true);
    expect(extractApproval(null)).toBe(true);
  });
});

// ============================================================================
// extractFeedback
// ============================================================================

describe('extractFeedback', () => {
  it('extracts from object with feedback field', () => {
    expect(extractFeedback({ feedback: 'Looks good' })).toBe('Looks good');
  });

  it('returns string output directly', () => {
    expect(extractFeedback('Direct feedback')).toBe('Direct feedback');
  });

  it('JSON-stringifies other types', () => {
    const result = extractFeedback({ data: 123 });
    expect(result).toBe(JSON.stringify({ data: 123 }));
  });

  it('handles null', () => {
    const result = extractFeedback(null);
    expect(result).toBe('null');
  });
});

// ============================================================================
// extractVote
// ============================================================================

describe('extractVote', () => {
  it('extracts from object with decision and reasoning', () => {
    const vote = extractVote({ decision: 'approve', reasoning: 'Code is clean' });
    expect(vote.decision).toBe('approve');
    expect(vote.reasoning).toBe('Code is clean');
  });

  it('extracts from object with vote field', () => {
    const vote = extractVote({ vote: 'reject', reasoning: 'Has bugs' });
    expect(vote.decision).toBe('reject');
    expect(vote.reasoning).toBe('Has bugs');
  });

  it('defaults reasoning for vote field without it', () => {
    const vote = extractVote({ vote: 'approve' });
    expect(vote.decision).toBe('approve');
    expect(vote.reasoning).toBe('No reasoning provided');
  });

  it('parses approve from string', () => {
    const vote = extractVote('I approve this change');
    expect(vote.decision).toBe('approve');
  });

  it('parses reject from string', () => {
    const vote = extractVote('I reject this proposal');
    expect(vote.decision).toBe('reject');
  });

  it('parses "yes" as approve', () => {
    const vote = extractVote('Yes, this is good');
    expect(vote.decision).toBe('approve');
  });

  it('parses "no" as reject', () => {
    const vote = extractVote('No, this is not good');
    expect(vote.decision).toBe('reject');
  });

  it('defaults to abstain for ambiguous string', () => {
    const vote = extractVote('I am unsure about this');
    expect(vote.decision).toBe('abstain');
  });

  it('defaults to abstain for non-parseable input', () => {
    const vote = extractVote(42);
    expect(vote.decision).toBe('abstain');
    expect(vote.reasoning).toContain('Could not parse');
  });

  it('is case-insensitive for decision field', () => {
    const vote = extractVote({ decision: 'APPROVE', reasoning: 'ok' });
    expect(vote.decision).toBe('approve');
  });

  it('handles invalid decision value in object', () => {
    const vote = extractVote({ decision: 'maybe', reasoning: 'unsure' });
    // Falls through to abstain since 'maybe' is not valid
    expect(vote.decision).toBe('abstain');
  });
});

// ============================================================================
// createReviewTask
// ============================================================================

describe('createReviewTask', () => {
  it('creates review task with modified id', () => {
    const task = makeTask();
    const review = createReviewTask(task, 'output', 'producer-1');
    expect(review.id).toBe('task-1-review');
  });

  it('includes production output in description', () => {
    const review = createReviewTask(makeTask(), { result: 'data' }, 'p1');
    expect(review.description).toContain('Review');
    expect(review.description).toContain('result');
  });

  it('preserves original context metadata', () => {
    const task = makeTask({
      context: { metadata: { priority: 'high' } },
    });
    const review = createReviewTask(task, 'output', 'p1');
    expect(review.context.metadata.priority).toBe('high');
  });

  it('adds reviewContext to metadata', () => {
    const review = createReviewTask(makeTask(), 'output', 'producer-1');
    const meta = review.context.metadata as Record<string, unknown>;
    const reviewCtx = meta.reviewContext as Record<string, unknown>;
    expect(reviewCtx.originalTaskId).toBe('task-1');
    expect(reviewCtx.producerId).toBe('producer-1');
    expect(reviewCtx.productionOutput).toBe('output');
  });
});

// ============================================================================
// createVotingTask
// ============================================================================

describe('createVotingTask', () => {
  it('preserves original task fields', () => {
    const task = makeTask({ id: 'vote-task' });
    const voting = createVotingTask(task);
    expect(voting.id).toBe('vote-task');
  });

  it('appends voting instructions to description', () => {
    const voting = createVotingTask(makeTask());
    expect(voting.description).toContain('Test task');
    expect(voting.description).toContain('approve/reject/abstain');
  });

  it('preserves context', () => {
    const task = makeTask({
      context: { metadata: { key: 'value' } },
    });
    const voting = createVotingTask(task);
    expect(voting.context.metadata.key).toBe('value');
  });
});
