/**
 * SQLite backend — async wrapper over `better-sqlite3` (which is sync).
 *
 * One table per domain (Phase 2 vote shape C, hot-table side). The schema
 * is intentionally minimal: `key`, `value` (JSON-serialized), `cli`,
 * `source`, `timestamp`, `trust_tier`. Hot-path backends extending this
 * will add typed columns and indexes for query performance.
 *
 * Async surface: every method returns `Promise<T>` so we can swap in a
 * network-backed implementation later without changing callers. The
 * actual SQLite ops are sync inside.
 *
 * @module nexus-memory/backends/sqlite
 */

import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import type { z } from 'zod';
import { recordMemoryEvent } from '../telemetry.js';
import type { BackendStats, IMemoryBackend, QueryFilter, WriteMeta } from '../types.js';
import { MemoryValidationError } from './memory.js';

export interface SqliteBackendOptions<TValue> {
  readonly domain: string;
  /** Absolute path to the SQLite file. Use `':memory:'` for tests. */
  readonly dbPath: string;
  /**
   * Zod schema for cold-archive validation (Phase 2 vote mitigation #1).
   * When supplied, every `write()` validates first.
   */
  readonly schema?: z.ZodType<TValue>;
  /** Pre-existing database handle. Used by `MemoryRegistry` to share a single connection. */
  readonly db?: DatabaseType;
}

interface SqliteRow {
  readonly key: string;
  readonly value: string;
  readonly cli: string | null;
  readonly source: string | null;
  readonly timestamp: number;
  readonly trust_tier: number | null;
}

function buildWriteRow(
  key: unknown,
  value: unknown,
  meta: WriteMeta | undefined
): Record<string, string | number | null> {
  return {
    key: keyToString(key),
    value: JSON.stringify(value),
    cli: meta?.cli ?? null,
    source: meta?.source ?? null,
    timestamp: meta?.timestamp ?? Date.now(),
    trust_tier: meta?.trustTier ?? null,
  };
}

/** Stringify a key so SQLite primary-key lookups stay simple. */
function keyToString(key: unknown): string {
  if (typeof key === 'string') return key;
  if (typeof key === 'number' || typeof key === 'boolean') return String(key);
  return JSON.stringify(key);
}

/** Apply `where`, `orderBy`, `limit` to an in-memory row set. Extracted from
 * `query` to satisfy the eslint complexity gate. */
function applyQueryFilter<T>(values: T[], filter?: QueryFilter<T>): T[] {
  let out = values;
  if (filter?.where !== undefined) {
    const where = filter.where;
    out = out.filter((v) => {
      for (const [k, expected] of Object.entries(where)) {
        if ((v as Record<string, unknown>)[k] !== expected) return false;
      }
      return true;
    });
  }
  if (filter?.orderBy !== undefined) {
    const orderBy = filter.orderBy;
    const dir = filter.orderDir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = (a as Record<string | symbol | number, unknown>)[orderBy];
      const bv = (b as Record<string | symbol | number, unknown>)[orderBy];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      return (av < bv ? -1 : 1) * dir;
    });
  }
  if (filter?.limit !== undefined) {
    out = out.slice(0, filter.limit);
  }
  return out;
}

export class SqliteBackend<TKey, TValue> implements IMemoryBackend<TKey, TValue> {
  readonly domain: string;
  private readonly db: DatabaseType;
  private readonly ownsDb: boolean;
  private readonly schema?: z.ZodType<TValue>;
  private readonly stmts: {
    read: Statement;
    write: Statement;
    delete: Statement;
    count: Statement;
    bounds: Statement;
    queryAll: Statement;
  };
  private closed = false;

