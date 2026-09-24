/**
 * FTS5 query construction against a REAL node:sqlite FTS5 table (#6731).
 *
 * A mock database cannot reproduce the defect: the failure was the FTS5 query
 * parser rejecting `.` (and other operator characters) outside a string
 * literal with `fts5: syntax error`. Only the real engine parses MATCH.
 *
 * Both call sites that turn a user query into a MATCH expression are covered:
 * `HybridMemoryBackend.search` and `searchWithAttributes` (agentic backend).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HybridMemoryBackend } from './memory-backend.js';
import { openSqliteDatabase } from './open-database.js';
import { searchWithAttributes } from './agentic-memory-db-helpers.js';
import { buildFtsMatchQuery } from './memory-operations.js';
import { DEFAULT_EXTRACTION_CONFIG } from './agentic-memory-types.js';
import { MemoryImportance } from './memory-backend-types.js';
import type { ISQLiteDatabase } from './memory-backend-types.js';

const HOSTILE_QUERIES = [
  '8.104.8',
  'foo.ts',
  'a"b',
  '"',
  '-x',
  'col:val',
  'content:',
  'key:secret',
  'NOT',
  'AND',
  'OR foo',
  'NEAR(a b)',
  '(',
  ')',
  '*',
  'foo*',
  '^start',
  'a + b / c, d',
  '...',
  '""',
  '',
  '   ',
  '\t\n',
];

describe('FTS5 MATCH query construction (#6731, real SQLite)', () => {
  let dir: string;
  let db: ISQLiteDatabase;
  let backend: HybridMemoryBackend;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'nexus-fts-'));
    db = openSqliteDatabase(join(dir, 'memory.db'));
    backend = new HybridMemoryBackend({ dbPath: ':memory:', markdownDir: join(dir, 'md') });
    backend.initializeWithDatabase(db);
    const low = { importance: MemoryImportance.LOW };
    for (const [key, value] of [
      ['release-note', { text: 'E2E validation 8.104.8 probe doctor' }],
      ['other-release', { text: 'shipped 8.104.9 today' }],
      ['file-note', { text: 'edited foo.ts and bar.ts' }],
      ['quote-note', { text: 'the value a"b appears here' }],
      ['col-note', { text: 'col val pair' }],
    ] as const) {
      const stored = await backend.store(key, value, low);
      expect(stored.ok).toBe(true);
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('HybridMemoryBackend.search', () => {
    it.each(HOSTILE_QUERIES)('does not error on %j', async (query) => {
      const result = await backend.search(query, 10);
      expect(result.ok ? 'ok' : result.error.message).toBe('ok');
    });

    it('finds the memory that contains a dotted version, and not a sibling version', async () => {
      const result = await backend.search('8.104.8', 10);
      expect(result.ok).toBe(true);
      const keys = result.ok ? result.value.map((e) => e.key) : [];
      expect(keys).toEqual(['release-note']);
    });

    it('answers the exact query from the issue', async () => {
      const result = await backend.search('E2E validation 8.104.8 probe doctor', 10);
      const keys = result.ok ? result.value.map((e) => e.key) : ['<error>'];
      expect(keys).toEqual(['release-note']);
    });

    it('finds a dotted file name', async () => {
      const result = await backend.search('foo.ts', 10);
      const keys = result.ok ? result.value.map((e) => e.key) : ['<error>'];
      expect(keys).toEqual(['file-note']);
    });

    it('keeps implicit AND across terms', async () => {
      const result = await backend.search('foo.ts 8.104.8', 10);
      const keys = result.ok ? result.value.map((e) => e.key) : ['<error>'];
      expect(keys).toEqual([]);
    });

    it('treats a column filter as plain text, not a column restriction', async () => {
      // `key:release` as FTS5 syntax would restrict to the key column and hit
      // `release-note`; quoted, it is the phrase "key release", which no row has.
      const result = await backend.search('key:release', 10);
      const keys = result.ok ? result.value.map((e) => e.key) : ['<error>'];
      expect(keys).toEqual([]);
    });

    it.each(['', '   ', '...', '""', '"', '(', 'NOT', '*'])(
      'returns an empty result for %j, which has no usable terms',
      async (query) => {
        const result = await backend.search(query, 10);
        expect(result.ok ? result.value : '<error>').toEqual([]);
      }
    );
  });

  describe('searchWithAttributes (agentic backend)', () => {
    it.each(HOSTILE_QUERIES)('does not throw on %j', (query) => {
      expect(() => searchWithAttributes(db, query, 10, DEFAULT_EXTRACTION_CONFIG)).not.toThrow();
    });

    it('finds the memory that contains a dotted version', () => {
      const entries = searchWithAttributes(db, '8.104.8', 10, DEFAULT_EXTRACTION_CONFIG);
      expect(entries.map((e) => e.key)).toEqual(['release-note']);
    });

    it('returns an empty result for a query with no usable terms', () => {
      expect(searchWithAttributes(db, '...', 10, DEFAULT_EXTRACTION_CONFIG)).toEqual([]);
    });
  });
});

describe('buildFtsMatchQuery', () => {
  it('quotes each whitespace-separated term as an FTS5 string literal', () => {
    expect(buildFtsMatchQuery('8.104.8 foo.ts')).toBe('"8.104.8" "foo.ts"');
  });

  it('doubles an embedded double quote so it cannot close the literal', () => {
    expect(buildFtsMatchQuery('a"b')).toBe('"a""b"');
  });

  it('keeps operator characters inside the literal', () => {
    expect(buildFtsMatchQuery('col:val -x foo*')).toBe('"col:val" "-x" "foo*"');
  });

  it('drops bare boolean/proximity keywords rather than requiring them', () => {
    expect(buildFtsMatchQuery('cats AND dogs or NOT birds near')).toBe('"cats" "dogs" "birds"');
  });

  it('drops terms with no letter or digit', () => {
    expect(buildFtsMatchQuery('... "" ( ) * ^ - hello')).toBe('"hello"');
  });

  it.each(['', '   ', '\t\n', '...', 'NOT', '"'])('returns an empty string for %j', (query) => {
    expect(buildFtsMatchQuery(query)).toBe('');
  });
});
