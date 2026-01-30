/**
 * nexus-agents/agents - Collaboration Session Helpers
 *
 * Helper types and functions for CollaborationSession class.
 * Extracted to keep the main session class under 400 lines.
 */

import type { TaskResult, AgentRole, ILogger } from '../../core/index.js';
import { getTimeProvider } from '../../core/index.js';
import type { IEventBus } from './event-bus-types.js';

/**
 * Maximum number of event listeners allowed per session.
 * Prevents memory issues from unbounded listener growth.
 */
export const MAX_EVENT_LISTENERS = 50;

/** Options for creating a CollaborationSession. */
export interface CollaborationSessionOptions {
  logger?: ILogger;
  onStatusChange?: (status: SessionStatus) => void;
  onMessage?: (message: CollaborationMessage) => void;
  roleResolver?: (expertId: string) => AgentRole;
  /** Optional event bus for cross-session event publishing */
  eventBus?: IEventBus;
}

/** Session event types for callbacks. */
export type SessionEvent =
  | { type: 'status_change'; status: SessionStatus }
  | { type: 'expert_joined'; expertId: string }
  | { type: 'result_submitted'; expertId: string; result: TaskResult }
  | { type: 'review_completed'; reviewerId: string; approved: boolean }
  | { type: 'vote_received'; expertId: string; decision: string }
  | { type: 'timeout'; expertId?: string }
  | { type: 'error'; error: Error };

// Re-export types used in SessionEvent
import type { SessionStatus, CollaborationMessage } from './collaboration-types.js';
export type { SessionStatus, CollaborationMessage };

/**
 * Safely emits an event to a list of listeners, catching any errors.
 * Returns an array of errors that occurred during emission.
 */
export function emitEventToListeners(
  listeners: ReadonlyArray<(event: SessionEvent) => void>,
  event: SessionEvent,
  logger: ILogger
): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (e) {
      const errorObj = e instanceof Error ? e : new Error(String(e));
      logger.error('Event listener error', errorObj, { eventType: event.type });
    }
  }
}

import type {
  CollaborationConfig,
  CollaborationPattern,
  CollaborationResult,
  ExpertParticipation,
  TaskAssignmentMessage,
  VoteMessage,
  ReviewResponseMessage,
} from './collaboration-types.js';
import {
  getSequentialAssignments,
  getParallelAssignments,
  getReviewAssignments,
  getConsensusAssignments,
  isSessionSuccessful,
  buildExpertResults,
  buildAggregatedResult,
} from './session-helpers.js';

/** Input for dispatching task assignments based on pattern. */
export interface TaskAssignmentDispatchInput {
  pattern: CollaborationPattern;
  config: CollaborationConfig;
  participants: ExpertParticipation[];
  results: Map<string, TaskResult>;
}

/**
 * Dispatches to the appropriate assignment function based on pattern.
 */
export function dispatchTaskAssignments(
  input: TaskAssignmentDispatchInput
): TaskAssignmentMessage[] {
  const { pattern, config, participants, results } = input;

  switch (pattern) {
    case 'sequential':
      return getSequentialAssignments(config, participants, results);
    case 'parallel':
      return getParallelAssignments(config, participants);
    case 'review':
      return getReviewAssignments(config, participants, results);
    case 'consensus':
      return getConsensusAssignments(config, participants);
    default:
      return [];
  }
}

/** Input for building the final collaboration result. */
export interface BuildFinalResultInput {
  config: CollaborationConfig;
  participants: ExpertParticipation[];
  results: Map<string, TaskResult>;
  votes: VoteMessage[];
  reviews: ReviewResponseMessage[];
  startedAt: string;
  error?: string | undefined;
}

/**
 * Builds the final collaboration result for session finalization.
 */
export function buildFinalCollaborationResult(input: BuildFinalResultInput): CollaborationResult {
  const { config, participants, results, votes, reviews, startedAt, error } = input;
  const endTime = new Date(getTimeProvider().now());
  const durationMs = endTime.getTime() - new Date(startedAt).getTime();
  const allResults = Array.from(results.values());

  const success = isSessionSuccessful({
    pattern: config.pattern,
    participants,
    results,
    votes,
    reviews,
    requireUnanimous: config.requireUnanimous === true,
    minVotes: config.minVotes,
  });

  const baseResult = {
    sessionId: config.sessionId,
    pattern: config.pattern,
    aggregatedResult: buildAggregatedResult({
      pattern: config.pattern,
      results: allResults,
      participants,
      votes,
      reviews,
      endTime,
    }),
    expertResults: buildExpertResults(participants, results),
    durationMs,
    success,
  };

  return success ? baseResult : { ...baseResult, error: error ?? 'Unknown error' };
}
