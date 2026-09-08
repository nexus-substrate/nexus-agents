/**
 * Contract test — every IMemoryBackend implementation must pass these.
 *
 * Phase 2 acceptance: "same contract-test passes against both InMemoryBackend
 * and SqliteBackend." Run the suite once per backend factory.
 *
 * @module nexus-memory/backends/contract.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { IMemoryBackend } from '../types.js';
import { InMemoryBackend, MemoryValidationError } from './memory.js';
import { SqliteBackend } from './sqlite.js';
import { resetMemoryTelemetry } from '../telemetry.js';

interface SamplePayload {
  readonly text: string;
  readonly count: number;
}

const SampleSchema = z.object({
  text: z.string(),
  count: z.number().int().nonnegative(),
});

type BackendFactory = (
  domain: string,
  schema?: z.ZodType<SamplePayload>
) => IMemoryBackend<string, SamplePayload>;

const factories: Array<[string, BackendFactory]> = [
  [
    'InMemoryBackend',
    (domain, schema) =>
      new InMemoryBackend<string, SamplePayload>({
        domain,
        ...(schema !== undefined && { schema }),
      }),
  ],
  [
    'SqliteBackend(:memory:)',
    (domain, schema) =>
      new SqliteBackend<string, SamplePayload>({
        domain,
        dbPath: ':memory:',
        ...(schema !== undefined && { schema }),
      }),
  ],
];

for (const [name, factory] of factories) {
  describe(`IMemoryBackend contract — ${name}`, () => {
    let backend: IMemoryBackend<string, SamplePayload>;

    beforeEach(() => {
      resetMemoryTelemetry();
      backend = factory(`test_${name.replace(/[^a-z0-9]/gi, '_')}`);
    });

    afterEach(async () => {
      await backend.close();
    });

    it('read returns undefined for missing key', async () => {
      expect(await backend.read('nope')).toBeUndefined();
    });

    it('write then read round-trips', async () => {
      await backend.write('k1', { text: 'hello', count: 1 });
      expect(await backend.read('k1')).toEqual({ text: 'hello', count: 1 });
    });

    // #4021: both backends must REJECT write(key, undefined) identically. Before
    // the fix, InMemoryBackend stored a phantom row while SqliteBackend threw a
    // cryptic NOT NULL bind error — a contract divergence. Now both throw
    // MemoryValidationError, and the key stays absent.
    it('rejects write(key, undefined) uniformly and stores nothing', async () => {
      // Cast through unknown to exercise the runtime undefined-guard (the type
      // forbids undefined, but a caller bug or untyped JS path can still reach it).
      const undefinedValue = undefined as unknown as SamplePayload;
      await expect(backend.write('k-undef', undefinedValue)).rejects.toThrow(MemoryValidationError);
      expect(await backend.read('k-undef')).toBeUndefined();
    });

    it('write upserts on existing key', async () => {
      await backend.write('k1', { text: 'first', count: 1 });
      await backend.write('k1', { text: 'second', count: 2 });
      expect(await backend.read('k1')).toEqual({ text: 'second', count: 2 });
    });

    it('delete removes the row and returns true', async () => {
      await backend.write('k1', { text: 'hi', count: 1 });
      expect(await backend.delete('k1')).toBe(true);
      expect(await backend.read('k1')).toBeUndefined();
    });

    it('delete returns false for missing key', async () => {
      expect(await backend.delete('nope')).toBe(false);
    });

    it('query returns all rows when no filter', async () => {
      await backend.write('a', { text: 'one', count: 1 });
      await backend.write('b', { text: 'two', count: 2 });
      const rows = await backend.query();
      expect(rows).toHaveLength(2);
    });

    it('query filters by where clause', async () => {
      await backend.write('a', { text: 'match', count: 1 });
      await backend.write('b', { text: 'nope', count: 2 });
      const rows = await backend.query({ where: { text: 'match' } });
      expect(rows).toEqual([{ text: 'match', count: 1 }]);
    });

    it('query filters by cli tag', async () => {
      await backend.write('a', { text: 'x', count: 1 }, { cli: 'claude' });
      await backend.write('b', { text: 'y', count: 2 }, { cli: 'gemini' });
      const rows = await backend.query({ cli: 'gemini' });
      expect(rows).toEqual([{ text: 'y', count: 2 }]);
    });

    it('query honors limit', async () => {
      for (let i = 0; i < 5; i++) {
        await backend.write(`k${String(i)}`, { text: 't', count: i });
      }
      const rows = await backend.query({ limit: 2 });
      expect(rows).toHaveLength(2);
    });

    it('query honors orderBy + orderDir', async () => {
      await backend.write('a', { text: 't', count: 3 });
      await backend.write('b', { text: 't', count: 1 });
      await backend.write('c', { text: 't', count: 2 });
      const asc = await backend.query({ orderBy: 'count', orderDir: 'asc' });
      expect(asc.map((r) => r.count)).toEqual([1, 2, 3]);
      const desc = await backend.query({ orderBy: 'count', orderDir: 'desc' });
      expect(desc.map((r) => r.count)).toEqual([3, 2, 1]);
    });

    it('stats returns count + bounds', async () => {
      await backend.write('a', { text: 't', count: 1 }, { timestamp: 1000 });
      await backend.write('b', { text: 't', count: 2 }, { timestamp: 3000 });
      const stats = await backend.stats();
      expect(stats.count).toBe(2);
      expect(stats.oldestTimestamp).toBe(1000);
      expect(stats.newestTimestamp).toBe(3000);
    });

    it('stats returns null bounds when empty', async () => {
      const stats = await backend.stats();
      expect(stats.count).toBe(0);
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
    });

    it('close prevents further operations', async () => {
      await backend.close();
      await expect(backend.read('k1')).rejects.toThrow(/is closed/);
    });

    it('close is idempotent', async () => {
      await backend.close();
      await expect(backend.close()).resolves.toBeUndefined();
    });

    // Phase 2 vote mitigation #1 — security dissent. Schema-validation rejects bad writes.
    it('schema-backed backend rejects invalid writes', async () => {
      await backend.close();
      backend = factory(`test_${name.replace(/[^a-z0-9]/gi, '_')}_validated`, SampleSchema);
      await expect(backend.write('bad', { text: 42 } as unknown as SamplePayload)).rejects.toThrow(
        MemoryValidationError
      );
    });

    it('schema-backed backend accepts valid writes', async () => {
      await backend.close();
      backend = factory(`test_${name.replace(/[^a-z0-9]/gi, '_')}_validated2`, SampleSchema);
      await expect(backend.write('ok', { text: 'hi', count: 1 })).resolves.toBeUndefined();
    });
  });
}

// ============================================================================
// Where the two backends DIVERGE (#5776)
// ============================================================================

/**
 * The suite above runs identically against both backends and passes — but its
 * only payload is `{ text: string; count: number }`, the two shapes JSON
 * preserves exactly, and its only key type is `string`. So it cannot see the
 * places where the two implementations disagree, and a green run is not
 * evidence that a production write lands intact.
 *
 * These cases pin the divergence as it exists TODAY. They are characterisation
 * tests, not aspirations: each one asserts what each backend actually does, so
 * that converging the two (whichever way) FAILS here and forces the contract
 * and its docs to be updated in the same change. Measured, not reasoned —
 * every expectation below was produced by running both backends.
 */
