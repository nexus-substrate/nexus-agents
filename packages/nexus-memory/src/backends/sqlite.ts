/**
 * SQLite backend — async wrapper over `node:sqlite` (which is sync).
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

import type {
  SqliteDatabase as DatabaseType,
  SqliteStatement as Statement,
} from './open-database.js';
import type { z } from 'zod';
import { recordFailedMemoryOp, recordMemoryEvent } from '../telemetry.js';
import type { BackendStats, IMemoryBackend, JsonValue, QueryFilter, WriteMeta } from '../types.js';
import { assertStringKey, copyJson, MemoryReadError, validateMemoryValue } from '../json.js';
import { openSqliteDatabase } from './open-database.js';

export interface SqliteBackendOptions<TValue extends JsonValue> {
  readonly domain: string;
  /** Absolute path to the SQLite file. Use `':memory:'` for tests. */
  readonly dbPath: string;
  /**
   * Zod schema for cold-archive validation (Phase 2 vote mitigation #1).
   * When supplied, writes, reads, and queries validate the stored shape. Invalid stored rows throw MemoryReadError with the domain and row key.
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
  key: string,
  value: JsonValue,
  meta: WriteMeta | undefined
): Record<string, string | number | null> {
  return {
    key,
    value: JSON.stringify(value),
    cli: meta?.cli ?? null,
    source: meta?.source ?? null,
    timestamp: meta?.timestamp ?? Date.now(),
    trust_tier: meta?.trustTier ?? null,
  };
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

export class SqliteBackend<TKey extends string, TValue extends JsonValue> implements IMemoryBackend<
  TKey,
  TValue
> {
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
      // #3995: open via the shared helper, which creates the parent dir
      // first (fresh-install robustness) and enables WAL mode.
      this.db = openSqliteDatabase(options.dbPath);
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
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'read',
      },
      start,
      () => {
        this.assertOpen();
        assertStringKey(key, this.domain);
        const row = this.stmts.read.get(key) as SqliteRow | undefined;
        const value = row !== undefined ? this.decodeRow(row) : undefined;
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
    );
  }

  private decodeRow(row: SqliteRow): TValue {
    try {
      const value: unknown = JSON.parse(row.value);
      return copyJson(validateMemoryValue<TValue>(value, this.domain, this.schema));
    } catch (cause: unknown) {
      throw new MemoryReadError(this.domain, row.key, cause);
    }
  }

  async write(key: TKey, value: TValue, meta?: WriteMeta): Promise<void> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'write',
        ...(meta?.cli !== undefined && { cli: meta.cli }),
      },
      start,
      () => {
        this.assertOpen();
        assertStringKey(key, this.domain);
        const copy = validateMemoryValue(value, this.domain, this.schema);
        this.stmts.write.run(buildWriteRow(key, copy, meta));
        recordMemoryEvent({
          domain: this.domain,
          op: 'write',
          ...(meta?.cli !== undefined && { cli: meta.cli }),
          durationMs: Date.now() - start,
          key,
          payload: copy,
        });
        return Promise.resolve();
      }
    );
  }

  async query(filter?: QueryFilter<TValue>): Promise<readonly TValue[]> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'query',
        ...(filter?.cli !== undefined && { cli: filter.cli }),
      },
      start,
      () => {
        this.assertOpen();
        // Phase 3 keeps query simple — full table scan with in-process filter.
        // Hot-path backends will override or extend with indexed columns.
        let rows = this.stmts.queryAll.all() as SqliteRow[];
        if (filter?.cli !== undefined) {
          rows = rows.filter((r) => r.cli === filter.cli);
        }
        let values = rows.map((r) => this.decodeRow(r));
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
    );
  }

  async delete(key: TKey): Promise<boolean> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'delete',
      },
      start,
      () => {
        this.assertOpen();
        assertStringKey(key, this.domain);
        const result = this.stmts.delete.run(key);
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
    );
  }

  async stats(): Promise<BackendStats> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'stats',
      },
      start,
      () => {
        this.assertOpen();
        const countRow = this.stmts.count.get() as { count: number };
        const boundsRow = this.stmts.bounds.get() as {
          oldest: number | null;
          newest: number | null;
        };
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
    );
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
