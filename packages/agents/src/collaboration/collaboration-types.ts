/**
 * @nexus-agents/agents - Collaboration Types
 *
 * Type definitions for expert collaboration protocol.
 * Defines patterns for sequential, parallel, review, and consensus collaboration.
 */

import type { Task, TaskResult, AgentRole } from '@nexus-agents/core';

// Re-export schemas and constants from collaboration-schemas.ts
export {
  CollaborationPatternSchema,
  SessionStatusSchema,
  VoteDecisionSchema,
  CollaborationConfigSchema,
  ExpertParticipationSchema,
  VoteMessageSchema,
  ReviewResponseMessageSchema,
  DEFAULT_TIMEOUTS,
  DEFAULT_MAX_RETRIES,
  MIN_EXPERTS_FOR_PATTERN,
} from './collaboration-schemas.js';

/**
 * Collaboration pattern types.
 * - sequential: Experts work in order, passing results forward
 * - parallel: Experts work simultaneously on the same task
 * - review: One expert reviews another's work
 * - consensus: Voting-based decision making
 */
export type CollaborationPattern = 'sequential' | 'parallel' | 'review' | 'consensus';

/**
 * Session status during collaboration lifecycle.
 */
export type SessionStatus =
  | 'pending'
  | 'in_progress'
  | 'awaiting_review'
  | 'voting'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'timed_out';

/**
 * Vote decision options for consensus protocol.
 */
export type VoteDecision = 'approve' | 'reject' | 'abstain';

/**
 * Configuration for a collaboration session.
 */
export interface CollaborationConfig {
  sessionId: string;
  pattern: CollaborationPattern;
  experts: string[];
  task: Task;
  timeout?: number;
  minVotes?: number;
  requireUnanimous?: boolean;
  maxRetries?: number;
}

/**
 * Expert participation record in a session.
 */
export interface ExpertParticipation {
  expertId: string;
  role: AgentRole;
  joinedAt: string;
  status: 'pending' | 'working' | 'submitted' | 'reviewing' | 'voted' | 'failed';
  submittedAt?: string;
  retryCount: number;
}

/**
 * Collaboration message types for inter-expert communication.
 */
export type CollaborationMessage =
  | TaskAssignmentMessage
  | ResultSubmissionMessage
  | ReviewRequestMessage
  | ReviewResponseMessage
  | FeedbackMessage
  | VoteMessage
  | StatusUpdateMessage;

/**
 * Task assignment message sent to an expert.
 */
export interface TaskAssignmentMessage {
  type: 'task_assignment';
  expertId: string;
  task: Task;
  sequencePosition?: number;
  previousResults?: TaskResult[];
  deadline?: string;
}

/**
 * Result submission from an expert.
 */
export interface ResultSubmissionMessage {
  type: 'result_submission';
  expertId: string;
  result: TaskResult;
  confidence?: number;
  notes?: string;
}

/**
 * Review request from one expert to another.
 */
export interface ReviewRequestMessage {
  type: 'review_request';
  fromExpert: string;
  toExpert: string;
  artifact: unknown;
  criteria?: string[];
  deadline?: string;
}

/**
 * Review response from a reviewer.
 */
export interface ReviewResponseMessage {
  type: 'review_response';
  reviewerId: string;
  requesterId: string;
  approved: boolean;
  feedback: string;
  suggestions?: string[];
  severity?: 'none' | 'minor' | 'major' | 'critical';
}

/**
 * General feedback message.
 */
export interface FeedbackMessage {
  type: 'feedback';
  expertId: string;
  targetExpertId?: string;
  feedback: string;
  category?: 'improvement' | 'concern' | 'praise' | 'question';
}

/**
 * Vote message for consensus protocol.
 */
export interface VoteMessage {
  type: 'vote';
  expertId: string;
  decision: VoteDecision;
  reasoning: string;
  conditions?: string[];
}

/**
 * Status update message.
 */
export interface StatusUpdateMessage {
  type: 'status_update';
  expertId: string;
  status: ExpertParticipation['status'];
  progress?: number;
  estimatedTimeRemaining?: number;
}

/**
 * Aggregated session status.
 */
export interface SessionState {
  config: CollaborationConfig;
  status: SessionStatus;
  participants: ExpertParticipation[];
  results: Map<string, TaskResult>;
  reviews: ReviewResponseMessage[];
  votes: VoteMessage[];
  startedAt: string;
  completedAt?: string;
  error?: string;
  messageLog: CollaborationMessage[];
}

/**
 * Final collaboration result.
 */
export interface CollaborationResult {
  sessionId: string;
  pattern: CollaborationPattern;
  aggregatedResult: AggregatedResult;
  expertResults: ExpertResultSummary[];
  durationMs: number;
  success: boolean;
  error?: string;
}

/**
 * Summary of an expert's contribution.
 */
export interface ExpertResultSummary {
  expertId: string;
  role: AgentRole;
  result?: TaskResult;
  contributionScore: number;
  executionTimeMs: number;
  success: boolean;
  error?: string;
}

/**
 * Aggregated result from multiple experts.
 */
export interface AggregatedResult {
  output: unknown;
  strategy: 'merge' | 'select_best' | 'consensus' | 'sequential_chain';
  qualityScore: number;
  conflicts: ResultConflict[];
  metadata: AggregationMetadata;
}

/**
 * Conflict between expert results.
 */
export interface ResultConflict {
  expert1Id: string;
  expert2Id: string;
  field: string;
  description: string;
  resolution: 'expert1' | 'expert2' | 'merged' | 'unresolved';
  resolutionReason?: string;
}

/**
 * Metadata about the aggregation process.
 */
export interface AggregationMetadata {
  resultCount: number;
  conflictCount: number;
  averageConfidence: number;
  totalTokensUsed: number;
  aggregatedAt: string;
}
