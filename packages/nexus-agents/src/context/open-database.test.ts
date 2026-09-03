/**
 * Canonical SQLite open helper (#5388).
 *
 * `better-sqlite3` is a native module whose binding is built by an `install`
 * lifecycle script. Where install scripts are blocked, `npm install` reports
 * SUCCESS and the package then dies at runtime with "Could not locate the
 * bindings file" — reproduced against better-sqlite3@12.11.1. That is the worst
 * failure shape available: a clean install and a broken CLI.
 *
 * `node:sqlite` is a builtin with a synchronous API, so it needs no install
 * script, no native build, and no async refactor of the synchronous
 * constructors that reach it (`MobiMem`, `RoutingMemory`).
 *
 * These tests exercise the REAL database, not a mock. A mock would prove
 * nothing here: the entire point is that the underlying engine changed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openSqliteDatabase } from './open-database.js';
import type { ISQLiteDatabase } from '../core/types/database-types.js';

const created: string[] = [];

function tempDbPath(...segments: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-opendb-'));
  created.push(dir);
  return join(dir, ...segments);
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe('openSqliteDatabase (#5388)', () => {
  describe('needs no native build', () => {
    it('opens without better-sqlite3 being loadable', () => {
      // The regression this migration exists to prevent. If this helper ever
      // reaches for the native module again, a blocked install script returns
      // us to "installs fine, crashes at runtime".
      const db = openSqliteDatabase(':memory:');

      expect(db).toBeDefined();
      db.close();
    });
  });

  describe('round-trips real data', () => {
    it('creates, writes and reads back through the ISQLiteDatabase surface', () => {
      const db: ISQLiteDatabase = openSqliteDatabase(':memory:');
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, k TEXT, v TEXT)');

      const result = db.prepare('INSERT INTO t (k, v) VALUES (?, ?)').run('alpha', 'one');
      // `.changes` is read in production (session-storage, outcome-storage,
      // memory-operations), so its shape is load-bearing, not incidental.
      expect(result.changes).toBe(1);

      // Input differs from expected output so a write/read identity bug cannot
      // hide behind a matching literal.
      const row = db
        .prepare<{ id: number; k: string; v: string }>('SELECT id, k, v FROM t WHERE k = ?')
        .get('alpha');
      expect(row?.v).toBe('one');
      expect(row?.k).toBe('alpha');

      expect(db.prepare('SELECT k FROM t').all()).toHaveLength(1);
      db.close();
    });

    it('returns undefined for a miss rather than throwing', () => {
      const db = openSqliteDatabase(':memory:');
      db.exec('CREATE TABLE t (k TEXT)');

      expect(db.prepare('SELECT k FROM t WHERE k = ?').get('absent')).toBeUndefined();
      db.close();
    });

    it('binds @-prefixed named parameters from a bare-key object', () => {
      // Two production sites bind bare keys to `@name` placeholders
      // (mobimem-persistence.ts, nexus-memory sqlite.ts). node:sqlite permits
      // this but throws on ambiguity, so it is pinned rather than assumed.
      const db = openSqliteDatabase(':memory:');
      db.exec('CREATE TABLE t (k TEXT, v TEXT)');
      db.prepare('INSERT INTO t (k, v) VALUES (@key, @value)').run({ key: 'a', value: 'b' });

      expect(db.prepare<{ v: string }>('SELECT v FROM t').get()?.v).toBe('b');
      db.close();
    });
  });

  describe('on-disk paths', () => {
    it('creates the parent directory that does not exist yet', () => {
      // Fresh-install robustness (#3995): opening under a missing parent throws
      // SQLITE_CANTOPEN, so the directory is created up front.
      const dbPath = tempDbPath('nested', 'deeper', 'mem.db');
      expect(existsSync(dbPath)).toBe(false);

      const db = openSqliteDatabase(dbPath);
      db.exec('CREATE TABLE t (k TEXT)');
      db.close();

      expect(existsSync(dbPath)).toBe(true);
    });

    it('enables WAL so concurrent MCP-server and CLI readers stay coherent', () => {
      const db = openSqliteDatabase(tempDbPath('wal.db'));

      const mode = db.prepare<{ journal_mode: string }>('PRAGMA journal_mode').get();
      expect(mode?.journal_mode).toBe('wal');
      db.close();
    });

    it('persists across close and reopen', () => {
      // The property a caller actually depends on, and the one an in-memory
      // fallback would silently break.
      const dbPath = tempDbPath('persist.db');

      const first = openSqliteDatabase(dbPath);
      first.exec('CREATE TABLE t (k TEXT)');
      first.prepare('INSERT INTO t (k) VALUES (?)').run('survives');
      first.close();

      const second = openSqliteDatabase(dbPath);
      expect(second.prepare<{ k: string }>('SELECT k FROM t').get()?.k).toBe('survives');
      second.close();
    });
  });

  describe('close() is idempotent, matching the contract callers were written against', () => {
    it('does not throw on a second close', () => {
      // better-sqlite3's close() is a no-op when already closed; node:sqlite's
      // throws `database is not open`. Shutdown here is legitimately reentrant
      // (shutdownToolMemory -> endSession -> MobiMem.close), and this exact
      // difference failed 16 tests during the migration.
      const db = openSqliteDatabase(':memory:');
      db.close();

      expect(() => {
        db.close();
      }).not.toThrow();
    });

    it('closes for real the first time', () => {
      // The control: idempotence must not be implemented by never closing.
      const db = openSqliteDatabase(':memory:');
      db.exec('CREATE TABLE t (k TEXT)');
      db.close();

      expect(() => {
        db.exec('SELECT 1');
      }).toThrow();
    });
  });

  describe('in-memory paths create nothing on disk', () => {
    it.each([':memory:', ''])('treats %j as in-memory', (path) => {
      const db = openSqliteDatabase(path);
      db.exec('CREATE TABLE t (k TEXT)');
      db.prepare('INSERT INTO t (k) VALUES (?)').run('x');

      expect(db.prepare('SELECT k FROM t').all()).toHaveLength(1);
      db.close();
    });
  });
});
