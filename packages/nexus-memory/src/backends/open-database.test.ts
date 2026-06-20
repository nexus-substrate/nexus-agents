/**
 * Fresh-install auto-create regression tests (#3995).
 *
 * Before #3995, opening a SQLite-backed store at a path whose parent
 * directory did not yet exist threw `SQLITE_CANTOPEN` — the classic
 * fresh-install failure when the resolver hands back
 * `~/.nexus-agents/memory/*.db` and nobody has created the dir. The shared
 * `openSqliteDatabase` helper now creates the parent dir first. `:memory:`
 * keeps working (no dir created).
 *
 * @module nexus-memory/backends/open-database.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSqliteDatabase } from './open-database.js';
import { SqliteBackend } from './sqlite.js';
import { MemoryRegistry } from '../registry.js';

describe('openSqliteDatabase fresh-install auto-create (#3995)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nexus-mem-open-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the missing parent directory before opening the DB', () => {
    // `root/a/b/` does not exist yet — pre-#3995 this threw SQLITE_CANTOPEN.
    const dbPath = join(root, 'a', 'b', 'memory.db');
    expect(existsSync(join(root, 'a', 'b'))).toBe(false);

    const db = openSqliteDatabase(dbPath);
    try {
      expect(existsSync(join(root, 'a', 'b'))).toBe(true);
      expect(existsSync(dbPath)).toBe(true);
    } finally {
      db.close();
    }
  });

  it('opens :memory: without creating any directory', () => {
    const db = openSqliteDatabase(':memory:');
    try {
      // A `:memory:` file must never appear on disk.
      expect(existsSync(join(process.cwd(), ':memory:'))).toBe(false);
      // The handle is usable.
      db.exec('CREATE TABLE t (k TEXT)');
    } finally {
      db.close();
    }
  });

  it('SqliteBackend opens at a path with a missing parent dir', async () => {
    const dbPath = join(root, 'missing', 'sub', 'backend.db');
    const backend = new SqliteBackend<string, { v: number }>({
      domain: 'fresh_install',
      dbPath,
    });
    try {
      await backend.write('k', { v: 1 });
      expect(await backend.read('k')).toEqual({ v: 1 });
    } finally {
      await backend.close();
    }
  });

  it('MemoryRegistry opens at a path with a missing parent dir', async () => {
    const dbPath = join(root, 'reg', 'deep', 'registry.db');
    const registry = new MemoryRegistry({ dbPath });
    try {
      expect(existsSync(join(root, 'reg', 'deep'))).toBe(true);
      const backend = registry.register<string, { v: number }>({ domain: 'reg_fresh' });
      await backend.write('k', { v: 7 });
      expect(await backend.read('k')).toEqual({ v: 7 });
    } finally {
      await registry.close();
    }
  });
});
