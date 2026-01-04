/**
 * nexus-agents/agents - Collaboration Session
 *
 * Manages collaboration sessions between multiple experts.
 * Handles session lifecycle, message routing, and result collection.
 */

import type { Result, TaskResult, ILogger, AgentRole } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type {
  CollaborationConfig,
  SessionState,
  SessionStatus,
  CollaborationMessage,
  CollaborationResult,
  VoteMessage,
  ReviewResponseMessage,
  TaskAssignmentMessage,
} from './collaboration-types.js';
import { DEFAULT_TIMEOUTS, DEFAULT_MAX_RETRIES } from './collaboration-types.js';
import {
  getSequentialAssignments,
  getParallelAssignments,
  getReviewAssignments,
  getConsensusAssignments,
  isSessionSuccessful,
  buildExpertResults,
  buildAggregatedResult,
  validateConfig,
  createSessionState,
  shouldFinalize,
} from './session-helpers.js';

/**
 * Maximum number of event listeners allowed per session.
 * Prevents memory issues from unbounded listener growth.
 */
const MAX_EVENT_LISTENERS = 50;

/** Options for creating a CollaborationSession. */
export interface CollaborationSessionOptions {
  logger?: ILogger;
  onStatusChange?: (status: SessionStatus) => void;
  onMessage?: (message: CollaborationMessage) => void;
  roleResolver?: (expertId: string) => AgentRole;
}

/** Session event types for callbacks. */
export type SessionEvent =
  | { type: 'status_change'; status: SessionStatus }
  | { type: 'expert_joined'; expertId: string }
  | { type: 'result_submitted'; expertId: string; result: TaskResult }
  | { type: 'review_completed'; reviewerId: string; approved: boolean }
  | { type: 'vote_received'; expertId: string; decision: string }
  | { type: 'timeout'; expertId?: string }
  | { type: 'error'; error: AgentError };

/** Manages a collaboration session between multiple experts. */
export class CollaborationSession {
  private readonly logger: ILogger;
  private readonly onStatusChange: ((status: SessionStatus) => void) | undefined;
  private readonly onMessage: ((message: CollaborationMessage) => void) | undefined;
  private readonly roleResolver: (expertId: string) => AgentRole;
  private state: SessionState | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly eventListeners: Array<(event: SessionEvent) => void> = [];

  constructor(options: CollaborationSessionOptions = {}) {
    this.logger = options.logger ?? createLogger({ component: 'CollaborationSession' });
    this.onStatusChange = options.onStatusChange;
    this.onMessage = options.onMessage;
    this.roleResolver = options.roleResolver ?? (() => 'custom' as AgentRole);
  }

  /** Starts a new collaboration session. */
  start(config: CollaborationConfig): Result<string, AgentError> {
    const validation = validateConfig(config);
    if (!validation.ok) return err(validation.error);

    if (this.state !== null) {
      return err(
        new AgentError('Session already in progress', {
          context: { existingSessionId: this.state.config.sessionId },
        })
      );
    }

    this.logger.info('Starting collaboration session', {
      sessionId: config.sessionId,
      pattern: config.pattern,
      expertCount: config.experts.length,
    });

    this.state = createSessionState(config, this.roleResolver);
    this.setStatus('in_progress');
    this.startTimeout(config.timeout ?? DEFAULT_TIMEOUTS[config.pattern]);

    return ok(config.sessionId);
  }

  /** Submits a result from an expert. */
  submitResult(expertId: string, result: TaskResult): Result<void, AgentError> {
    if (this.state === null) return err(new AgentError('No active session'));

    const participant = this.state.participants.find((p) => p.expertId === expertId);
    if (participant === undefined) {
      return err(new AgentError('Expert not in session', { context: { expertId } }));
    }
    if (participant.status === 'submitted') {
      return err(new AgentError('Expert already submitted result', { context: { expertId } }));
    }

    this.logger.info('Expert submitted result', { expertId, taskId: result.taskId });

    participant.status = 'submitted';
    participant.submittedAt = new Date().toISOString();
    this.state.results.set(expertId, result);

    this.logMessage({ type: 'result_submission', expertId, result });
    this.emitEvent({ type: 'result_submitted', expertId, result });
    this.checkProgress();

    return ok(undefined);
  }

  /** Requests a review from one expert to another. */
  requestReview(fromExpert: string, toExpert: string, artifact: unknown): Result<void, AgentError> {
    if (this.state === null) return err(new AgentError('No active session'));
    if (this.state.config.pattern !== 'review') {
      return err(new AgentError('Review requests only allowed in review pattern'));
    }

    const fromP = this.state.participants.find((p) => p.expertId === fromExpert);
    const toP = this.state.participants.find((p) => p.expertId === toExpert);
    if (fromP === undefined || toP === undefined) {
      return err(new AgentError('Expert not in session', { context: { fromExpert, toExpert } }));
    }

    this.logger.debug('Review requested', { fromExpert, toExpert });
    toP.status = 'reviewing';
    this.setStatus('awaiting_review');
    this.logMessage({ type: 'review_request', fromExpert, toExpert, artifact });

    return ok(undefined);
  }

  /** Submits a review response. */
  submitReview(
    reviewerId: string,
    requesterId: string,
    approved: boolean,
    feedback: string
  ): Result<void, AgentError> {
    if (this.state === null) return err(new AgentError('No active session'));

    const reviewer = this.state.participants.find((p) => p.expertId === reviewerId);
    if (reviewer === undefined) {
      return err(new AgentError('Reviewer not in session', { context: { reviewerId } }));
    }

    this.logger.info('Review submitted', { reviewerId, requesterId, approved });
    const response: ReviewResponseMessage = {
      type: 'review_response',
      reviewerId,
      requesterId,
      approved,
      feedback,
    };
    this.state.reviews.push(response);
    this.logMessage(response);
    this.emitEvent({ type: 'review_completed', reviewerId, approved });
    this.checkProgress();

    return ok(undefined);
  }

