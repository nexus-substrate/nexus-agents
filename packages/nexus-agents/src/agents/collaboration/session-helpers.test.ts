/**
 * Tests for Session Helpers
 * @module agents/collaboration/session-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { TaskResult } from '../../core/index.js';
import type {
  AggregatedResult,
  CollaborationConfig,
  ExpertParticipation,
  VoteMessage,
  ReviewResponseMessage,
} from './collaboration-types.js';
import {
  getSequentialAssignments,
  getParallelAssignments,
  getReviewAssignments,
  getConsensusAssignments,
  isSessionSuccessful,
  aggregateOutputs,
  getAggregationStrategy,
  calculateQualityScore,
  buildExpertResults,
  shouldFinalize,
  buildAggregatedResult,
} from './session-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeConfig(overrides: Partial<CollaborationConfig> = {}): CollaborationConfig {
  return {
    sessionId: 'session-1',
    pattern: 'parallel',
    task: 'test task',
    experts: ['e1', 'e2'],
    timeout: 60000,
    ...overrides,
  } as CollaborationConfig;
}

function makeParticipant(overrides: Partial<ExpertParticipation> = {}): ExpertParticipation {
  return {
    expertId: 'e1',
    role: 'code_expert',
    joinedAt: '2026-01-01T00:00:00.000Z',
    status: 'pending',
    retryCount: 0,
    ...overrides,
  };
}

function makeTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-1',
    output: 'result output',
    status: 'success',
    metadata: { durationMs: 100, tokensUsed: 50 },
    ...overrides,
  } as TaskResult;
}

// ============================================================================
// getParallelAssignments
// ============================================================================

describe('getParallelAssignments', () => {
  it('assigns all pending participants', () => {
    const config = makeConfig();
    const participants = [makeParticipant({ expertId: 'e1' }), makeParticipant({ expertId: 'e2' })];
    const result = getParallelAssignments(config, participants);
    expect(result).toHaveLength(2);
    expect(result[0]!.expertId).toBe('e1');
    expect(result[1]!.expertId).toBe('e2');
  });

  it('skips non-pending participants', () => {
    const config = makeConfig();
    const participants = [
      makeParticipant({ expertId: 'e1', status: 'submitted' }),
      makeParticipant({ expertId: 'e2', status: 'pending' }),
    ];
    const result = getParallelAssignments(config, participants);
    expect(result).toHaveLength(1);
    expect(result[0]!.expertId).toBe('e2');
  });

  it('returns empty when all submitted', () => {
    const config = makeConfig();
    const participants = [makeParticipant({ status: 'submitted' })];
    expect(getParallelAssignments(config, participants)).toEqual([]);
  });
});

// ============================================================================
// getConsensusAssignments
// ============================================================================

describe('getConsensusAssignments', () => {
  it('assigns all pending (same as parallel)', () => {
    const config = makeConfig({ pattern: 'consensus' });
    const participants = [makeParticipant({ expertId: 'e1' }), makeParticipant({ expertId: 'e2' })];
    const result = getConsensusAssignments(config, participants);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// getReviewAssignments
// ============================================================================

describe('getReviewAssignments', () => {
  it('assigns first pending when no results', () => {
    const config = makeConfig({ pattern: 'review' });
    const participants = [makeParticipant({ expertId: 'e1' })];
    const results = new Map<string, TaskResult>();
    const result = getReviewAssignments(config, participants, results);
    expect(result).toHaveLength(1);
    expect(result[0]!.expertId).toBe('e1');
  });

  it('returns empty when no pending', () => {
    const config = makeConfig({ pattern: 'review' });
    const participants = [makeParticipant({ status: 'submitted' })];
    const results = new Map<string, TaskResult>();
    expect(getReviewAssignments(config, participants, results)).toEqual([]);
  });
});

// ============================================================================
// getSequentialAssignments
// ============================================================================

describe('getSequentialAssignments', () => {
  it('assigns first pending participant', () => {
    const config = makeConfig({ pattern: 'sequential' });
    const participants = [makeParticipant({ expertId: 'e1' })];
    const results = new Map<string, TaskResult>();
    const result = getSequentialAssignments(config, participants, results);
    expect(result).toHaveLength(1);
    expect(result[0]!.expertId).toBe('e1');
  });

  it('includes previous results for later assignments', () => {
    const config = makeConfig({ pattern: 'sequential' });
    const participants = [
      makeParticipant({ expertId: 'e1', status: 'submitted' }),
      makeParticipant({ expertId: 'e2', status: 'pending' }),
    ];
    const results = new Map<string, TaskResult>();
    results.set('e1', makeTaskResult());
    const result = getSequentialAssignments(config, participants, results);
    expect(result).toHaveLength(1);
    expect(result[0]!.expertId).toBe('e2');
    expect(result[0]!.previousResults).toHaveLength(1);
  });
});

// ============================================================================
// isSessionSuccessful
// ============================================================================

describe('isSessionSuccessful', () => {
  it('succeeds for parallel with results', () => {
    const results = new Map<string, TaskResult>();
    results.set('e1', makeTaskResult());
    expect(
      isSessionSuccessful({
        pattern: 'parallel',
        participants: [makeParticipant()],
        results,
        votes: [],
        reviews: [],
        requireUnanimous: false,
      })
    ).toBe(true);
  });

  it('fails for parallel with no results', () => {
    expect(
      isSessionSuccessful({
        pattern: 'parallel',
        participants: [makeParticipant()],
        results: new Map(),
        votes: [],
        reviews: [],
        requireUnanimous: false,
      })
    ).toBe(false);
  });

  it('succeeds for review with approved review', () => {
    expect(
      isSessionSuccessful({
        pattern: 'review',
        participants: [makeParticipant()],
        results: new Map(),
        votes: [],
        reviews: [{ approved: true } as ReviewResponseMessage],
        requireUnanimous: false,
      })
    ).toBe(true);
  });

  it('succeeds for consensus with majority approval', () => {
    expect(
      isSessionSuccessful({
        pattern: 'consensus',
        participants: [makeParticipant({ expertId: 'e1' }), makeParticipant({ expertId: 'e2' })],
        results: new Map(),
        votes: [{ decision: 'approve' } as VoteMessage, { decision: 'approve' } as VoteMessage],
        reviews: [],
        requireUnanimous: false,
      })
    ).toBe(true);
  });

  it('fails for consensus requiring unanimous with reject', () => {
    expect(
      isSessionSuccessful({
        pattern: 'consensus',
        participants: [makeParticipant({ expertId: 'e1' }), makeParticipant({ expertId: 'e2' })],
        results: new Map(),
        votes: [{ decision: 'approve' } as VoteMessage, { decision: 'reject' } as VoteMessage],
        reviews: [],
        requireUnanimous: true,
      })
    ).toBe(false);
  });
});

// ============================================================================
// aggregateOutputs
// ============================================================================

describe('aggregateOutputs', () => {
  it('returns null for empty', () => {
    expect(aggregateOutputs([])).toBeNull();
  });

  it('returns single result output', () => {
    expect(aggregateOutputs([makeTaskResult({ output: 'hello' })])).toBe('hello');
  });

  it('returns array for multiple results', () => {
    const results = [
      makeTaskResult({ taskId: 't1', output: 'a' }),
      makeTaskResult({ taskId: 't2', output: 'b' }),
    ];
    const output = aggregateOutputs(results) as Array<{ taskId: string; output: string }>;
    expect(output).toHaveLength(2);
    expect(output[0]!.taskId).toBe('t1');
  });
});

// ============================================================================
// getAggregationStrategy
// ============================================================================

describe('getAggregationStrategy', () => {
  it('maps sequential to sequential_chain', () => {
    expect(getAggregationStrategy('sequential')).toBe('sequential_chain');
  });

  it('maps parallel to merge', () => {
    expect(getAggregationStrategy('parallel')).toBe('merge');
  });

  it('maps review to select_best', () => {
    expect(getAggregationStrategy('review')).toBe('select_best');
  });

  it('maps consensus to consensus', () => {
    expect(getAggregationStrategy('consensus')).toBe('consensus');
  });
});

// ============================================================================
// calculateQualityScore
// ============================================================================

describe('calculateQualityScore', () => {
  it('returns 0 for no participants', () => {
    expect(calculateQualityScore('parallel', [], [], [])).toBe(0);
  });

  it('returns 1 when all submitted', () => {
    const participants = [
      makeParticipant({ status: 'submitted' }),
      makeParticipant({ expertId: 'e2', status: 'submitted' }),
    ];
    expect(calculateQualityScore('parallel', participants, [], [])).toBe(1);
  });

  it('factors in vote approval for consensus', () => {
    const participants = [makeParticipant({ status: 'submitted' })];
    const votes = [{ decision: 'approve' } as VoteMessage];
    const score = calculateQualityScore('consensus', participants, votes, []);
    // (1 + 1) / 2 = 1
    expect(score).toBe(1);
  });

  it('factors in review approval for review', () => {
    const participants = [makeParticipant({ status: 'submitted' })];
    const reviews = [{ approved: true } as ReviewResponseMessage];
    const score = calculateQualityScore('review', participants, [], reviews);
    // (1 + 1) / 2 = 1
    expect(score).toBe(1);
  });
});

// ============================================================================
// buildExpertResults
// ============================================================================

describe('buildExpertResults', () => {
  it('builds results for participants', () => {
    const participants = [makeParticipant({ expertId: 'e1', status: 'submitted' })];
    const results = new Map<string, TaskResult>();
    results.set('e1', makeTaskResult());
    const summaries = buildExpertResults(participants, results);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.expertId).toBe('e1');
    expect(summaries[0]!.success).toBe(true);
    expect(summaries[0]!.contributionScore).toBe(1.0);
  });

  it('marks failed participants', () => {
    const participants = [makeParticipant({ expertId: 'e1', status: 'failed' })];
    const results = new Map<string, TaskResult>();
    const summaries = buildExpertResults(participants, results);
    expect(summaries[0]!.success).toBe(false);
    expect(summaries[0]!.contributionScore).toBe(0);
  });
});

// ============================================================================
// shouldFinalize
// ============================================================================

describe('shouldFinalize', () => {
  it('finalizes parallel when all results in', () => {
    const participants = [makeParticipant({ expertId: 'e1' })];
    const results = new Map<string, TaskResult>();
    results.set('e1', makeTaskResult());
    expect(shouldFinalize('parallel', participants, results, [], [])).toBe(true);
  });

  it('does not finalize parallel with missing results', () => {
    const participants = [makeParticipant({ expertId: 'e1' }), makeParticipant({ expertId: 'e2' })];
    const results = new Map<string, TaskResult>();
    results.set('e1', makeTaskResult());
    expect(shouldFinalize('parallel', participants, results, [], [])).toBe(false);
  });

  it('finalizes review when reviews and results exist', () => {
    const participants = [makeParticipant()];
    const results = new Map<string, TaskResult>();
    results.set('e1', makeTaskResult());
    const reviews = [{ approved: true } as ReviewResponseMessage];
    expect(shouldFinalize('review', participants, results, [], reviews)).toBe(true);
  });

  it('finalizes consensus when all voted', () => {
    const participants = [makeParticipant({ expertId: 'e1' })];
    const votes = [{ decision: 'approve' } as VoteMessage];
    expect(shouldFinalize('consensus', participants, new Map(), votes, [])).toBe(true);
  });

  // `results.size === participants.length` and `votes.length === participants.length`
  // are both `0 === 0` for a session with no participants, so an empty session
  // finalized as though its work were complete. The `review` branch already
  // guarded with `> 0`; the other two did not (#4585).
  it('does not finalize an empty parallel session (#4585)', () => {
    expect(shouldFinalize('parallel', [], new Map(), [], [])).toBe(false);
  });

  it('does not finalize an empty sequential session (#4585)', () => {
    expect(shouldFinalize('sequential', [], new Map(), [], [])).toBe(false);
  });

  it('does not finalize an empty consensus session (#4585)', () => {
    expect(shouldFinalize('consensus', [], new Map(), [], [])).toBe(false);
  });
});

// ============================================================================
// buildAggregatedResult confidence disclosure (#4831)
// ============================================================================

describe('buildAggregatedResult does not report an unmeasured confidence (#4831)', () => {
  function build(results: TaskResult[]): AggregatedResult {
    return buildAggregatedResult({
      pattern: 'parallel',
      results,
      participants: [makeParticipant({ status: 'submitted' })],
      votes: [],
      reviews: [],
      endTime: new Date('2026-01-01T00:01:00.000Z'),
    });
  }

  it('marks averageConfidence as unmeasured', () => {
    // Nothing reaching this builder carries a confidence signal: TaskResult,
    // ResultMetadata, VoteMessage and ExpertParticipation all lack the field.
    // The sibling aggregator computes it from ExpertResult.confidence, which
    // this path does not have. Same shape as `unmeasuredResults` (#4743).
    const result = build([makeTaskResult()]);

    expect(result.metadata.confidenceMeasured).toBe(false);
  });

  it('does not report a perfect confidence as the placeholder', () => {
    // It reported 1.0 — the best possible score — for a session whose
    // confidence was never measured. A consumer thresholding on it passed
    // unconditionally; the placeholder has to fail in the safe direction.
    expect(build([makeTaskResult()]).metadata.averageConfidence).toBe(0);
  });

  it('keeps conflictCount consistent with the conflicts it reports', () => {
    // Derived rather than restated, so the two cannot drift. This path still
    // performs no conflict detection — see #4854.
    const result = build([makeTaskResult(), makeTaskResult({ taskId: 'task-2' })]);

    expect(result.metadata.conflictCount).toBe(result.conflicts.length);
  });

  it('says the empty conflict list is unchecked, not clean (#4854)', () => {
    // `conflicts: []` and `conflictCount: 0` are what a session with genuine
    // agreement looks like, so this builder — which compares nothing — was
    // indistinguishable from one that compared everything and found nothing.
    // Two differing results must not read as consensus.
    const result = build([
      makeTaskResult({ output: 'ship it' }),
      makeTaskResult({ taskId: 'task-2', output: 'do not ship it' }),
    ]);

    expect(result.conflicts).toEqual([]);
    expect(result.metadata.conflictsDetected).toBe(false);
  });
});