describe('backend divergence, pinned (#5776)', () => {
  afterEach(() => {
    resetMemoryTelemetry();
  });

  it('SQLite round-trips a Date as an ISO string; in-memory keeps the Date', async () => {
    // sqlite.ts JSON.stringify/JSON.parse; memory.ts stores by reference.
    // The optional Zod schema does not catch it: validate() runs on the
    // PRE-serialisation value and read never validates, so a schema-backed
    // SQLite backend can return a value that violates its own schema.
    const sql = new SqliteBackend<string, { at: Date }>({
      domain: 'div_date_s',
      dbPath: ':memory:',
    });
    await sql.write('k', { at: new Date(0) });
    const fromSql = await sql.read('k');
    expect(fromSql?.at).toBe('1970-01-01T00:00:00.000Z');
    expect(fromSql?.at instanceof Date).toBe(false);

    const mem = new InMemoryBackend<string, { at: Date }>({ domain: 'div_date_m' });
    await mem.write('k', { at: new Date(0) });
    expect((await mem.read('k'))?.at).toBeInstanceOf(Date);
  });

  it('in-memory hands back the stored object by reference, so a caller can mutate the store', async () => {
    // No write event, no telemetry increment — the store changes with nothing
    // recording it. SQLite returns a fresh parse and is unaffected.
    const mem = new InMemoryBackend<string, { n: number }>({ domain: 'div_alias_m' });
    await mem.write('k', { n: 1 });
    const read = await mem.read('k');
    if (read !== undefined) read.n = 99;
    expect((await mem.read('k'))?.n).toBe(99);

    const sql = new SqliteBackend<string, { n: number }>({
      domain: 'div_alias_s',
      dbPath: ':memory:',
    });
    await sql.write('k', { n: 1 });
    const sread = await sql.read('k');
    if (sread !== undefined) sread.n = 99;
    expect((await sql.read('k'))?.n).toBe(1);
  });

  it('in-memory keys objects by identity; SQLite keys them structurally', async () => {
    // memory.ts uses `new Map<TKey, Row>` (SameValueZero); sqlite.ts falls
    // through to JSON.stringify in keyToString.
    const mem = new InMemoryBackend<{ id: string }, number>({ domain: 'div_key_m' });
    await mem.write({ id: 'a' }, 7);
    expect(await mem.read({ id: 'a' })).toBeUndefined();
    expect(await mem.delete({ id: 'a' })).toBe(false);
    expect((await mem.stats()).count).toBe(1); // the row is still there, unreachable

    const sql = new SqliteBackend<{ id: string }, number>({
      domain: 'div_key_s',
      dbPath: ':memory:',
    });
    await sql.write({ id: 'a' }, 7);
    expect(await sql.read({ id: 'a' })).toBe(7);
  });

  it('the shared suite above genuinely cannot see any of this', () => {
    // The guard that keeps the divergence visible: if someone widens
    // SamplePayload to include a Date or an object key, these characterisation
    // tests and the shared suite would start disagreeing, which is the signal
    // to converge the backends rather than to broaden the fixture.
    const probe: SamplePayload = { text: 'x', count: 1 };
    expect(JSON.parse(JSON.stringify(probe))).toEqual(probe);
  });
});
