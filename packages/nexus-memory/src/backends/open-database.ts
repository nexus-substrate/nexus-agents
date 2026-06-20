/**
 * Shared helper for opening a `better-sqlite3` connection on disk.
 *
 * Centralizes the two pre-#3995 concerns that were duplicated at every
 * `new Database(dbPath)` site in this package:
 *
 * 1. **Auto-create the parent directory.** `better-sqlite3` throws
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

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Open a `better-sqlite3` database at `dbPath`, creating the parent directory
 * first (for on-disk paths) and enabling WAL journal mode.
 *
 * @param dbPath Absolute SQLite file path, or `':memory:'` / `''` for an
 *   in-memory database (no directory is created in that case).
 */
export function openSqliteDatabase(dbPath: string): DatabaseType {
  if (dbPath !== ':memory:' && dbPath !== '') {
    // Fresh-install robustness (#3995): better-sqlite3 throws SQLITE_CANTOPEN
    // when the parent dir is missing. Create it up front, idempotently.
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  (db as unknown as { pragma(s: string): void }).pragma('journal_mode = WAL');
  return db;
}
