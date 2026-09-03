/**
 * nexus-agents/context - Hybrid Memory Backend
 *
 * Implements hybrid memory storage using SQLite for fast retrieval
 * and full-text search, with Markdown export for human-readable
 * high-importance memories.
 *
 * @module context/memory-backend
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { getTimeProvider, formatZodError } from '../core/index.js';
import { ValidationError } from '../core/errors.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import {
  type HybridMemoryConfig,
  type IMemoryBackend,
  type ISQLiteDatabase,
  type MemoryEntry,
  type MemoryMetadata,
  type MemoryRow,
  HybridMemoryConfigSchema,
  MemoryError,
  MemoryImportance,
  MemoryMetadataSchema,
} from './memory-backend-types.js';
import { MemoryMarkdownHelper } from './memory-markdown.js';
import {
  sanitizeFtsQuery,
  cleanupExpiredEntries,
  countMemories,
  expireAllEntries,
  pruneOldEntries,
} from './memory-operations.js';

// Re-export types for convenience
export {
  type HybridMemoryConfig,
  type IMemoryBackend,
  type ISQLiteDatabase,
  type ISQLiteStatement,
  type MemoryEntry,
  type MemoryMetadata,
  type MemoryRow,
  HybridMemoryConfigSchema,
  MemoryEntrySchema,
  MemoryError,
  MemoryImportance,
  MemoryImportanceSchema,
  MemoryMetadataSchema,
} from './memory-backend-types.js';
import { openSqliteDatabase } from './open-database.js';

/**
 * Hybrid memory backend using SQLite for storage and Markdown for export.
 */
export class HybridMemoryBackend implements IMemoryBackend {
  private readonly dbPath: string;
  private readonly logger: ILogger;
  private readonly autoExpire: boolean;
  private readonly markdown: MemoryMarkdownHelper;
  private db: ISQLiteDatabase | null = null;
  private initialized = false;
  private initPromise: Promise<Result<void, MemoryError>> | undefined;

  constructor(config: HybridMemoryConfig) {
    const validation = HybridMemoryConfigSchema.safeParse(config);
    if (!validation.success) {
      throw new ValidationError(
        `Invalid HybridMemoryBackend config: ${formatZodError(validation.error)}`,
        {
          context: { config, validationErrors: validation.error.issues },
        }
      );
    }

    this.dbPath = config.dbPath;
    this.logger = config.logger ?? createLogger({ component: 'HybridMemoryBackend' });
    this.autoExpire = config.autoExpire ?? true;
    this.markdown = new MemoryMarkdownHelper(config.markdownDir, this.logger);
  }

  initializeWithDatabase(database: ISQLiteDatabase): void {
    this.db = database;
    this.createTables();
    this.markdown.ensureDir();
    this.initialized = true;
    this.logger.info('HybridMemoryBackend initialized', { dbPath: this.dbPath });
  }

  async initialize(): Promise<Result<void, MemoryError>> {
    if (this.initialized) return ok(undefined);
    this.initPromise ??= this.doInitialize().finally(() => {
      this.initPromise = undefined;
    });
    return this.initPromise;
  }
  // Stays async: this is a published Promise-returning API and its callers
  // await it. The only await was the dynamic `better-sqlite3` import, which
  // #5388 removed because `node:sqlite` is a synchronous builtin.
  // eslint-disable-next-line @typescript-eslint/require-await
  private async doInitialize(): Promise<Result<void, MemoryError>> {
    try {
      this.db = openSqliteDatabase(this.dbPath);
      this.createTables();
      this.markdown.ensureDir();
      this.initialized = true;
      this.logger.info('HybridMemoryBackend initialized', { dbPath: this.dbPath });
      return ok(undefined);
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize HybridMemoryBackend', causeError);
      return err(
        new MemoryError('Failed to initialize memory backend', {
          cause: causeError,
          context: { dbPath: this.dbPath },
        })
      );
    }
  }