  constructor(options: SqliteBackendOptions<TValue>) {
    this.domain = options.domain;
    if (options.db !== undefined) {
      this.db = options.db;
      this.ownsDb = false;
    } else {
      this.db = new Database(options.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.ownsDb = true;
    }
    if (options.schema !== undefined) {
      this.schema = options.schema;
    }
    this.ensureTable();
    this.stmts = this.prepareStatements();
  }

  private ensureTable(): void {
    // Table name = domain. Domain comes from in-tree code, never untrusted input,
    // so direct interpolation is safe; still validate the shape defensively.
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(this.domain)) {
      throw new Error(
        `nexus-memory: invalid domain "${this.domain}" — must match [a-zA-Z][a-zA-Z0-9_]{0,63}`
      );
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.domain} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        cli TEXT,
        source TEXT,
        timestamp INTEGER NOT NULL,
        trust_tier INTEGER
      );
      CREATE INDEX IF NOT EXISTS ${this.domain}_cli ON ${this.domain}(cli);
      CREATE INDEX IF NOT EXISTS ${this.domain}_timestamp ON ${this.domain}(timestamp);
    `);
  }

  private prepareStatements(): SqliteBackend<TKey, TValue>['stmts'] {
    return {
      read: this.db.prepare(
        `SELECT key, value, cli, source, timestamp, trust_tier FROM ${this.domain} WHERE key = ?`
      ),
      write: this.db.prepare(
        `INSERT INTO ${this.domain} (key, value, cli, source, timestamp, trust_tier)
         VALUES (@key, @value, @cli, @source, @timestamp, @trust_tier)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           cli = excluded.cli,
           source = excluded.source,
           timestamp = excluded.timestamp,
           trust_tier = excluded.trust_tier`
      ),
      delete: this.db.prepare(`DELETE FROM ${this.domain} WHERE key = ?`),
      count: this.db.prepare(`SELECT COUNT(*) AS count FROM ${this.domain}`),
      bounds: this.db.prepare(
        `SELECT MIN(timestamp) AS oldest, MAX(timestamp) AS newest FROM ${this.domain}`
      ),
      queryAll: this.db.prepare(
        `SELECT key, value, cli, source, timestamp, trust_tier FROM ${this.domain}`
      ),
    };
  }

  async read(key: TKey): Promise<TValue | undefined> {
    this.assertOpen();
    const start = Date.now();
    const row = this.stmts.read.get(keyToString(key)) as SqliteRow | undefined;
    const value = row !== undefined ? (JSON.parse(row.value) as TValue) : undefined;
    recordMemoryEvent({
      domain: this.domain,
      op: 'read',
      hit: value !== undefined,
      ...(row?.cli !== null && row?.cli !== undefined && { cli: row.cli as never }),
      durationMs: Date.now() - start,
      key,
      result: value,
    });
    return Promise.resolve(value);
  }

  private validate(value: TValue): void {
    if (this.schema === undefined) return;
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new MemoryValidationError(this.domain, result.error);
    }
  }

  async write(key: TKey, value: TValue, meta?: WriteMeta): Promise<void> {
    this.assertOpen();
    const start = Date.now();
    this.validate(value);
    this.stmts.write.run(buildWriteRow(key, value, meta));
    recordMemoryEvent({
      domain: this.domain,
      op: 'write',
      ...(meta?.cli !== undefined && { cli: meta.cli }),
      durationMs: Date.now() - start,
      key,
      payload: value,
    });
    return Promise.resolve();
  }

  async query(filter?: QueryFilter<TValue>): Promise<readonly TValue[]> {
    this.assertOpen();
    const start = Date.now();
    // Phase 3 keeps query simple — full table scan with in-process filter.
    // Hot-path backends will override or extend with indexed columns.
    let rows = this.stmts.queryAll.all() as SqliteRow[];
    if (filter?.cli !== undefined) {
      rows = rows.filter((r) => r.cli === filter.cli);
    }
    let values = rows.map((r) => JSON.parse(r.value) as TValue);
    values = applyQueryFilter(values, filter);
    recordMemoryEvent({
      domain: this.domain,
      op: 'query',
      hit: values.length > 0,
      ...(filter?.cli !== undefined && { cli: filter.cli }),
      durationMs: Date.now() - start,
      key: filter,
      result: { count: values.length },
    });
    return Promise.resolve(values);
  }

  async delete(key: TKey): Promise<boolean> {
    this.assertOpen();
    const start = Date.now();
    const result = this.stmts.delete.run(keyToString(key));
    const removed = result.changes > 0;
    recordMemoryEvent({
      domain: this.domain,
      op: 'delete',
      hit: removed,
      durationMs: Date.now() - start,
      key,
    });
    return Promise.resolve(removed);
  }

  async stats(): Promise<BackendStats> {
    this.assertOpen();
    const start = Date.now();
    const countRow = this.stmts.count.get() as { count: number };
    const boundsRow = this.stmts.bounds.get() as { oldest: number | null; newest: number | null };
    const result: BackendStats = {
      domain: this.domain,
      count: countRow.count,
      oldestTimestamp: boundsRow.oldest,
      newestTimestamp: boundsRow.newest,
    };
    recordMemoryEvent({
      domain: this.domain,
      op: 'stats',
      durationMs: Date.now() - start,
      result,
    });
    return Promise.resolve(result);
  }

  async close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    if (this.ownsDb) this.db.close();
    return Promise.resolve();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error(`nexus-memory: backend "${this.domain}" is closed`);
    }
  }
}
