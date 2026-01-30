/**
 * nexus-agents/learning - Feedback Integration Types
 *
 * Type definitions for feedback integration between routing and outcomes.
 *
 * @module learning/feedback-integration-types
 * (Source: Issue #167, Epic #164)
 */

import type { ILogger } from '../core/logger.js';
import type { StepResult } from '../core/types/workflow.js';
import type {
  CompositeRoutingDecision,
  ICompositeRouter,
} from '../cli-adapters/composite-router.js';
import type { TraceId } from '../observability/swarm-observer-types.js';
import type { FeedbackLoopStats, OutcomeProcessedCallback } from './outcome-feedback-types.js';
import type { IOutcomeStorage } from './outcome-storage-types.js';

// ============================================================================
// Parameters
// ============================================================================

/**
 * Parameters for recording an outcome.
 */
export interface RecordOutcomeParams {
  /** Routing decision ID */
  readonly routingDecisionId: string;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Quality score (0-1) */
  readonly qualityScore: number;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Token usage */
  readonly tokenUsage: number;
  /** Number of retries (default: 0) */
  readonly retryCount?: number | undefined;
  /** Trace ID for correlation */
  readonly traceId?: TraceId | undefined;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for feedback integration.
 */
export interface FeedbackIntegrationConfig {
  /** Enable automatic feedback to routers (default: true) */
  readonly enableAutoFeedback: boolean;
  /** Quality score threshold for success (default: 0.7) */
  readonly successQualityThreshold: number;
  /** Quality score threshold for partial success (default: 0.4) */
  readonly partialQualityThreshold: number;
  /** TTL for decision entries in milliseconds (default: 3600000 = 1 hour) */
  readonly decisionTtlMs?: number | undefined;
  /** Logger instance */
  readonly logger?: ILogger | undefined;
  /**
   * Enable persistent storage via SQLite (default: false).
   * Requires outcomeStorage to be provided.
   * (Source: Issue #560 - Wire SQLiteOutcomeStorage to feedback loop)
   */
  readonly enablePersistence?: boolean | undefined;
  /**
   * SQLite outcome storage instance for cross-session learning.
   * Only used when enablePersistence is true.
   * (Source: Issue #560 - Wire SQLiteOutcomeStorage to feedback loop)
   */
  readonly outcomeStorage?: IOutcomeStorage | undefined;
}

/** Default TTL for decision entries: 1 hour */
export const DEFAULT_DECISION_TTL_MS = 3600000;

/**
 * Default configuration.
 */
export const DEFAULT_FEEDBACK_INTEGRATION_CONFIG: FeedbackIntegrationConfig = {
  enableAutoFeedback: true,
  successQualityThreshold: 0.7,
  partialQualityThreshold: 0.4,
  decisionTtlMs: DEFAULT_DECISION_TTL_MS,
};

// ============================================================================
// Interface
// ============================================================================

/**
 * Interface for feedback integration.
 */
export interface IFeedbackIntegration {
  /** Record a routing decision from CompositeRouter */
  recordRoutingDecision(decision: CompositeRoutingDecision, traceId?: TraceId): string;

  /** Record a step outcome from workflow execution */
  recordStepOutcome(
    routingDecisionId: string,
    stepResult: StepResult,
    durationMs: number,
    tokenUsage: number
  ): void;

  /** Record a generic task outcome */
  recordOutcome(params: RecordOutcomeParams): void;

  /** Get feedback statistics */
  getStats(): FeedbackLoopStats;

  /** Subscribe to outcome processed events */
  onOutcomeProcessed(callback: OutcomeProcessedCallback): () => void;

  /** Register CompositeRouter for bi-directional feedback */
  registerCompositeRouter(router: ICompositeRouter): void;

  /** Reset all collected data */
  reset(): void;

  /** Evict stale entries from decision map that exceed TTL */
  evictStaleEntries(): number;

  /** Get total count of evicted entries since creation or last reset */
  getEvictedEntryCount(): number;

  /** Get current size of decision map */
  getDecisionMapSize(): number;
}
