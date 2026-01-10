/**
 * nexus-agents/learning - Outcome Feedback Types
 *
 * Type definitions for the closed-loop outcome feedback system
 * that enables continuous learning from routing decisions.
 *
 * @module learning/outcome-feedback-types
 * (Source: Issue #160, Alignment Roadmap Phase 2)
 */

import { z } from 'zod';
import type { TraceId } from '../observability/swarm-observer-types.js';
import type { BanditContext } from '../cli-adapters/budget-router-types.js';
import type { QueryFeatures } from '../cli-adapters/preference-router-types.js';

/**
 * Router type that made the routing decision.
 */
export type RouterType = 'linucb' | 'preference' | 'quality' | 'cascade' | 'topsis';

/**
 * Task outcome classification.
 */
export type OutcomeClass = 'success' | 'partial' | 'failure' | 'timeout' | 'error';

/**
 * Quality signals extracted from task execution.
 */
export interface QualitySignals {
  /** Whether code tests passed (for code tasks) */
  readonly testsPass?: boolean | undefined;
  /** Number of lint errors (for code tasks) */
  readonly lintErrors?: number | undefined;
  /** Explicit user approval/rejection */
  readonly userApproved?: boolean | undefined;
  /** Number of retries required */
  readonly retryCount: number;
  /** Task completion percentage (0-1) */
  readonly completionRatio: number;
  /** Whether output was valid JSON/structured (for structured output tasks) */
  readonly validStructure?: boolean | undefined;
  /** Response coherence score (0-1) */
  readonly coherenceScore?: number | undefined;
}

/**
 * Zod schema for quality signals.
 */
export const QualitySignalsSchema = z.object({
  testsPass: z.boolean().optional(),
  lintErrors: z.number().int().min(0).optional(),
  userApproved: z.boolean().optional(),
  retryCount: z.number().int().min(0).default(0),
  completionRatio: z.number().min(0).max(1).default(1),
  validStructure: z.boolean().optional(),
  coherenceScore: z.number().min(0).max(1).optional(),
});

/**
 * Recorded routing decision for feedback tracking.
 */
export interface RoutingDecision {
  /** Unique decision ID */
  readonly id: string;
  /** Timestamp of decision */
  readonly timestamp: string;
  /** Original query/task that was routed */
  readonly query: string;
  /** Type of router used */
  readonly routerType: RouterType;
  /** Selected model/adapter name */
  readonly selectedModel: string;
  /** Selected model tier (strong/weak for preference routing) */
  readonly selectedTier?: 'strong' | 'weak' | undefined;
  /** Arm index for LinUCB bandit */
  readonly armIndex?: number | undefined;
  /** Bandit context (for LinUCB decisions) */
  readonly banditContext?: BanditContext | undefined;
  /** Query features (for preference routing) */
  readonly queryFeatures?: QueryFeatures | undefined;
  /** UCB score (for LinUCB) */
  readonly ucbScore?: number | undefined;
  /** Confidence score */
  readonly confidence?: number | undefined;
  /** Trace ID to correlate with SwarmObserver events */
  readonly traceId: TraceId;
  /** Task domain classification */
  readonly domain?: string | undefined;
}

/**
 * Zod schema for routing decision.
 */
export const RoutingDecisionSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  query: z.string(),
  routerType: z.enum(['linucb', 'preference', 'quality', 'cascade', 'topsis']),
  selectedModel: z.string(),
  selectedTier: z.enum(['strong', 'weak']).optional(),
  armIndex: z.number().int().min(0).optional(),
  banditContext: z.record(z.unknown()).optional(),
  queryFeatures: z.record(z.unknown()).optional(),
  ucbScore: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  traceId: z.string(),
  domain: z.string().optional(),
});

/**
 * Task outcome for a routing decision.
 */
export interface TaskOutcome {
  /** Reference to the routing decision */
  readonly routingDecisionId: string;
  /** Timestamp of outcome */
  readonly timestamp: string;
  /** Outcome classification */
  readonly outcomeClass: OutcomeClass;
  /** Overall success indicator */
  readonly success: boolean;
  /** Quality score (0-1) */
  readonly qualityScore: number;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Token usage */
  readonly tokenUsage: number;
  /** Error message if failed */
  readonly errorMessage?: string | undefined;
  /** Extracted quality signals */
  readonly qualitySignals: QualitySignals;
  /** Trace ID for correlation */
  readonly traceId: TraceId;
}

/**
 * Zod schema for task outcome.
 */
