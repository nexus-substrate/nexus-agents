/**
 * nexus-agents/context - Canonical SQLite open helper (#5388)
 *
 * THE single place this package opens a SQLite database. `new DatabaseSync(...)`
 * belongs here and nowhere else — `scripts/check-memory-contract.ts` probes for
 * direct construction precisely so the engine stays swappable from one file.
 *
 * ## Why not better-sqlite3
 *
 * `better-sqlite3` builds its native binding in an `install` lifecycle script.
 * Where install scripts are blocked, the failure is silent then fatal:
 *
 * ```
 * $ npm install --ignore-scripts better-sqlite3@12.11.1   # exit 0 — SUCCEEDS
 * $ node -e "new (require('better-sqlite3'))(':memory:')"
 * Could not locate the bindings file. Tried: ...
 * ```
 *
 * The install reports success and the CLI dies at runtime, naming a bindings
 * path rather than the cause. Since `better-sqlite3` was a RUNTIME dependency
 * of two published packages, that reached end users.
 *
 * `node:sqlite` removes the failure mode rather than handling it: a builtin has
 * no install script and no native build to skip. It is also SYNCHRONOUS
 * (`DatabaseSync`), which is what makes this a drop-in — the alternative, making
 * better-sqlite3 optional and lazily imported, would have forced `async` through
 * `MobiMem`'s synchronous constructor and out into `RoutingMemory`.
 *
 * ## The cost, stated
 *
 * `node:sqlite` is EXPERIMENTAL on Node 22 and emits an `ExperimentalWarning` on
 * first use. The CLI entry point suppresses it; a consumer embedding this as a
 * library will see it. It also raises the floor to Node >= 22.5.0, which the
 * `engines` field records.
 *
 * @module context/open-database
 */

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { DatabaseSync } from 'node:sqlite';
import type { ISQLiteDatabase } from '../core/types/database-types.js';

/**
 * Loaded through `createRequire` rather than a static import (#5392).
 *
 * A static `import ... from 'node:sqlite'` is HOISTED by the bundler to the top
 * of the emitted chunk, so it evaluates before any code in this package can
 * run — including the CLI's warning filter. Node emits the SQLite
 * `ExperimentalWarning` at IMPORT time, not first use, so that ordering made
 * the filter unable to fire at all: #5388 shipped a guard that could never
 * work.
 *
 * `createRequire` keeps the load SYNCHRONOUS (so `openSqliteDatabase` and the
 * constructors above it stay sync, which is the whole reason node:sqlite was
 * chosen) while deferring it to first call — by which time the CLI entry point
 * has installed its filter. Node caches the module, so repeat calls are free.
 */
const requireFromHere = createRequire(import.meta.url);

function loadSqlite(): typeof import('node:sqlite') {
  return requireFromHere('node:sqlite') as typeof import('node:sqlite');
}

/**
 * True for the two spellings of "do not touch the filesystem".
 *
 * `''` is accepted because callers pass a config default through unchanged, and
 * `node:sqlite` treats it as an anonymous on-disk temp database rather than an
 * error — so it must be classified explicitly rather than falling through to
 * the mkdir branch, where `dirname('')` would create a stray directory.
 */
function isInMemory(dbPath: string): boolean {
  return dbPath === ':memory:' || dbPath === '';
}

/**
 * Open a SQLite database at `dbPath`, creating the parent directory for on-disk
 * paths and enabling WAL journal mode.
 *
 * @param dbPath Absolute SQLite file path, or `':memory:'` / `''` for an
 *   in-memory database (no directory is created in that case).
 * @returns A handle narrowed to {@link ISQLiteDatabase} — the interface ~30
 *   helper signatures and ~12 test doubles are already written against, so
 *   returning the narrow type keeps the engine swap from leaking outward.
 */
export function openSqliteDatabase(dbPath: string): ISQLiteDatabase {
  if (!isInMemory(dbPath)) {
    // Fresh-install robustness (#3995): opening under a missing parent throws
    // SQLITE_CANTOPEN. Create it up front, idempotently.
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(dbPath);

  // WAL keeps concurrent MCP-server + CLI readers coherent. `node:sqlite` has
  // no `.pragma()` helper, so this goes through `exec`. Harmless for in-memory
  // databases: SQLite reports `memory` and does not error, verified rather than
  // assumed, so no branch is needed here.
  db.exec('PRAGMA journal_mode = WAL');

  return makeIdempotentClose(db);
}

/**
 * Reconcile the one semantic difference that actually bit during migration:
 * **`better-sqlite3.close()` is idempotent; `DatabaseSync.close()` throws
 * `database is not open` on the second call.**
 *
 * This is not hypothetical tidying. Shutdown here is legitimately reentrant —
 * `shutdownToolMemory` → `ToolMemoryManager.endSession` → `MobiMem.close`
 * (tool-memory.ts:159, :1182) can run twice for one instance, which surfaced as
 * 16 failing tests the moment the engine changed. The existing `if (this.db !==
 * null)` guards do not help: the handle is still non-null after being closed.
 *
 * Fixed once here rather than by adding a closed-flag to each of the ~9 callers,
 * because the codebase was written against better-sqlite3's contract and the
 * migration should preserve it, not redistribute it. `isOpen` makes the guard
 * exact — no bookkeeping flag that could drift from the real handle state.
 */
function makeIdempotentClose(db: DatabaseSync): ISQLiteDatabase {
  const narrowed = db as unknown as ISQLiteDatabase;
  return {
    exec: (sql: string) => {
      db.exec(sql);
    },
    prepare: narrowed.prepare.bind(narrowed),
    close: () => {
      if (db.isOpen) db.close();
    },
  };
}
