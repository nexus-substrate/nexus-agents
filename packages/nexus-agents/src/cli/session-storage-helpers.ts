/**
 * nexus-agents/cli - Session Storage Helpers
 *
 * Helper functions for SQLite session storage operations.
 *
 * @module cli/session-storage-helpers
 * (Source: Issue #190)
 */

import type {
  ISQLiteDatabase,
  StoredSession,
  StoredTask,
  SessionSummary,
  SessionRow,
  TaskRow,
  SessionSummaryRow,
  SessionMetadata,
} from './session-storage-types.js';
import { SessionStatus, TaskStatus } from './session-storage-types.js';

// ============================================================================
// Table Creation Helpers
// ============================================================================

/**
 * Create the sessions table.
 */
export function createSessionsTable(db: ISQLiteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT CHECK(status IN ('active', 'completed', 'error')) NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);
}

/**
 * Create the tasks table.
 */
export function createTasksTable(db: ISQLiteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task TEXT NOT NULL,
      result TEXT,
      status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')) NOT NULL,
      duration_ms INTEGER,
      tokens_used INTEGER,
      cost_usd REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
}

/**
 * Create indexes for common queries.
 */
export function createSessionIndexes(db: ISQLiteDatabase): void {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)`);
}

// ============================================================================
// Row Conversion Helpers
// ============================================================================

/**
 * Parse session metadata from JSON string.
 */
export function parseSessionMetadata(metadataJson: string): SessionMetadata {
  try {
    return JSON.parse(metadataJson) as SessionMetadata;
  } catch {
    return {};
  }
}

/**
 * Convert a database row to a StoredSession.
 */
export function rowToSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status as SessionStatus,
    metadata: parseSessionMetadata(row.metadata),
  };
}

/**
 * Convert a database row to a StoredTask.
 */
export function rowToTask(row: TaskRow): StoredTask {
  return {
    id: row.id,
    sessionId: row.session_id,
    task: row.task,
    result: row.result ?? undefined,
    status: row.status as TaskStatus,
    durationMs: row.duration_ms ?? undefined,
    tokensUsed: row.tokens_used ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Convert a database row to a SessionSummary.
 */
export function rowToSessionSummary(row: SessionSummaryRow): SessionSummary {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status as SessionStatus,
    taskCount: row.task_count,
    totalDurationMs: row.total_duration_ms ?? 0,
    totalTokens: row.total_tokens ?? 0,
    totalCostUsd: row.total_cost_usd ?? 0,
  };
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ses_${timestamp}_${random}`;
}

/**
 * Generate a unique task ID.
 */
export function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `tsk_${timestamp}_${random}`;
}

// ============================================================================
// Timestamp Helpers
// ============================================================================

/**
 * Get current timestamp in ISO format (ET timezone aware).
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}