  private createTables(): void {
    const database = this.getDatabase();
    database.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL, accessed_at INTEGER NOT NULL, expires_at INTEGER
      )
    `);
    database.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        key, value, tags, content='memories', content_rowid='rowid'
      )
    `);
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, key, value, tags)
        SELECT rowid, NEW.key, NEW.value, json_extract(NEW.metadata, '$.tags') FROM memories WHERE key = NEW.key;
      END
    `);
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, value, tags)
        VALUES('delete', OLD.rowid, OLD.key, OLD.value, json_extract(OLD.metadata, '$.tags'));
      END
    `);
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, value, tags)
        VALUES('delete', OLD.rowid, OLD.key, OLD.value, json_extract(OLD.metadata, '$.tags'));
        INSERT INTO memories_fts(rowid, key, value, tags)
        SELECT rowid, NEW.key, NEW.value, json_extract(NEW.metadata, '$.tags') FROM memories WHERE key = NEW.key;
      END
    `);
    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at) WHERE expires_at IS NOT NULL`
    );
    database.exec(`CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)`);
    this.logger.debug('Database tables created');
  }

  private getDatabase(): ISQLiteDatabase {
    if (this.db === null) throw new MemoryError('Database not initialized');
    return this.db;
  }

  private ensureInitialized(): void {
    if (!this.initialized || this.db === null) {
      throw new MemoryError('HybridMemoryBackend not initialized. Call initialize() first.');
    }
  }

  async store(
    key: string,
    value: unknown,
    metadata: MemoryMetadata
  ): Promise<Result<void, MemoryError>> {
    try {
      this.ensureInitialized();
      const keyValidation = z.string().min(1).safeParse(key);
      if (!keyValidation.success)
        return err(new MemoryError('Invalid key: must be non-empty string', { context: { key } }));

      const metadataValidation = MemoryMetadataSchema.safeParse(metadata);
      if (!metadataValidation.success)
        return err(
          new MemoryError('Invalid metadata', {
            context: { metadata, errors: metadataValidation.error.issues },
          })
        );

      const now = getTimeProvider().now();
      const expiresAt = metadata.ttl !== undefined ? now + metadata.ttl : null;
      const database = this.getDatabase();

      const stmt = database.prepare<MemoryRow>(
        `INSERT OR REPLACE INTO memories (key, value, metadata, created_at, accessed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
      );
      stmt.run(key, JSON.stringify(value), JSON.stringify(metadata), now, now, expiresAt);

      this.logger.debug('Stored memory', { key, importance: metadata.importance });
      if (metadata.importance === MemoryImportance.HIGH)
        await this.markdown.write(key, value, metadata, new Date(now));

      return ok(undefined);
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to store memory', causeError, { key });
      return err(
        new MemoryError('Failed to store memory', { cause: causeError, context: { key } })
      );
    }
  }

  retrieve(key: string): Promise<Result<unknown, MemoryError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const stmt = database.prepare<MemoryRow>(
        `SELECT key, value, metadata, created_at, accessed_at, expires_at FROM memories WHERE key = ?`
      );
      const row = stmt.get(key);

      if (row === undefined) return Promise.resolve(ok(null));
      if (this.autoExpire && row.expires_at !== null && row.expires_at < getTimeProvider().now()) {
        database.prepare('DELETE FROM memories WHERE key = ?').run(key);
        this.logger.debug('Auto-expired memory', { key });
        return Promise.resolve(ok(null));
      }
      database
        .prepare('UPDATE memories SET accessed_at = ? WHERE key = ?')
        .run(getTimeProvider().now(), key);
      return Promise.resolve(ok(JSON.parse(row.value) as unknown));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to retrieve memory', causeError, { key });
      return Promise.resolve(
        err(new MemoryError('Failed to retrieve memory', { cause: causeError, context: { key } }))
      );
    }
  }

  search(query: string, limit: number): Promise<Result<MemoryEntry[], MemoryError>> {
    try {
      this.ensureInitialized();
      if (limit <= 0 || limit > 1000)
        return Promise.resolve(
          err(new MemoryError('Invalid limit: must be between 1 and 1000', { context: { limit } }))
        );

      const sanitizedQuery = sanitizeFtsQuery(query);
      if (sanitizedQuery.length === 0) return Promise.resolve(ok([]));

      const database = this.getDatabase();
      const stmt = database.prepare<MemoryRow>(`
        SELECT m.key, m.value, m.metadata, m.created_at, m.accessed_at, m.expires_at
        FROM memories m INNER JOIN memories_fts fts ON m.rowid = fts.rowid
        WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?
      `);
      const rows = stmt.all(sanitizedQuery, limit);
      const { entries } = cleanupExpiredEntries(rows, database, this.autoExpire, this.logger);
      return Promise.resolve(ok(entries));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to search memories', causeError, { query });
      return Promise.resolve(
        err(
          new MemoryError('Failed to search memories', {
            cause: causeError,
            context: { query, limit },
          })
        )
      );
    }
  }

  prune(olderThan: Date): Promise<Result<number, MemoryError>> {
    this.ensureInitialized();
    const result = pruneOldEntries(this.getDatabase(), olderThan, this.logger);
    // #3112: prune deletes SQLite rows but not their Markdown sidecars; clean
    // up orphaned files so the markdown dir stays bounded under decay.
    if (result.ok && result.value > 0) this.reconcileMarkdown();
    return Promise.resolve(result);
  }

  expireAll(): Promise<Result<number, MemoryError>> {
    this.ensureInitialized();
    const result = expireAllEntries(this.getDatabase(), this.logger);
    if (result.ok && result.value > 0) this.reconcileMarkdown();
    return Promise.resolve(result);
  }

  /**
   * Remove Markdown sidecars whose key no longer exists in SQLite (#3112).
   * Covers every row-deletion path (prune / expire / auto-expire) uniformly,
   * not just the explicit `delete()`. Best-effort.
   */
  private reconcileMarkdown(): void {
    try {
      const rows = this.getDatabase().prepare('SELECT key FROM memories').all() as Array<{
        key: string;
      }>;
      this.markdown.reconcile(rows.map((r) => r.key));
    } catch (error) {
      this.logger.warn('Markdown reconcile query failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  delete(key: string): Promise<Result<boolean, MemoryError>> {
    try {
      this.ensureInitialized();
      const result = this.getDatabase().prepare('DELETE FROM memories WHERE key = ?').run(key);
      if (result.changes > 0) {
        this.markdown.delete(key);
        this.logger.debug('Deleted memory', { key });
        return Promise.resolve(ok(true));
      }
      return Promise.resolve(ok(false));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to delete memory', causeError, { key });
      return Promise.resolve(
        err(new MemoryError('Failed to delete memory', { cause: causeError, context: { key } }))
      );
    }
  }

  getAll(limit = 100): Promise<Result<MemoryEntry[], MemoryError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const rows = database
        .prepare<MemoryRow>(
          `SELECT key, value, metadata, created_at, accessed_at, expires_at FROM memories ORDER BY accessed_at DESC LIMIT ?`
        )
        .all(limit);
      const { entries } = cleanupExpiredEntries(rows, database, this.autoExpire, this.logger);
      return Promise.resolve(ok(entries));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to get all memories', causeError);
      return Promise.resolve(
        err(new MemoryError('Failed to get all memories', { cause: causeError }))
      );
    }
  }

  count(): Promise<Result<number, MemoryError>> {
    this.ensureInitialized();
    return Promise.resolve(countMemories(this.getDatabase()));
  }

  close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.logger.info('HybridMemoryBackend closed');
    }
  }
}
