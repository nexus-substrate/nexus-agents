/**
 * Contract test — every IMemoryBackend implementation must pass these.
 *
 * Phase 2 acceptance: "same contract-test passes against both InMemoryBackend
 * and SqliteBackend." Run the suite once per backend factory.
 *
 * @module nexus-memory/backends/contract.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { IMemoryBackend, JsonValue } from '../types.js';
import { InMemoryBackend, MemoryValidationError } from './memory.js';
import { SqliteBackend } from './sqlite.js';
import { openSqliteDatabase } from './open-database.js';
import { resetMemoryTelemetry, subscribeToMemoryEvents } from '../telemetry.js';

type SamplePayload = {
  readonly text: string;
  readonly count: number;
};

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

// #5979: these replace the three divergence pins with converged guarantees.
for (const [name, factory] of factories) {
  describe(`JSON convergence — ${name}`, () => {
    let backend: IMemoryBackend<string, SamplePayload>;
    beforeEach(() => {
      backend = factory('convergence');
    });
    afterEach(async () => {
      await backend.close();
      resetMemoryTelemetry();
    });

    it('rejects a Date with its offending path; callers must serialize explicitly', async () => {
      await expect(
        backend.write('k', { at: new Date(0) } as unknown as SamplePayload)
      ).rejects.toMatchObject({ name: 'MemoryValidationError', path: '$["at"]' });
      expect((await backend.stats()).count).toBe(0);
    });

    it('copies on write, read, and query, including nested values', async () => {
      const value = { text: 'original', count: 1, nested: { n: 1 } };
      await backend.write('k', value);
      value.text = 'write alias';
      value.nested.n = 2;
      const read = await backend.read('k');
      expect(read).toEqual({ text: 'original', count: 1, nested: { n: 1 } });
      if (read !== undefined) {
        (read as typeof value).text = 'read alias';
        (read as typeof value).nested.n = 99;
      }
      const query = await backend.query();
      const first = query[0] as typeof value;
      first.nested.n = 3;
      expect(await backend.read('k')).toEqual({ text: 'original', count: 1, nested: { n: 1 } });
    });

    it.each([7, false, null, undefined, { id: 'a' }, Symbol('key')])(
      'rejects non-string keys %s on write, read, and delete',
      async (invalid) => {
        const key = invalid as unknown as string;
        for (const operation of [
          () => backend.write(key, { text: 'x', count: 1 }),
          () => backend.read(key),
          () => backend.delete(key),
        ]) {
          await expect(operation()).rejects.toMatchObject({
            name: 'MemoryValidationError',
            path: '$key',
          });
        }
        expect((await backend.stats()).count).toBe(0);
      }
    );

    it('uses string keys literally without structural coercion', async () => {
      await backend.write('7', { text: 'x', count: 1 });
      expect(await backend.read('7')).toEqual({ text: 'x', count: 1 });
      expect(await backend.read('07')).toBeUndefined();
      expect(await backend.delete('7')).toBe(true);
    });

    it.each([
      ['Map', new Map()],
      ['Set', new Set()],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['negative Infinity', -Infinity],
      ['undefined', undefined],
      ['function', () => 1],
      ['symbol', Symbol('value')],
      ['bigint', 1n],
      ['prototype', Object.create({ inherited: 1 }) as unknown],
      [
        'cycle',
        (() => {
          const v: Record<string, unknown> = {};
          v['self'] = v;
          return v;
        })(),
      ],
      ['sparse array', new Array(2)],
      ['symbol property', { [Symbol('hidden')]: 1 }],
      ['hidden property', Object.defineProperty({}, 'hidden', { value: 1 })],
      ['accessor', Object.defineProperty({}, 'get', { get: () => 1, enumerable: true })],
      ['array property', Object.assign([1], { extra: 2 })],
      ['non-index numeric array property', Object.assign([1], { 4294967295: 2 })],
      ['negative zero', -0],
      ['toJSON hook', { toJSON: () => 'coerced' }],
    ])('rejects nested non-JSON %s without overwriting existing data', async (_label, invalid) => {
      await backend.write('k', { text: 'valid', count: 1 });
      await expect(
        backend.write('k', { payload: invalid } as unknown as SamplePayload)
      ).rejects.toMatchObject({ name: 'MemoryValidationError' });
      await expect(
        backend.write('k', { payload: invalid } as unknown as SamplePayload)
      ).rejects.toThrow(/\$\["payload"\]/);
      expect(await backend.read('k')).toEqual({ text: 'valid', count: 1 });
    });

    it('schema-backed reads and queries accept only the stored JSON shape', async () => {
      await backend.close();
      backend = factory('convergence_schema', SampleSchema);
      await backend.write('k', { text: 'valid', count: 1 });
      expect(await backend.read('k')).toEqual({ text: 'valid', count: 1 });
      expect(await backend.query()).toEqual([{ text: 'valid', count: 1 }]);
    });
  });
}

describe('SQLite stored-row validation', () => {
  it('rejects lossy stored JSON even without an optional schema', async () => {
    const db = openSqliteDatabase(':memory:');
    const backend = new SqliteBackend<string, JsonValue>({
      domain: 'unvalidated',
      dbPath: ':memory:',
      db,
    });
    try {
      db.prepare('INSERT INTO unvalidated (key,value,timestamp) VALUES (?,?,?)').run(
        'infinite-row',
        '{"n":1e999}',
        1
      );
      await expect(backend.read('infinite-row')).rejects.toMatchObject({
        name: 'MemoryReadError',
        key: 'infinite-row',
      });
      await expect(backend.query()).rejects.toMatchObject({
        name: 'MemoryReadError',
        key: 'infinite-row',
      });
    } finally {
      await backend.close();
      db.close();
    }
  });

  it.each(['{"text":42,"count":1}', '{broken', '{"text":"x","count":1e999}'])(
    'fails closed on read and query for corrupt row %s',
    async (stored) => {
      const db = openSqliteDatabase(':memory:');
      const backend = new SqliteBackend<string, SamplePayload>({
        domain: 'corrupt',
        dbPath: ':memory:',
        db,
        schema: SampleSchema,
      });
      try {
        db.prepare('INSERT INTO corrupt (key,value,timestamp) VALUES (?,?,?)').run(
          'bad-row',
          stored,
          1
        );
        for (const operation of [
          () => backend.read('bad-row'),
          () => backend.query(),
          () => backend.query({ where: { text: 'not-matching' }, limit: 0 }),
        ]) {
          await expect(operation()).rejects.toMatchObject({
            name: 'MemoryReadError',
            key: 'bad-row',
            domain: 'corrupt',
          });
          await expect(operation()).rejects.toThrow(/bad-row/);
        }
      } finally {
        await backend.close();
        db.close();
      }
    }
  );
});

for (const Backend of [InMemoryBackend, SqliteBackend]) {
  describe(`JSON values — ${Backend.name}`, () => {
    afterEach(() => {
      resetMemoryTelemetry();
      vi.unstubAllEnvs();
    });
    it('rejects the descriptor-valid proxy with a spoofed toJSON before storing anything', async () => {
      const backend = new Backend<string, { n: number }>({
        domain: 'proxy_hook',
        dbPath: ':memory:',
        schema: z.object({ n: z.number() }),
      });
      let hookCalls = 0;
      const value = new Proxy(
        { n: 1 },
        {
          get(target, key, receiver) {
            if (key === 'toJSON')
              return () => {
                hookCalls++;
                return { n: 'invalid' };
              };
            return Reflect.get(target, key, receiver) as unknown;
          },
          has(target, key) {
            return key === 'toJSON' ? false : Reflect.has(target, key);
          },
        }
      );
      try {
        await expect(backend.write('k', value)).rejects.toMatchObject({
          name: 'MemoryValidationError',
          path: '$',
        });
        expect(hookCalls).toBe(0);
        expect(await backend.read('k')).toBeUndefined();
        expect(await backend.query()).toEqual([]);
      } finally {
        await backend.close();
      }
    });

    it.each(['own', 'inherited'] as const)(
      'rejects a %s toJSON property even when it is not callable',
      async (location) => {
        const backend = new Backend<string, JsonValue>({ domain: 'json_hook', dbPath: ':memory:' });
        const value = { n: 1 };
        const holder = location === 'own' ? value : Object.prototype;
        const original = Object.getOwnPropertyDescriptor(holder, 'toJSON');
        Object.defineProperty(holder, 'toJSON', {
          value: null,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        try {
          await expect(backend.write('k', { nested: value })).rejects.toMatchObject({
            name: 'MemoryValidationError',
            path: location === 'own' ? '$["nested"]["toJSON"]' : '$["toJSON"]',
          });
          expect((await backend.stats()).count).toBe(0);
        } finally {
          if (original === undefined) Reflect.deleteProperty(holder, 'toJSON');
          else Object.defineProperty(holder, 'toJSON', original);
          await backend.close();
        }
      }
    );

    it('rejects a changing getter without invoking it or storing anything', async () => {
      const backend = new Backend<string, JsonValue>({ domain: 'json_getter', dbPath: ':memory:' });
      let reads = 0;
      const value = Object.defineProperty({}, 'n', { enumerable: true, get: () => ++reads });
      try {
        await expect(backend.write('k', value as JsonValue)).rejects.toMatchObject({
          name: 'MemoryValidationError',
          path: '$["n"]',
        });
        expect(reads).toBe(0);
        expect((await backend.stats()).count).toBe(0);
      } finally {
        await backend.close();
      }
    });

    it('rejects a null-prototype input when its fresh copy would inherit a toJSON hook', async () => {
      const backend = new Backend<string, { n: number }>({
        domain: 'copy_prototype_hook',
        dbPath: ':memory:',
        schema: z.object({ n: z.number() }),
      });
      const value = Object.assign(Object.create(null) as object, { n: 1 });
      const original = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
      let hookCalls = 0;
      let failure: unknown;
      Object.defineProperty(Object.prototype, 'toJSON', {
        configurable: true,
        writable: true,
        value: () => {
          hookCalls++;
          return { n: 'invalid' };
        },
      });
      try {
        try {
          await backend.write('k', value);
        } catch (error: unknown) {
          failure = error;
        }
      } finally {
        if (original === undefined) Reflect.deleteProperty(Object.prototype, 'toJSON');
        else Object.defineProperty(Object.prototype, 'toJSON', original);
      }
      try {
        expect(failure).toMatchObject({ name: 'MemoryValidationError', path: '$["toJSON"]' });
        expect(hookCalls).toBe(0);
        expect(await backend.read('k')).toBeUndefined();
        expect((await backend.stats()).count).toBe(0);
      } finally {
        await backend.close();
      }
    });

    it('validates and stores the same fresh copy independently of the caller', async () => {
      vi.stubEnv('NEXUS_MEMORY_AUDIT_MODE', 'audit');
      let payloadSummary: string | undefined;
      const unsubscribe = subscribeToMemoryEvents((event) => {
        if (event.op === 'write') payloadSummary = event.payloadSummary;
      });
      const value = { n: 1, nested: { label: 'valid' } };
      let checked: unknown;
      const schema = z.custom<typeof value>((candidate: unknown) => {
        checked = candidate;
        value.n = 2;
        value.nested.label = 'caller changed during validation';
        return (
          candidate !== value &&
          typeof candidate === 'object' &&
          candidate !== null &&
          'n' in candidate &&
          candidate.n === 1
        );
      });
      const backend = new Backend<string, typeof value>({
        domain: 'stored_copy',
        dbPath: ':memory:',
        schema,
      });
      try {
        await backend.write('k', value);
        expect(payloadSummary).toBe(JSON.stringify({ n: 1, nested: { label: 'valid' } }));
        expect(checked).not.toBe(value);
        expect(checked).toEqual({ n: 1, nested: { label: 'valid' } });
        expect(await backend.read('k')).toEqual({ n: 1, nested: { label: 'valid' } });
        expect(await backend.query()).toEqual([{ n: 1, nested: { label: 'valid' } }]);
      } finally {
        unsubscribe();
        await backend.close();
      }
    });

    it('round-trips primitives, arrays, null-prototype objects, and shared acyclic children', async () => {
      const backend = new Backend<string, JsonValue>({ domain: 'json_values', dbPath: ':memory:' });
      const child = { n: 1 };
      const plain: unknown = Object.assign(Object.create(null) as object, { key: 'value' });
      const values: JsonValue[] = [
        null,
        true,
        false,
        '',
        0,
        1.5,
        [],
        {},
        [1, 'x', null],
        plain as JsonValue,
        { first: child, second: child },
        JSON.parse('{"__proto__":{"n":1},"constructor":"literal"}') as JsonValue,
      ];
      try {
        for (const [index, value] of values.entries()) {
          await backend.write(String(index), value);
          expect(await backend.read(String(index))).toEqual(value);
        }
        expect(await backend.query()).toHaveLength(values.length);
      } finally {
        await backend.close();
      }
    });
  });
}
