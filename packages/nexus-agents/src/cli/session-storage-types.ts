/**
 * nexus-agents/cli - Session Storage Types
 *
 * Type definitions for SQLite-based CLI session persistence.
 * Enables stateful multi-turn interactions and audit trails.
 *
 * @module cli/session-storage-types
 * (Source: Issue #190 - CLI session persistence with SQLite)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import { NexusError, ErrorCode } from '../core/errors.js';
import type { ILogger } from '../core/logger.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error class for session storage operations.
 */
export class SessionStorageError extends NexusError {
  constructor(
    message: string,
    options?: Partial<
      Omit<{ code: ErrorCode; cause?: Error; context?: Record<string, unknown> }, 'code'>
    >
  ) {
    super(message, { code: ErrorCode.INTERNAL_ERROR, ...options });
    this.name = 'SessionStorageError';
  }
}

// ============================================================================
// Session Status
// ============================================================================

/**
 * Session status values.
 */
export const SessionStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

/**
 * Task status values.
 */
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session metadata stored as JSON.
 */
export interface SessionMetadata {
  /** CLI version */
  cliVersion?: string | undefined;
  /** User-defined tags */
  tags?: string[] | undefined;
  /** Parent session ID for continuation */
  parentSessionId?: string | undefined;
  /** Custom key-value data */
  custom?: Record<string, unknown> | undefined;
}

/**
 * Stored session record.
 */
export interface StoredSession {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: SessionStatus;
  readonly metadata: SessionMetadata;
}

/**
 * Stored task record.
 */
export interface StoredTask {
  readonly id: string;
  readonly sessionId: string;
  readonly task: string;
  readonly result?: string | undefined;
  readonly status: TaskStatus;
  readonly durationMs?: number | undefined;
  readonly tokensUsed?: number | undefined;
  readonly costUsd?: number | undefined;
  readonly createdAt: string;
}

/**
 * Session with its tasks.
 */
export interface SessionWithTasks extends StoredSession {
  readonly tasks: readonly StoredTask[];
}

/**
 * Session summary for list display.
 */
export interface SessionSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: SessionStatus;
  readonly taskCount: number;
  readonly totalDurationMs: number;
  readonly totalTokens: number;
  readonly totalCostUsd: number;
}

// ============================================================================
// SQLite Row Types
// ============================================================================

/**
 * Row structure in sessions table.
 */
export interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  metadata: string;
}

/**
 * Row structure in tasks table.
 */
export interface TaskRow {
  id: string;
  session_id: string;
  task: string;
  result: string | null;
  status: string;
  duration_ms: number | null;
  tokens_used: number | null;
  cost_usd: number | null;
  created_at: string;
}

/**
 * Row structure for session summary query.
 */
export interface SessionSummaryRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  task_count: number;
  total_duration_ms: number | null;
  total_tokens: number | null;
  total_cost_usd: number | null;
}

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Interface for session storage implementations.
 */
export interface ISessionStorage {
  /** Create a new session. */
  createSession(metadata?: SessionMetadata): Promise<Result<StoredSession, SessionStorageError>>;

  /** Get a session by ID. */
  getSession(id: string): Promise<Result<StoredSession | null, SessionStorageError>>;

  /** Get a session with all its tasks. */
  getSessionWithTasks(id: string): Promise<Result<SessionWithTasks | null, SessionStorageError>>;

  /** Update session status. */
  updateSessionStatus(
    id: string,
    status: SessionStatus
  ): Promise<Result<void, SessionStorageError>>;

  /** Update session metadata. */
  updateSessionMetadata(
    id: string,
    metadata: SessionMetadata
  ): Promise<Result<void, SessionStorageError>>;

  /** List sessions with summaries. */
  listSessions(limit?: number): Promise<Result<SessionSummary[], SessionStorageError>>;

  /** Add a task to a session. */
  addTask(sessionId: string, task: string): Promise<Result<StoredTask, SessionStorageError>>;

  /** Update task with result. */
  updateTask(
    taskId: string,
    update: {
      result?: string;
      status: TaskStatus;
      durationMs?: number;
      tokensUsed?: number;
      costUsd?: number;
    }
  ): Promise<Result<void, SessionStorageError>>;

  /** Get tasks for a session. */
  getTasks(sessionId: string): Promise<Result<StoredTask[], SessionStorageError>>;

  /** Delete a session and its tasks. */
  deleteSession(id: string): Promise<Result<boolean, SessionStorageError>>;

  /** Prune old sessions. */
  prune(olderThan: Date): Promise<Result<number, SessionStorageError>>;

  /** Get storage statistics. */
  getStats(): Promise<Result<{ sessions: number; tasks: number }, SessionStorageError>>;

  /** Close the database connection. */
  close(): void;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for SQLite session storage.
 */
export interface SessionStorageConfig {
  /** Path to SQLite database file */
  dbPath: string;
  /** Optional logger instance */
  logger?: ILogger | undefined;
  /** Maximum sessions to retain (default: 1000) */
  maxSessions?: number | undefined;
}

/**
 * Zod schema for SessionStorageConfig validation.
 */
export const SessionStorageConfigSchema = z.object({
  dbPath: z.string().min(1),
  maxSessions: z.number().positive().optional(),
});

/**
 * Default configuration values.
 */
export const DEFAULT_SESSION_STORAGE_CONFIG = {
  maxSessions: 1000,
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
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
}
