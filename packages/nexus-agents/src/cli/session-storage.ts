/**
 * nexus-agents/cli - SQLite Session Storage
 *
 * Implements persistent storage for CLI sessions and tasks
 * using SQLite. Enables stateful multi-turn interactions.
 *
 * @module cli/session-storage
 * (Source: Issue #190 - CLI session persistence with SQLite)
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { ValidationError } from '../core/errors.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import {
  type ISessionStorage,
  type ISQLiteDatabase,
  type SessionStorageConfig,
  type StoredSession,
  type StoredTask,
  type SessionWithTasks,
  type SessionSummary,
  type SessionMetadata,
  type SessionStatus,
  type TaskStatus,
  type SessionRow,
  type TaskRow,
  type SessionSummaryRow,
  SessionStorageConfigSchema,
  SessionStorageError,
} from './session-storage-types.js';
import {
  createSessionsTable,
  createTasksTable,
  createSessionIndexes,
  rowToSession,
  rowToTask,
  rowToSessionSummary,
  generateSessionId,
  generateTaskId,
  getCurrentTimestamp,
} from './session-storage-helpers.js';

/**
 * SQLite-based session storage implementation.
 */
export class SQLiteSessionStorage implements ISessionStorage {
  private readonly dbPath: string;
  private readonly logger: ILogger;
  private readonly maxSessions: number;
  private db: ISQLiteDatabase | null = null;
  private initialized = false;

  constructor(config: SessionStorageConfig) {
    const validation = SessionStorageConfigSchema.safeParse(config);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new ValidationError(`Invalid SessionStorageConfig: ${issues}`, {
        context: { config, validationErrors: validation.error.issues },
      });
    }

