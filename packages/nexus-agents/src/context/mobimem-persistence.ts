/**
 * nexus-agents/context — MobiMem SQLite persistence helper.
 *
 * Closes #2719 (mobimem triple-disconnect). Pre-Phase 4 MobiMem's
 * `dbPath` config was a dead surface — the impl classes used pure
 * `Map<string, Entry>` and the `dbPath` was passed in but never opened.
 * `memory_stats` therefore read an empty SQLite file that nobody wrote
 * to, while routing-memory wrote to in-memory MobiMems that died on
 * process exit.
 *
 * This helper provides a tiny synchronous persistence side-channel: when
 * the impl class is constructed with a `better-sqlite3` Database, the
 * helper auto-creates a domain-specific table and exposes
 * `load`/`upsert`/`delete`/`clear`. Without a DB (default test mode),
 * every method is a no-op — the impl falls back to in-memory Maps.
 *
 * Why not route through `nexus-memory`'s `IMemoryBackend` directly:
 * `IMemoryBackend` is async per the Phase 2 vote, but MobiMem's existing
 * callers (`RoutingMemory.storePreference`, `recordExperience`, …) are
 * sync, and `KnnRoutingStage` (the consumer this fix unblocks) is sync
 * too. A sync side-channel that targets the same SQLite file `memory_stats`
 * reads from is the minimum-scope fix that closes #2719 without forcing
 * an async ripple across the routing pipeline.
 *
 * Phase 5+ migrations route their concept-spaces through the full
 * `IMemoryBackend` contract.
 *
 * @module context/mobimem-persistence
 */

import type Database from 'better-sqlite3';
type DatabaseType = InstanceType<typeof Database>;
// Statement type is namespace-scoped in better-sqlite3 7.x; reach it via the
// instance's `prepare` return type to keep the surface narrow.
type Statement = ReturnType<DatabaseType['prepare']>;

export interface MobiMemPersistenceOptions {
  /** SQLite handle. Pass `null` for in-memory-only mode (tests). */
  readonly db: DatabaseType | null;
  /** Domain identifier — becomes the SQLite table name. Validated against `[a-z_]`. */
  readonly domain: string;
}

/**
 * Tiny CRUD helper backing a single MobiMem impl's Map cache. JSON-serializes
 * values; every column other than `key`/`value` is for forward-compat with
 * the broader memory-events scheme.
 */
export class MobiMemPersistence<TValue> {
  readonly active: boolean;
  private readonly db: DatabaseType | null;
  private readonly domain: string;
  private readonly stmts: {
    upsert: Statement;
    delete: Statement;
    clear: Statement;
    selectAll: Statement;
  } | null;

  constructor(options: MobiMemPersistenceOptions) {
    this.db = options.db;
    this.domain = options.domain;
    this.active = options.db !== null;
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(options.domain)) {
      throw new Error(
        `mobimem-persistence: invalid domain "${options.domain}" — must match [a-zA-Z][a-zA-Z0-9_]{0,63}`
      );
    }
    if (this.active && this.db !== null) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${options.domain} (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ${options.domain}_timestamp ON ${options.domain}(timestamp);
      `);
      this.stmts = {
        upsert: this.db.prepare(
          `INSERT INTO ${options.domain} (key, value, timestamp) VALUES (@key, @value, @timestamp)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp`
        ),
        delete: this.db.prepare(`DELETE FROM ${options.domain} WHERE key = ?`),
        clear: this.db.prepare(`DELETE FROM ${options.domain}`),
        selectAll: this.db.prepare(`SELECT key, value FROM ${options.domain}`),
      };
    } else {
      this.stmts = null;
    }
  }

  /** Hydrate the impl's Map cache from SQLite. No-op when inactive. */
  load(): readonly [string, TValue][] {
    if (this.stmts === null) return [];
    const rows = this.stmts.selectAll.all() as { key: string; value: string }[];
    return rows.map((r) => [r.key, JSON.parse(r.value) as TValue]);
  }

  /** Upsert a single row. No-op when inactive. */
  upsert(key: string, value: TValue): void {
    if (this.stmts === null) return;
    this.stmts.upsert.run({
      key,
      value: JSON.stringify(value),
      timestamp: Date.now(),
    });
  }

  /** Delete a single row. No-op when inactive. */
  delete(key: string): void {
    if (this.stmts === null) return;
    this.stmts.delete.run(key);
  }

  /** Wipe the table. No-op when inactive. */
  clear(): void {
    if (this.stmts === null) return;
    this.stmts.clear.run();
  }
}
