/**
 * nexus-agents/learning - Outcome Storage Types
 *
 * Type definitions for SQLite-based outcome persistence.
 * Enables cross-session learning for routing optimization.
 *
 * @module learning/outcome-storage-types
 * (Source: Issue #188 - Outcome recording for routing ML feedback)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import { NexusError, ErrorCode } from '../core/errors.js';
import type { ILogger } from '../core/logger.js';
import type { CliName } from '../cli-adapters/types.js';
import type { RouterType, OutcomeClass } from './outcome-feedback-types.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error class for outcome storage operations.
 */
export class OutcomeStorageError extends NexusError {
  constructor(
    message: string,
    options?: Partial<
      Omit<{ code: ErrorCode; cause?: Error; context?: Record<string, unknown> }, 'code'>
    >
  ) {
    super(message, { code: ErrorCode.INTERNAL_ERROR, ...options });
    this.name = 'OutcomeStorageError';
  }
}

// ============================================================================
// Storage Record Types
// ============================================================================

/**
 * Stored routing decision record.
 */
export interface StoredRoutingDecision {
  readonly id: string;
  readonly traceId: string;
  readonly timestamp: string;
  readonly routerType: RouterType;
  readonly selectedModel: CliName;
  readonly alternativeModels: readonly CliName[];
  readonly confidence: number;
  readonly reason: string;
  readonly taskProfile: Record<string, unknown>;
  readonly requestId?: string | undefined; // Integration with #185 RequestContext
}

/**
 * Stored task outcome record.
 */
export interface StoredTaskOutcome {
  readonly routingDecisionId: string;
  readonly timestamp: string;
  readonly outcomeClass: OutcomeClass;
  readonly success: boolean;
  readonly qualityScore: number;
  readonly durationMs: number;
  readonly tokenUsage: number;
  readonly errorMessage?: string | undefined;
}

/**
 * Stored computed reward record.
 */
export interface StoredReward {
  readonly routingDecisionId: string;
  readonly timestamp: string;
  readonly reward: number;
  readonly baseReward: number;
  readonly qualityBonus: number;
  readonly speedBonus: number;
  readonly efficiencyBonus: number;
  readonly retryPenalty: number;
}

/**
 * Aggregated model statistics from stored data.
 */
export interface StoredModelStats {
  readonly model: CliName;
  readonly totalDecisions: number;
  readonly totalOutcomes: number;
  readonly avgReward: number;
  readonly avgQualityScore: number;
  readonly avgLatencyMs: number;
  readonly successRate: number;
}

// ============================================================================
// SQLite Row Types
// ============================================================================

/**
 * Row structure in routing_decisions table.
 */
export interface RoutingDecisionRow {
  id: string;
  trace_id: string;
  timestamp: number;
  router_type: string;
  selected_model: string;
  alternative_models: string;
  confidence: number;
  reason: string;
  task_profile: string;
  request_id: string | null;
}

/**
 * Row structure in task_outcomes table.
 */
export interface TaskOutcomeRow {
  routing_decision_id: string;
  timestamp: number;
  outcome_class: string;
  success: number;
  quality_score: number;
  duration_ms: number;
  token_usage: number;
  error_message: string | null;
}

/**
 * Row structure in computed_rewards table.
 */
export interface ComputedRewardRow {
  routing_decision_id: string;
  timestamp: number;
  reward: number;
  base_reward: number;
  quality_bonus: number;
  speed_bonus: number;
  efficiency_bonus: number;
  retry_penalty: number;
}

/**
 * Row structure for model statistics query.
 */
export interface ModelStatsRow {
  model: string;
  total_decisions: number;
  total_outcomes: number;
  avg_reward: number;
  avg_quality_score: number;
  avg_latency_ms: number;
  success_rate: number;
}

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Interface for outcome storage implementations.
 */
export interface IOutcomeStorage {
  /**
   * Store a routing decision.
   */
  storeDecision(decision: StoredRoutingDecision): Promise<Result<void, OutcomeStorageError>>;

  /**
   * Store a task outcome.
   */
  storeOutcome(outcome: StoredTaskOutcome): Promise<Result<void, OutcomeStorageError>>;

  /**
   * Store a computed reward.
   */
  storeReward(reward: StoredReward): Promise<Result<void, OutcomeStorageError>>;

  /**
   * Get routing decision by ID.
   */
  getDecision(id: string): Promise<Result<StoredRoutingDecision | null, OutcomeStorageError>>;

  /**
   * Get outcome for a routing decision.
   */
  getOutcome(
    routingDecisionId: string
  ): Promise<Result<StoredTaskOutcome | null, OutcomeStorageError>>;

  /**
   * Get aggregated statistics per model.
   */
  getModelStats(): Promise<Result<StoredModelStats[], OutcomeStorageError>>;

  /**
   * Get recent decisions for a model.
   */
  getRecentDecisions(
    model: CliName,
    limit: number
  ): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>>;

  /**
   * Get decisions by request ID (for audit trail integration).
   */
  getDecisionsByRequestId(
    requestId: string
  ): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>>;

  /**
   * Prune old records.
   */
  prune(olderThan: Date): Promise<Result<number, OutcomeStorageError>>;

  /**
   * Get total record counts.
   */
  getCounts(): Promise<
    Result<{ decisions: number; outcomes: number; rewards: number }, OutcomeStorageError>
  >;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for SQLite outcome storage.
 */
export interface OutcomeStorageConfig {
  /** Path to SQLite database file */
  dbPath: string;
  /** Optional logger instance */
  logger?: ILogger;
  /** Maximum records to retain (default: 100000) */
  maxRecords?: number;
  /** Auto-prune interval in ms (default: 3600000 = 1 hour) */
  autoPruneInterval?: number;
}

/**
 * Zod schema for OutcomeStorageConfig validation.
 */
export const OutcomeStorageConfigSchema = z.object({
  dbPath: z.string().min(1),
  maxRecords: z.number().positive().optional(),
  autoPruneInterval: z.number().positive().optional(),
});

/**
 * Default configuration values.
 */
export const DEFAULT_OUTCOME_STORAGE_CONFIG = {
  maxRecords: 100000,
  autoPruneInterval: 3600000, // 1 hour
} as const;

// ============================================================================
// SQLite Types (for better-sqlite3)
// ============================================================================

/**
 * Minimal interface for better-sqlite3 Database.
 */
export interface ISQLiteDatabase {
  exec(sql: string): void;
  prepare<T = unknown>(sql: string): ISQLiteStatement<T>;
  close(): void;
}

/**
 * Minimal interface for better-sqlite3 Statement.
 */
export interface ISQLiteStatement<T = unknown> {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
}
