/**
 * Shared helper for opening a SQLite connection on disk.
 *
 * Centralizes the two pre-#3995 concerns that were duplicated at every
 * `new Database(dbPath)` site in this package:
 *
 * 1. **Auto-create the parent directory.** SQLite throws
 *    `SQLITE_CANTOPEN` when the parent directory of `dbPath` does not exist
 *    (the classic fresh-install regression — the resolver hands back a path
 *    under `~/.nexus-agents/memory/` that nobody has created yet). We
 *    `mkdirSync(dirname(dbPath), { recursive: true })` first so opening the
 *    DB never throws merely because the directory is missing. `:memory:`
 *    (and the empty string) are pure in-memory handles with no parent dir, so
 *    they skip the mkdir.
 * 2. **WAL journal mode.** Keeps concurrent MCP-server + CLI readers coherent.
 *
 * Kept dep-free on purpose: nexus-memory must stay free of inter-package
 * imports so `nexus-eval-*` repos can reuse it. The canonical
 * `nexusDataPath` resolver lives in nexus-agents and injects the path here as
 * a plain string (see `getMemoryRegistry` wiring in nexus-agents). This helper
 * only guarantees that whatever absolute path it is handed is openable.
 *
 * @module nexus-memory/backends/open-database
 */

import { createRequire } from 'node:module';

/**
 * Loaded through `createRequire`, not a static import (#5392).
 *
 * A static `import ... from 'node:sqlite'` is HOISTED by the bundler to the top
 * of the emitted chunk, so it evaluates before any consumer code can run. Node
 * emits the SQLite `ExperimentalWarning` at IMPORT time, so that ordering made
 * the CLI's warning filter unable to fire at all. `createRequire` keeps the load
 * synchronous — which is why node:sqlite was chosen — while deferring it to
 * first call. Node caches the module, so repeat calls are free.
 */
const requireFromHere = createRequire(import.meta.url);

function loadSqlite(): typeof import('node:sqlite') {
  return requireFromHere('node:sqlite') as typeof import('node:sqlite');
}

/**
 * Result of running a prepared statement. Mirrors what both `node:sqlite` and
 * better-sqlite3 return, so consumers did not have to change (#5388).
 */
export interface SqliteRunResult {
  readonly changes: number | bigint;
  readonly lastInsertRowid: number | bigint;
}

/** Minimal prepared-statement surface this package actually uses. */
export interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/**
 * Minimal database surface this package actually uses.
 *
 * Declared locally rather than imported: nexus-memory stays free of
 * inter-package imports so `nexus-eval-*` repos can reuse it, and since #5388
 * there is no dependency to import a type FROM — `node:sqlite` is a builtin.
 */
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Open a SQLite database at `dbPath`, creating the parent directory
 * first (for on-disk paths) and enabling WAL journal mode.
 *
 * @param dbPath Absolute SQLite file path, or `':memory:'` / `''` for an
 *   in-memory database (no directory is created in that case).
 */
export function openSqliteDatabase(dbPath: string): SqliteDatabase {
  if (dbPath !== ':memory:' && dbPath !== '') {
    // Fresh-install robustness (#3995): opening under a missing parent throws SQLITE_CANTOPEN
    // when the parent dir is missing. Create it up front, idempotently.
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(dbPath);
  // `node:sqlite` has no `.pragma()` helper, so WAL goes through `exec`.
  db.exec('PRAGMA journal_mode = WAL');

  const narrowed = db as unknown as SqliteDatabase;
  return {
    exec: (sql: string) => {
      db.exec(sql);
    },
    prepare: narrowed.prepare.bind(narrowed),
    // better-sqlite3's `close()` is idempotent; `DatabaseSync`'s throws
    // `database is not open` on a second call, and shutdown paths here are
    // reentrant. Preserve the contract callers were written against (#5388).
    close: () => {
      if (db.isOpen) db.close();
    },
  };
}
