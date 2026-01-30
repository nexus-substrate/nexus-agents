/**
 * nexus-agents/cli - Session Storage Helpers
 *
 * Helper functions for SQLite session storage operations.
 *
 * @module cli/session-storage-helpers
 * (Source: Issue #190)
 */

import { getRandomProvider, getTimeProvider } from '../core/index.js';
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
  const time = getTimeProvider();
  const random = getRandomProvider();
  const timestamp = time.now().toString(36);
  const randomPart = random.random().toString(36).substring(2, 8);
  return `ses_${timestamp}_${randomPart}`;
}

/**
 * Generate a unique task ID.
 */
export function generateTaskId(): string {
  const time = getTimeProvider();
  const random = getRandomProvider();
  const timestamp = time.now().toString(36);
  const randomPart = random.random().toString(36).substring(2, 8);
  return `tsk_${timestamp}_${randomPart}`;
}

// ============================================================================
// Timestamp Helpers
// ============================================================================

/**
 * Get current timestamp in ISO format (ET timezone aware).
 */
export function getCurrentTimestamp(): string {
  return new Date(getTimeProvider().now()).toISOString();
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Convert unknown error to Error instance.
 * Used for wrapping errors in Result types.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// ============================================================================
// SQL Query Constants
// ============================================================================

/** Insert a new session. */
export const SQL_INSERT_SESSION = `
  INSERT INTO sessions (id, created_at, updated_at, status, metadata)
  VALUES (?, ?, ?, ?, ?)
`;

/** Get a session by ID. */
export const SQL_GET_SESSION = `SELECT * FROM sessions WHERE id = ?`;

/** Update session status. */
export const SQL_UPDATE_SESSION_STATUS = `
  UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?
`;

/** Update session metadata. */
export const SQL_UPDATE_SESSION_METADATA = `
  UPDATE sessions SET metadata = ?, updated_at = ? WHERE id = ?
`;

/** Update session timestamp. */
export const SQL_UPDATE_SESSION_TIMESTAMP = `
  UPDATE sessions SET updated_at = ? WHERE id = ?
`;

/** List sessions with task aggregates. */
export const SQL_LIST_SESSIONS = `
  SELECT
    s.id, s.created_at, s.updated_at, s.status,
    COUNT(t.id) as task_count,
    COALESCE(SUM(t.duration_ms), 0) as total_duration_ms,
    COALESCE(SUM(t.tokens_used), 0) as total_tokens,
    COALESCE(SUM(t.cost_usd), 0) as total_cost_usd
  FROM sessions s
  LEFT JOIN tasks t ON s.id = t.session_id
  GROUP BY s.id
  ORDER BY s.updated_at DESC
  LIMIT ?
`;

/** Delete a session by ID. */
export const SQL_DELETE_SESSION = `DELETE FROM sessions WHERE id = ?`;

/** Delete sessions older than a cutoff. */
export const SQL_PRUNE_SESSIONS = `DELETE FROM sessions WHERE updated_at < ?`;

/** Count sessions. */
export const SQL_COUNT_SESSIONS = `SELECT COUNT(*) as count FROM sessions`;

/** Insert a new task. */
export const SQL_INSERT_TASK = `
  INSERT INTO tasks (id, session_id, task, status, created_at)
  VALUES (?, ?, ?, ?, ?)
`;

/** Get tasks for a session. */
export const SQL_GET_TASKS = `
  SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC
`;

/** Update a task. */
export const SQL_UPDATE_TASK = `
  UPDATE tasks
  SET result = COALESCE(?, result),
      status = ?,
      duration_ms = COALESCE(?, duration_ms),
      tokens_used = COALESCE(?, tokens_used),
      cost_usd = COALESCE(?, cost_usd)
  WHERE id = ?
`;

/** Count tasks. */
export const SQL_COUNT_TASKS = `SELECT COUNT(*) as count FROM tasks`;