  /** Submits a vote for consensus protocol. */
  vote(
    expertId: string,
    decision: 'approve' | 'reject' | 'abstain',
    reasoning: string
  ): Result<void, AgentError> {
    if (this.state === null) return err(new AgentError('No active session'));
    if (this.state.config.pattern !== 'consensus') {
      return err(new AgentError('Voting only allowed in consensus pattern'));
    }

    const participant = this.state.participants.find((p) => p.expertId === expertId);
    if (participant === undefined) {
      return err(new AgentError('Expert not in session', { context: { expertId } }));
    }
    if (participant.status === 'voted') {
      return err(new AgentError('Expert already voted', { context: { expertId } }));
    }
    if (reasoning.trim().length === 0) {
      return err(new AgentError('Vote reasoning is required'));
    }

    this.logger.info('Vote submitted', { expertId, decision });
    participant.status = 'voted';
    const voteMessage: VoteMessage = { type: 'vote', expertId, decision, reasoning };
    this.state.votes.push(voteMessage);
    this.logMessage(voteMessage);

    if (this.state.status !== 'voting') this.setStatus('voting');
    this.emitEvent({ type: 'vote_received', expertId, decision });
    this.checkProgress();

    return ok(undefined);
  }

  getStatus(): SessionState | null {
    return this.state === null ? null : { ...this.state };
  }
  getSessionId(): string | null {
    return this.state?.config.sessionId ?? null;
  }

  /** Marks an expert as failed. */
  markExpertFailed(expertId: string, _error: string): Result<void, AgentError> {
    if (this.state === null) return err(new AgentError('No active session'));

    const participant = this.state.participants.find((p) => p.expertId === expertId);
    if (participant === undefined) {
      return err(new AgentError('Expert not in session', { context: { expertId } }));
    }

    const maxRetries = this.state.config.maxRetries ?? DEFAULT_MAX_RETRIES;
    participant.retryCount += 1;

    if (participant.retryCount > maxRetries) {
      this.logger.warn('Expert failed after max retries', { expertId });
      participant.status = 'failed';
    } else {
      this.logger.info('Expert failed, will retry', {
        expertId,
        retryCount: participant.retryCount,
      });
      participant.status = 'pending';
    }

    this.checkProgress();
    return ok(undefined);
  }

  /** Gets task assignments for experts based on pattern. */
  getTaskAssignments(): TaskAssignmentMessage[] {
    if (this.state === null) return [];
    const { config, participants, results } = this.state;

    switch (config.pattern) {
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

  /** Finalizes the session and returns aggregated result. */
  finalize(): Result<CollaborationResult, AgentError> {
    if (this.state === null) return err(new AgentError('No active session'));

    this.clearTimeout();
    const endTime = new Date();
    const durationMs = endTime.getTime() - new Date(this.state.startedAt).getTime();

    const { config, participants, results, votes, reviews } = this.state;
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

    const collaborationResult: CollaborationResult = success
      ? baseResult
      : { ...baseResult, error: this.state.error ?? 'Unknown error' };

    this.setStatus(success ? 'completed' : 'failed');
    this.state.completedAt = endTime.toISOString();
    this.logger.info('Session finalized', { sessionId: config.sessionId, success, durationMs });

    this.state = null;
    return ok(collaborationResult);
  }

  cancel(reason: string): void {
    if (this.state === null) return;
    this.clearTimeout();
    this.state.error = reason;
    this.setStatus('failed');
    this.logger.warn('Session cancelled', { sessionId: this.state.config.sessionId, reason });
  }

  addEventListener(listener: (event: SessionEvent) => void): void {
    if (this.eventListeners.length >= MAX_EVENT_LISTENERS) {
      throw new AgentError(
        `Maximum event listener limit (${String(MAX_EVENT_LISTENERS)}) reached`,
        {
          context: { currentCount: this.eventListeners.length, limit: MAX_EVENT_LISTENERS },
        }
      );
    }
    this.eventListeners.push(listener);
  }
  removeEventListener(listener: (event: SessionEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index !== -1) this.eventListeners.splice(index, 1);
  }

  private setStatus(status: SessionStatus): void {
    if (this.state === null) return;
    this.state.status = status;
    this.onStatusChange?.(status);
    this.emitEvent({ type: 'status_change', status });
  }

  private logMessage(message: CollaborationMessage): void {
    if (this.state !== null) this.state.messageLog.push(message);
    this.onMessage?.(message);
  }

  private startTimeout(timeoutMs: number): void {
    this.clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      if (this.state !== null) {
        this.logger.warn('Session timed out', { sessionId: this.state.config.sessionId });
        this.state.error = 'Session timed out';
        this.setStatus('timed_out');
        this.emitEvent({ type: 'timeout' });
      }
    }, timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private checkProgress(): void {
    if (this.state === null) return;
    const { config, participants, results, votes, reviews } = this.state;

    if (shouldFinalize(config.pattern, participants, results, votes, reviews)) {
      this.setStatus('finalizing');
    }

    if (participants.every((p) => p.status === 'failed')) {
      this.state.error = 'All experts failed';
      this.setStatus('failed');
    }
  }

  private emitEvent(event: SessionEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (e) {
        const errorObj = e instanceof Error ? e : new Error(String(e));
        this.logger.error('Event listener error', errorObj, { eventType: event.type });
      }
    }
  }
}

export function createCollaborationSession(
  options?: CollaborationSessionOptions
): CollaborationSession {
  return new CollaborationSession(options);
}
