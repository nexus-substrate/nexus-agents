/**
 * nexus-agents/learning - Outcome Storage Helpers
 *
 * Helper functions for SQLite outcome storage operations.
 *
 * @module learning/outcome-storage-helpers
 * (Source: Issue #188)
 */

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
  return {
    id: row.id,
    traceId: row.trace_id,
    timestamp: new Date(row.timestamp).toISOString(),
    routerType: row.router_type as StoredRoutingDecision['routerType'],
    selectedModel: row.selected_model as CliName,
    alternativeModels: JSON.parse(row.alternative_models) as CliName[],
    confidence: row.confidence,
    reason: row.reason,
    taskProfile: JSON.parse(row.task_profile) as Record<string, unknown>,
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