    this.dbPath = config.dbPath;
    this.maxSessions = config.maxSessions ?? 1000;
    this.logger = config.logger ?? createLogger({ component: 'SessionStorage' });
  }

  /** Initialize with an existing database instance (for testing). */
  initializeWithDatabase(database: ISQLiteDatabase): void {
    this.db = database;
    this.createTables();
    this.initialized = true;
    this.logger.info('SQLiteSessionStorage initialized', { dbPath: this.dbPath });
  }

  /** Initialize the storage backend. */
  async initialize(): Promise<Result<void, SessionStorageError>> {
    if (this.initialized) return ok(undefined);

    try {
      const betterSqlite3Module = await import('better-sqlite3').catch(() => null);
      if (betterSqlite3Module === null) {
        return err(
          new SessionStorageError('better-sqlite3 is not installed. Run: pnpm add better-sqlite3', {
            context: { dbPath: this.dbPath },
          })
        );
      }

      const Database = betterSqlite3Module.default;
      this.db = new (Database as new (path: string) => ISQLiteDatabase)(this.dbPath);
      this.createTables();
      this.initialized = true;
      this.logger.info('SQLiteSessionStorage initialized', { dbPath: this.dbPath });
      return ok(undefined);
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize SQLiteSessionStorage', causeError);
      return err(
        new SessionStorageError('Failed to initialize session storage', {
          cause: causeError,
          context: { dbPath: this.dbPath },
        })
      );
    }
  }

  private createTables(): void {
    const database = this.getDatabase();
    createSessionsTable(database);
    createTasksTable(database);
    createSessionIndexes(database);
    this.logger.debug('Database tables created');
  }

  private getDatabase(): ISQLiteDatabase {
    if (this.db === null) throw new SessionStorageError('Database not initialized');
    return this.db;
  }

  private ensureInitialized(): void {
    if (!this.initialized || this.db === null) {
      throw new SessionStorageError(
        'SQLiteSessionStorage not initialized. Call initialize() first.'
      );
    }
  }

  createSession(metadata?: SessionMetadata): Promise<Result<StoredSession, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const id = generateSessionId();
      const now = getCurrentTimestamp();
      const metadataJson = JSON.stringify(metadata ?? {});

      database
        .prepare(
          `INSERT INTO sessions (id, created_at, updated_at, status, metadata) VALUES (?, ?, ?, ?, ?)`
        )
        .run(id, now, now, 'active', metadataJson);

      const session: StoredSession = {
        id,
        createdAt: now,
        updatedAt: now,
        status: 'active',
        metadata: metadata ?? {},
      };

      this.logger.debug('Created session', { id });
      return Promise.resolve(ok(session));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to create session', causeError);
      return Promise.resolve(
        err(new SessionStorageError('Failed to create session', { cause: causeError }))
      );
    }
  }

  getSession(id: string): Promise<Result<StoredSession | null, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const row = this.getDatabase()
        .prepare<SessionRow>(`SELECT * FROM sessions WHERE id = ?`)
        .get(id);
      return Promise.resolve(ok(row === undefined ? null : rowToSession(row)));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to get session', { cause: causeError }))
      );
    }
  }

  getSessionWithTasks(id: string): Promise<Result<SessionWithTasks | null, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const sessionRow = database
        .prepare<SessionRow>(`SELECT * FROM sessions WHERE id = ?`)
        .get(id);
      if (sessionRow === undefined) return Promise.resolve(ok(null));

      const taskRows = database
        .prepare<TaskRow>(`SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC`)
        .all(id);

      const session = rowToSession(sessionRow);
      const tasks = taskRows.map(rowToTask);

      return Promise.resolve(ok({ ...session, tasks }));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to get session with tasks', { cause: causeError }))
      );
    }
  }

  updateSessionStatus(
    id: string,
    status: SessionStatus
  ): Promise<Result<void, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const now = getCurrentTimestamp();
      this.getDatabase()
        .prepare(`UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`)
        .run(status, now, id);
      this.logger.debug('Updated session status', { id, status });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to update session status', { cause: causeError }))
      );
    }
  }

  updateSessionMetadata(
    id: string,
    metadata: SessionMetadata
  ): Promise<Result<void, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const now = getCurrentTimestamp();
      const metadataJson = JSON.stringify(metadata);
      this.getDatabase()
        .prepare(`UPDATE sessions SET metadata = ?, updated_at = ? WHERE id = ?`)
        .run(metadataJson, now, id);
      this.logger.debug('Updated session metadata', { id });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to update session metadata', { cause: causeError }))
      );
    }
  }

  listSessions(limit?: number): Promise<Result<SessionSummary[], SessionStorageError>> {
    try {
      this.ensureInitialized();
      const effectiveLimit = limit ?? this.maxSessions;
      const rows = this.getDatabase()
        .prepare<SessionSummaryRow>(
          `
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
        `
        )
        .all(effectiveLimit);
      return Promise.resolve(ok(rows.map(rowToSessionSummary)));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to list sessions', { cause: causeError }))
      );
    }
  }

  addTask(sessionId: string, task: string): Promise<Result<StoredTask, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const id = generateTaskId();
      const now = getCurrentTimestamp();

      database
        .prepare(
          `INSERT INTO tasks (id, session_id, task, status, created_at) VALUES (?, ?, ?, ?, ?)`
        )
        .run(id, sessionId, task, 'pending', now);

      // Update session timestamp
      database.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sessionId);

      const storedTask: StoredTask = {
        id,
        sessionId,
        task,
        status: 'pending',
        createdAt: now,
      };

      this.logger.debug('Added task', { id, sessionId });
      return Promise.resolve(ok(storedTask));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to add task', { cause: causeError }))
      );
    }
  }

  updateTask(
    taskId: string,
    update: {
      result?: string;
      status: TaskStatus;
      durationMs?: number;
      tokensUsed?: number;
      costUsd?: number;
    }
  ): Promise<Result<void, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();

      database
        .prepare(
          `
          UPDATE tasks
          SET result = COALESCE(?, result),
              status = ?,
              duration_ms = COALESCE(?, duration_ms),
              tokens_used = COALESCE(?, tokens_used),
              cost_usd = COALESCE(?, cost_usd)
          WHERE id = ?
        `
        )
        .run(
          update.result ?? null,
          update.status,
          update.durationMs ?? null,
          update.tokensUsed ?? null,
          update.costUsd ?? null,
          taskId
        );

      this.logger.debug('Updated task', { taskId, status: update.status });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to update task', { cause: causeError }))
      );
    }
  }

  getTasks(sessionId: string): Promise<Result<StoredTask[], SessionStorageError>> {
    try {
      this.ensureInitialized();
      const rows = this.getDatabase()
        .prepare<TaskRow>(`SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC`)
        .all(sessionId);
      return Promise.resolve(ok(rows.map(rowToTask)));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to get tasks', { cause: causeError }))
      );
    }
  }

  deleteSession(id: string): Promise<Result<boolean, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      // Tasks deleted via CASCADE
      const result = database.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
      const deleted = result.changes > 0;
      if (deleted) this.logger.info('Deleted session', { id });
      return Promise.resolve(ok(deleted));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to delete session', { cause: causeError }))
      );
    }
  }

  prune(olderThan: Date): Promise<Result<number, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const cutoff = olderThan.toISOString();
      const result = this.getDatabase()
        .prepare(`DELETE FROM sessions WHERE updated_at < ?`)
        .run(cutoff);
      this.logger.info('Pruned old sessions', { count: result.changes, cutoff });
      return Promise.resolve(ok(result.changes));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to prune sessions', { cause: causeError }))
      );
    }
  }

  getStats(): Promise<Result<{ sessions: number; tasks: number }, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const sessions =
        database.prepare<{ count: number }>('SELECT COUNT(*) as count FROM sessions').get()
          ?.count ?? 0;
      const tasks =
        database.prepare<{ count: number }>('SELECT COUNT(*) as count FROM tasks').get()?.count ??
        0;
      return Promise.resolve(ok({ sessions, tasks }));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to get stats', { cause: causeError }))
      );
    }
  }

  close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.logger.info('SQLiteSessionStorage closed');
    }
  }
}

/** Create a SQLite session storage instance. */
export function createSessionStorage(config: SessionStorageConfig): SQLiteSessionStorage {
  return new SQLiteSessionStorage(config);
}
