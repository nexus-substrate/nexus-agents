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
