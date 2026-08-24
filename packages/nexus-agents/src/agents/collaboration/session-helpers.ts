/**
 * nexus-agents/agents - Session Helpers
 *
 * Helper functions for collaboration session operations.
 * Extracted to keep the main session class under 400 lines.
 */

import type { Result, TaskResult, AgentRole } from '../../core/index.js';
import { summarizeTokenUsage } from './token-usage-summary.js';
import { ok, err, AgentError, getTimeProvider, formatZodError } from '../../core/index.js';
import type {
  CollaborationConfig,
  CollaborationPattern,
  ExpertParticipation,
  SessionState,
  TaskAssignmentMessage,
  VoteMessage,
  ReviewResponseMessage,
  ExpertResultSummary,
  ResultConflict,
  AggregatedResult,
} from './collaboration-types.js';
import { CollaborationConfigSchema, MIN_EXPERTS_FOR_PATTERN } from './collaboration-types.js';

/**
 * Gets task assignments for sequential pattern.
 */
export function getSequentialAssignments(
  config: CollaborationConfig,
  participants: ExpertParticipation[],
  results: Map<string, TaskResult>
): TaskAssignmentMessage[] {
  const assignments: TaskAssignmentMessage[] = [];
  const previousResults: TaskResult[] = [];

  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i];
    if (participant?.status !== 'pending') {
      const result = results.get(participant?.expertId ?? '');
      if (result !== undefined) {
        previousResults.push(result);
      }
      continue;
    }

    // Only assign if all previous experts have completed
    if (i > 0 && results.size < i) {
      break;
    }

    assignments.push({
      type: 'task_assignment',
      expertId: participant.expertId,
      task: config.task,
      sequencePosition: i,
      previousResults: [...previousResults],
    });
    break; // Only one assignment at a time for sequential
  }

  return assignments;
}

/**
 * Gets task assignments for parallel pattern.
 */
export function getParallelAssignments(
  config: CollaborationConfig,
  participants: ExpertParticipation[]
): TaskAssignmentMessage[] {
  return participants
    .filter((p) => p.status === 'pending')
    .map((p) => ({
      type: 'task_assignment' as const,
      expertId: p.expertId,
      task: config.task,
    }));
}

/**
 * Gets task assignments for review pattern.
 */
export function getReviewAssignments(
  config: CollaborationConfig,
  participants: ExpertParticipation[],
  results: Map<string, TaskResult>
): TaskAssignmentMessage[] {
  const pending = participants.filter((p) => p.status === 'pending');
  if (pending.length === 0) {
    return [];
  }

  // If no results yet, assign to first pending expert
  if (results.size === 0 && pending.length > 0) {
    const first = pending[0];
    if (first !== undefined) {
      return [
        {
          type: 'task_assignment',
          expertId: first.expertId,
          task: config.task,
        },
      ];
    }
  }

  return [];
}

/**
 * Gets task assignments for consensus pattern.
 */
export function getConsensusAssignments(
  config: CollaborationConfig,
  participants: ExpertParticipation[]
): TaskAssignmentMessage[] {
  return participants
    .filter((p) => p.status === 'pending')
    .map((p) => ({
      type: 'task_assignment' as const,
      expertId: p.expertId,
      task: config.task,
    }));
}

/**
 * Session success evaluation input.
 */
export interface SessionSuccessInput {
  pattern: CollaborationPattern;
  participants: ExpertParticipation[];
  results: Map<string, TaskResult>;
  votes: VoteMessage[];
  reviews: ReviewResponseMessage[];
  requireUnanimous: boolean;
  minVotes?: number | undefined;
}

/**
 * Determines if session succeeded based on pattern and results.
 */
export function isSessionSuccessful(input: SessionSuccessInput): boolean {
  const { pattern, participants, results, votes, reviews, requireUnanimous, minVotes } = input;

  switch (pattern) {
    case 'sequential':
    case 'parallel':
      return results.size > 0;
    case 'review':
      return reviews.some((r) => r.approved);
    case 'consensus': {
      const approveCount = votes.filter((v) => v.decision === 'approve').length;
      const threshold = minVotes ?? Math.ceil(participants.length / 2);
      if (requireUnanimous) {
        return approveCount === participants.length;
      }
      return approveCount >= threshold;
    }
    default:
      return false;
  }
}

/**
 * Aggregates outputs from multiple results.
 */
export function aggregateOutputs(results: TaskResult[]): unknown {
  if (results.length === 0) {
    return null;
  }

  if (results.length === 1) {
    return results[0]?.output;
  }

  return results.map((r) => ({
    taskId: r.taskId,
    output: r.output,
  }));
}

/**
 * Determines aggregation strategy from pattern.
 */
export function getAggregationStrategy(
  pattern: CollaborationPattern
): 'merge' | 'select_best' | 'consensus' | 'sequential_chain' {
  switch (pattern) {
    case 'sequential':
      return 'sequential_chain';
    case 'consensus':
      return 'consensus';
    case 'review':
      return 'select_best';
    case 'parallel':
    default:
      return 'merge';
  }
}

/**
 * Calculates quality score for session.
 */
