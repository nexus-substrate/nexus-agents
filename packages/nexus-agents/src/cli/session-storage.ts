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
import { ValidationError, toError } from '../core/errors.js';
import { formatZodError } from '../core/zod-helpers.js';
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
  SQL_INSERT_SESSION,
  SQL_GET_SESSION,
  SQL_UPDATE_SESSION_STATUS,
  SQL_UPDATE_SESSION_METADATA,
  SQL_UPDATE_SESSION_TIMESTAMP,
  SQL_LIST_SESSIONS,
  SQL_DELETE_SESSION,
  SQL_PRUNE_SESSIONS,
  SQL_COUNT_SESSIONS,
  SQL_INSERT_TASK,
  SQL_GET_TASKS,
  SQL_UPDATE_TASK,
  SQL_COUNT_TASKS,
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
      throw new ValidationError(
        `Invalid SessionStorageConfig: ${formatZodError(validation.error)}`,
        {
          context: { config, validationErrors: validation.error.issues },
        }
      );
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
      const betterSqlite3Module = await import('better-sqlite3').catch((error: unknown) => {
        this.logger.debug('Failed to import better-sqlite3', { error: String(error) });
        return null;
      });
      if (betterSqlite3Module === null) {
        return err(
          new SessionStorageError(
            'better-sqlite3 not installed. Install: npm install better-sqlite3',
            {
              context: { dbPath: this.dbPath },
            }
          )
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
      const id = generateSessionId();
      const now = getCurrentTimestamp();
      const metadataJson = JSON.stringify(metadata ?? {});

      this.getDatabase().prepare(SQL_INSERT_SESSION).run(id, now, now, 'active', metadataJson);

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
      this.logger.error('Failed to create session', toError(error));
      return Promise.resolve(
        err(new SessionStorageError('Failed to create session', { cause: toError(error) }))
      );
    }
  }

  getSession(id: string): Promise<Result<StoredSession | null, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const row = this.getDatabase().prepare<SessionRow>(SQL_GET_SESSION).get(id);
      return Promise.resolve(ok(row === undefined ? null : rowToSession(row)));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to get session', { cause: toError(error) }))
      );
    }
  }

  getSessionWithTasks(id: string): Promise<Result<SessionWithTasks | null, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const sessionRow = database.prepare<SessionRow>(SQL_GET_SESSION).get(id);
      if (sessionRow === undefined) return Promise.resolve(ok(null));

      const taskRows = database.prepare<TaskRow>(SQL_GET_TASKS).all(id);
      const session = rowToSession(sessionRow);
      const tasks = taskRows.map(rowToTask);

      return Promise.resolve(ok({ ...session, tasks }));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to get session with tasks', { cause: toError(error) }))
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
      this.getDatabase().prepare(SQL_UPDATE_SESSION_STATUS).run(status, now, id);
      this.logger.debug('Updated session status', { id, status });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to update session status', { cause: toError(error) }))
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
      this.getDatabase().prepare(SQL_UPDATE_SESSION_METADATA).run(metadataJson, now, id);
      this.logger.debug('Updated session metadata', { id });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to update session metadata', { cause: toError(error) }))
      );
    }
  }

  listSessions(limit?: number): Promise<Result<SessionSummary[], SessionStorageError>> {
    try {
      this.ensureInitialized();
      const effectiveLimit = limit ?? this.maxSessions;
      const rows = this.getDatabase()
        .prepare<SessionSummaryRow>(SQL_LIST_SESSIONS)
        .all(effectiveLimit);
      return Promise.resolve(ok(rows.map(rowToSessionSummary)));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to list sessions', { cause: toError(error) }))
      );
    }
  }

  addTask(sessionId: string, task: string): Promise<Result<StoredTask, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const id = generateTaskId();
      const now = getCurrentTimestamp();

      database.prepare(SQL_INSERT_TASK).run(id, sessionId, task, 'pending', now);
      database.prepare(SQL_UPDATE_SESSION_TIMESTAMP).run(now, sessionId);

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
      return Promise.resolve(
        err(new SessionStorageError('Failed to add task', { cause: toError(error) }))
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
      this.getDatabase()
        .prepare(SQL_UPDATE_TASK)
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
      return Promise.resolve(
        err(new SessionStorageError('Failed to update task', { cause: toError(error) }))
      );
    }
  }

  getTasks(sessionId: string): Promise<Result<StoredTask[], SessionStorageError>> {
    try {
      this.ensureInitialized();
      const rows = this.getDatabase().prepare<TaskRow>(SQL_GET_TASKS).all(sessionId);
      return Promise.resolve(ok(rows.map(rowToTask)));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to get tasks', { cause: toError(error) }))
      );
    }
  }

  deleteSession(id: string): Promise<Result<boolean, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const result = this.getDatabase().prepare(SQL_DELETE_SESSION).run(id);
      const deleted = result.changes > 0;
      if (deleted) this.logger.info('Deleted session', { id });
      return Promise.resolve(ok(deleted));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to delete session', { cause: toError(error) }))
      );
    }
  }

  prune(olderThan: Date): Promise<Result<number, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const cutoff = olderThan.toISOString();
      const result = this.getDatabase().prepare(SQL_PRUNE_SESSIONS).run(cutoff);
      this.logger.info('Pruned old sessions', { count: result.changes, cutoff });
      return Promise.resolve(ok(result.changes));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to prune sessions', { cause: toError(error) }))
      );
    }
  }

  getStats(): Promise<Result<{ sessions: number; tasks: number }, SessionStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const sessions = database.prepare<{ count: number }>(SQL_COUNT_SESSIONS).get()?.count ?? 0;
      const tasks = database.prepare<{ count: number }>(SQL_COUNT_TASKS).get()?.count ?? 0;
      return Promise.resolve(ok({ sessions, tasks }));
    } catch (error) {
      return Promise.resolve(
        err(new SessionStorageError('Failed to get stats', { cause: toError(error) }))
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
