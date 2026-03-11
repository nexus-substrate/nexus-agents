/**
 * nexus-agents/learning - Outcome Storage Helpers
 *
 * Helper functions for SQLite outcome storage operations.
 *
 * @module learning/outcome-storage-helpers
 * (Source: Issue #188)
 */

import type { Result } from '../core/result.js';
import { err } from '../core/index.js';
import type { CliName } from '../cli-adapters/types.js';
import type {
  ISQLiteDatabase,
  StoredRoutingDecision,
  StoredTaskOutcome,
  StoredModelStats,
  RoutingDecisionRow,
  TaskOutcomeRow,
  ModelStatsRow,
} from './outcome-storage-types.js';
import { OutcomeStorageError } from './outcome-storage-types.js';

// ============================================================================
// Table Creation Helpers
// ============================================================================

/**
 * Create the routing_decisions table.
 */
export function createDecisionsTable(db: ISQLiteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS routing_decisions (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      router_type TEXT NOT NULL,
      selected_model TEXT NOT NULL,
      alternative_models TEXT NOT NULL,
      confidence REAL NOT NULL,
      reason TEXT NOT NULL,
      task_profile TEXT NOT NULL,
      request_id TEXT
    )
  `);
}

/**
 * Create the task_outcomes table.
 */
export function createOutcomesTable(db: ISQLiteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_outcomes (
      routing_decision_id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      outcome_class TEXT NOT NULL,
      success INTEGER NOT NULL,
      quality_score REAL NOT NULL,
      duration_ms INTEGER NOT NULL,
      token_usage INTEGER NOT NULL,
      error_message TEXT,
      FOREIGN KEY (routing_decision_id) REFERENCES routing_decisions(id)
    )
  `);
}

/**
 * Create the computed_rewards table.
 */
export function createRewardsTable(db: ISQLiteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS computed_rewards (
      routing_decision_id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      reward REAL NOT NULL,
      base_reward REAL NOT NULL,
      quality_bonus REAL NOT NULL,
      speed_bonus REAL NOT NULL,
      efficiency_bonus REAL NOT NULL,
      retry_penalty REAL NOT NULL,
      FOREIGN KEY (routing_decision_id) REFERENCES routing_decisions(id)
    )
  `);
}

/**
 * Create indexes for common queries.
 */
export function createIndexes(db: ISQLiteDatabase): void {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON routing_decisions(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_model ON routing_decisions(selected_model)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_request_id ON routing_decisions(request_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp ON task_outcomes(timestamp)`);
}

// ============================================================================
// Row Conversion Helpers
// ============================================================================

/**
 * Convert a database row to a StoredRoutingDecision.
 */
export function rowToDecision(row: RoutingDecisionRow): StoredRoutingDecision {
  let alternativeModels: CliName[] = [];
  let taskProfile: Record<string, unknown> = {};
  try {
    alternativeModels = JSON.parse(row.alternative_models) as CliName[];
  } catch {
    // Corrupt row data — use empty fallback
  }
  try {
    taskProfile = JSON.parse(row.task_profile) as Record<string, unknown>;
  } catch {
    // Corrupt row data — use empty fallback
  }
  return {
    id: row.id,
    traceId: row.trace_id,
    timestamp: new Date(row.timestamp).toISOString(),
    routerType: row.router_type as StoredRoutingDecision['routerType'],
    selectedModel: row.selected_model as CliName,
    alternativeModels,
    confidence: row.confidence,
    reason: row.reason,
    taskProfile,
    requestId: row.request_id ?? undefined,
  };
}

/**
 * Convert a database row to a StoredTaskOutcome.
 */
export function rowToOutcome(row: TaskOutcomeRow): StoredTaskOutcome {
  return {
    routingDecisionId: row.routing_decision_id,
    timestamp: new Date(row.timestamp).toISOString(),
    outcomeClass: row.outcome_class as StoredTaskOutcome['outcomeClass'],
    success: row.success === 1,
    qualityScore: row.quality_score,
    durationMs: row.duration_ms,
    tokenUsage: row.token_usage,
    errorMessage: row.error_message ?? undefined,
  };
}

/**
 * Convert a database row to StoredModelStats.
 */
export function rowToStats(row: ModelStatsRow): StoredModelStats {
  return {
    model: row.model as CliName,
    totalDecisions: row.total_decisions,
    totalOutcomes: row.total_outcomes,
    avgReward: row.avg_reward,
    avgQualityScore: row.avg_quality_score,
    avgLatencyMs: row.avg_latency_ms,
    successRate: row.success_rate,
  };
}

// ============================================================================
// SQL Query Constants
// ============================================================================

/** SQL for inserting/updating routing decisions. */
export const INSERT_DECISION_SQL = `
  INSERT OR REPLACE INTO routing_decisions
  (id, trace_id, timestamp, router_type, selected_model, alternative_models,
   confidence, reason, task_profile, request_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** SQL for inserting/updating task outcomes. */
export const INSERT_OUTCOME_SQL = `
  INSERT OR REPLACE INTO task_outcomes
  (routing_decision_id, timestamp, outcome_class, success, quality_score,
   duration_ms, token_usage, error_message)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

/** SQL for inserting/updating computed rewards. */
export const INSERT_REWARD_SQL = `
  INSERT OR REPLACE INTO computed_rewards
  (routing_decision_id, timestamp, reward, base_reward, quality_bonus,
   speed_bonus, efficiency_bonus, retry_penalty)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

/** SQL for aggregating model statistics. */
export const MODEL_STATS_SQL = `
  SELECT
    rd.selected_model as model,
    COUNT(DISTINCT rd.id) as total_decisions,
    COUNT(DISTINCT o.routing_decision_id) as total_outcomes,
    COALESCE(AVG(r.reward), 0) as avg_reward,
    COALESCE(AVG(o.quality_score), 0) as avg_quality_score,
    COALESCE(AVG(o.duration_ms), 0) as avg_latency_ms,
    COALESCE(AVG(CAST(o.success AS REAL)), 0) as success_rate
  FROM routing_decisions rd
  LEFT JOIN task_outcomes o ON rd.id = o.routing_decision_id
  LEFT JOIN computed_rewards r ON rd.id = r.routing_decision_id
  GROUP BY rd.selected_model
  ORDER BY total_decisions DESC
`;

// ============================================================================
// Error Handling Helpers
// ============================================================================

/**
 * Wrap an error with OutcomeStorageError and return as a Result.
 */
export function wrapStorageError<T>(
  error: unknown,
  message: string,
  context?: Record<string, unknown>
): Result<T, OutcomeStorageError> {
  const causeError = error instanceof Error ? error : new Error(String(error));
  const options = context !== undefined ? { cause: causeError, context } : { cause: causeError };
  return err(new OutcomeStorageError(message, options));
}