export function calculateQualityScore(
  pattern: CollaborationPattern,
  participants: ExpertParticipation[],
  votes: VoteMessage[],
  reviews: ReviewResponseMessage[]
): number {
  const submittedCount = participants.filter((p) => p.status === 'submitted').length;
  const totalCount = participants.length;

  if (totalCount === 0) {
    return 0;
  }

  let score = submittedCount / totalCount;

  if (pattern === 'consensus' && votes.length > 0) {
    const approveRatio = votes.filter((v) => v.decision === 'approve').length / votes.length;
    score = (score + approveRatio) / 2;
  }

  if (pattern === 'review' && reviews.length > 0) {
    const approvedCount = reviews.filter((r) => r.approved).length;
    const reviewScore = approvedCount / reviews.length;
    score = (score + reviewScore) / 2;
  }

  return Math.round(score * 100) / 100;
}

/**
 * Builds expert result summaries.
 */
export function buildExpertResults(
  participants: ExpertParticipation[],
  results: Map<string, TaskResult>
): ExpertResultSummary[] {
  return participants.map((p) => {
    const result = results.get(p.expertId);
    const base = {
      expertId: p.expertId,
      role: p.role,
      contributionScore: result !== undefined ? 1.0 : 0.0,
      executionTimeMs: result?.metadata.durationMs ?? 0,
      success: p.status === 'submitted' || p.status === 'voted',
    };

    if (result !== undefined) {
      if (p.status === 'failed') {
        return { ...base, result, error: 'Expert failed to complete task' };
      }
      return { ...base, result };
    }

    if (p.status === 'failed') {
      return { ...base, error: 'Expert failed to complete task' };
    }

    return base;
  });
}

/**
 * Aggregated result builder input.
 */
export interface AggregatedResultInput {
  pattern: CollaborationPattern;
  results: TaskResult[];
  participants: ExpertParticipation[];
  votes: VoteMessage[];
  reviews: ReviewResponseMessage[];
  endTime: Date;
}

/**
 * Builds aggregated result for collaboration.
 */
export function buildAggregatedResult(input: AggregatedResultInput): AggregatedResult {
  const { pattern, results, participants, votes, reviews, endTime } = input;

  return {
    output: aggregateOutputs(results),
    strategy: getAggregationStrategy(pattern),
    qualityScore: calculateQualityScore(pattern, participants, votes, reviews),
    conflicts: [] as ResultConflict[],
    metadata: {
      resultCount: results.length,
      conflictCount: 0,
      averageConfidence: 1.0,
      // #4743: shared with result-aggregator so the two cannot drift — they
      // were duplicate expressions computing the same thing.
      ...summarizeTokenUsage(results.map((r) => r.metadata)),
      aggregatedAt: endTime.toISOString(),
    },
  };
}

/**
 * Validates collaboration config.
 */
export function validateConfig(config: CollaborationConfig): Result<void, AgentError> {
  const validation = CollaborationConfigSchema.safeParse(config);
  if (!validation.success) {
    return err(
      new AgentError(`Invalid collaboration config: ${formatZodError(validation.error)}`, {
        context: { sessionId: config.sessionId, validationErrors: validation.error.issues },
      })
    );
  }

  const minExperts = MIN_EXPERTS_FOR_PATTERN[config.pattern];
  if (config.experts.length < minExperts) {
    return err(
      new AgentError(
        `Pattern '${config.pattern}' requires at least ${String(minExperts)} experts`,
        { context: { pattern: config.pattern, expertCount: config.experts.length } }
      )
    );
  }

  return ok(undefined);
}

/**
 * Creates initial session state.
 */
export function createSessionState(
  config: CollaborationConfig,
  roleResolver: (expertId: string) => AgentRole
): SessionState {
  const now = getTimeProvider().nowIso();
  const participants: ExpertParticipation[] = config.experts.map((expertId) => ({
    expertId,
    role: roleResolver(expertId),
    joinedAt: now,
    status: 'pending' as const,
    retryCount: 0,
  }));

  return {
    config,
    status: 'pending',
    participants,
    results: new Map(),
    reviews: [],
    votes: [],
    startedAt: now,
    messageLog: [],
  };
}

/**
 * Checks if session should transition to finalizing.
 */
export function shouldFinalize(
  pattern: CollaborationPattern,
  participants: ExpertParticipation[],
  results: Map<string, TaskResult>,
  votes: VoteMessage[],
  reviews: ReviewResponseMessage[]
): boolean {
  // A session with no participants has nothing to finalize. Both equality
  // comparisons below are `0 === 0` on an empty roster, so a session whose
  // roster emptied transitioned to `finalizing` as though its work were
  // complete — the `review` branch already guarded with `> 0`, the other two
  // did not (#4585).
  //
  // Reachable despite `CollaborationConfigSchema` requiring at least one
  // expert: `getStatus()` returns `{ ...this.state }`, a shallow copy that
  // shares the live `participants` array, so any holder can empty it between
  // construction and the next `checkProgress`.
  if (participants.length === 0) return false;

  switch (pattern) {
    case 'sequential':
    case 'parallel':
      return results.size === participants.length;
    case 'review':
      return reviews.length > 0 && results.size > 0;
    case 'consensus':
      return votes.length === participants.length;
    default:
      return false;
  }
}