export const TaskOutcomeSchema = z.object({
  routingDecisionId: z.string().uuid(),
  timestamp: z.string().datetime(),
  outcomeClass: z.enum(['success', 'partial', 'failure', 'timeout', 'error']),
  success: z.boolean(),
  qualityScore: z.number().min(0).max(1),
  durationMs: z.number().min(0),
  tokenUsage: z.number().int().min(0),
  errorMessage: z.string().optional(),
  qualitySignals: QualitySignalsSchema,
  traceId: z.string(),
});

/**
 * Computed reward for bandit update.
 */
export interface ComputedReward {
  /** The reward value (0-1) */
  readonly reward: number;
  /** Components that contributed to the reward */
  readonly components: {
    readonly baseReward: number;
    readonly qualityBonus: number;
    readonly speedBonus: number;
    readonly efficiencyBonus: number;
    readonly retryPenalty: number;
  };
  /** Explanation of reward computation */
  readonly explanation: string;
}

/**
 * Feedback loop statistics.
 */
export interface FeedbackLoopStats {
  /** Total routing decisions recorded */
  readonly totalDecisions: number;
  /** Total outcomes recorded */
  readonly totalOutcomes: number;
  /** Decisions pending outcome */
  readonly pendingOutcomes: number;
  /** Outcomes by classification */
  readonly outcomesByClass: Record<OutcomeClass, number>;
  /** Average quality score */
  readonly avgQualityScore: number;
  /** Average reward computed */
  readonly avgReward: number;
  /** Decisions by router type */
  readonly decisionsByRouter: Record<RouterType, number>;
  /** Last update timestamp */
  readonly lastUpdatedAt: string;
}

/**
 * Configuration for the feedback collector.
 */
export interface FeedbackCollectorConfig {
  /** Maximum pending decisions to track */
  readonly maxPendingDecisions: number;
  /** Timeout for pending decisions (ms) */
  readonly pendingTimeoutMs: number;
  /** Enable automatic reward computation */
  readonly enableAutoReward: boolean;
  /** Weight for quality in reward computation */
  readonly qualityWeight: number;
  /** Weight for speed in reward computation */
  readonly speedWeight: number;
  /** Weight for efficiency in reward computation */
  readonly efficiencyWeight: number;
  /** Penalty per retry in reward computation */
  readonly retryPenalty: number;
  /** Target duration for speed bonus (ms) */
  readonly targetDurationMs: number;
  /** Target token usage for efficiency bonus */
  readonly targetTokenUsage: number;
}

/**
 * Default feedback collector configuration.
 */
export const DEFAULT_FEEDBACK_COLLECTOR_CONFIG: FeedbackCollectorConfig = {
  maxPendingDecisions: 1000,
  pendingTimeoutMs: 300000, // 5 minutes
  enableAutoReward: true,
  qualityWeight: 0.5,
  speedWeight: 0.2,
  efficiencyWeight: 0.2,
  retryPenalty: 0.1,
  targetDurationMs: 5000,
  targetTokenUsage: 2000,
};

/**
 * Zod schema for feedback collector configuration.
 */
export const FeedbackCollectorConfigSchema = z.object({
  maxPendingDecisions: z.number().int().positive().default(1000),
  pendingTimeoutMs: z.number().positive().default(300000),
  enableAutoReward: z.boolean().default(true),
  qualityWeight: z.number().min(0).max(1).default(0.5),
  speedWeight: z.number().min(0).max(1).default(0.2),
  efficiencyWeight: z.number().min(0).max(1).default(0.2),
  retryPenalty: z.number().min(0).max(1).default(0.1),
  targetDurationMs: z.number().positive().default(5000),
  targetTokenUsage: z.number().positive().default(2000),
});

/**
 * Interface for outcome feedback collector.
 */
export interface IOutcomeFeedback {
  /**
   * Record a routing decision for tracking.
   */
  recordRoutingDecision(decision: RoutingDecision): void;

  /**
   * Record an outcome for a routing decision.
   */
  recordOutcome(outcome: TaskOutcome): void;

  /**
   * Process outcome for a trace ID (finds matching decision and computes reward).
   */
  processOutcome(traceId: TraceId, outcome: Omit<TaskOutcome, 'routingDecisionId'>): void;

  /**
   * Compute reward from an outcome.
   */
  computeReward(outcome: TaskOutcome): ComputedReward;

  /**
   * Get feedback loop statistics.
   */
  getStats(): FeedbackLoopStats;

  /**
   * Get pending decisions (waiting for outcomes).
   */
  getPendingDecisions(): readonly RoutingDecision[];

  /**
   * Clear expired pending decisions.
   */
  clearExpiredDecisions(): number;

  /**
   * Reset all state.
   */
  reset(): void;
}

/**
 * Callback for when an outcome is processed.
 */
export type OutcomeProcessedCallback = (
  decision: RoutingDecision,
  outcome: TaskOutcome,
  reward: ComputedReward
) => void;
