/**
 * Tests for the shared append-only JSONL store primitive (#3762).
 */

import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { JsonlStore } from './jsonl-store.js';

const RecordSchema = z.object({
  id: z.number(),
  name: z.string(),
});
type Rec = z.infer<typeof RecordSchema>;

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jsonl-store-'));
  filePath = join(dir, 'nested', 'records.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeStore(maxRecords = 100): JsonlStore<Rec> {
  return new JsonlStore<Rec>({ filePath, schema: RecordSchema, maxRecords });
}

describe('JsonlStore', () => {
  it('round-trips: append N then reconstruct preserving order + fidelity', () => {
    const store = makeStore();
    for (let i = 0; i < 5; i++) store.append({ id: i, name: `n${String(i)}` });
    expect(store.count()).toBe(5);

    // Reconstruct from disk in a fresh instance.
    const reopened = makeStore();
    expect(reopened.count()).toBe(5);
    expect(reopened.all().map((r) => r.id)).toEqual([0, 1, 2, 3, 4]);
    expect(reopened.all()[2]).toEqual({ id: 2, name: 'n2' });
  });

  it('creates the parent directory on construction', () => {
    const store = makeStore();
    store.append({ id: 1, name: 'a' });
    // File lives under a nested dir that did not exist beforehand.
    expect(readFileSync(filePath, 'utf-8')).toContain('"id":1');
  });

  it('tolerates malformed + schema-invalid lines on hydrate', () => {
    const store = makeStore();
    store.append({ id: 1, name: 'ok' });
    // Inject a corrupt line and a schema-invalid line.
    writeFileSync(
      filePath,
      [
        JSON.stringify({ id: 1, name: 'ok' }),
        '{ not json',
        JSON.stringify({ id: 'wrong-type', name: 5 }),
        JSON.stringify({ id: 2, name: 'ok2' }),
      ].join('\n') + '\n',
      'utf-8'
    );
    const reopened = makeStore();
    expect(reopened.count()).toBe(2);
    expect(reopened.all().map((r) => r.id)).toEqual([1, 2]);
  });

  it('refuses to persist a record that fails schema validation', () => {
    const store = makeStore();
    // Bypass the compile-time type to feed an invalid record at the boundary.
    store.append({ id: 'bad', name: 1 } as unknown as Rec);
    expect(store.count()).toBe(0);
    const reopened = makeStore();
    expect(reopened.count()).toBe(0);
  });

  it('bounds retention to the last N records (oldest evicted)', () => {
    const max = 10;
    const store = makeStore(max);
    for (let i = 0; i < max + 5; i++) store.append({ id: i, name: `n${String(i)}` });
    expect(store.count()).toBe(max);
    // Oldest 5 evicted; newest retained.
    expect(store.all().map((r) => r.id)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

    // The on-disk file is also bounded after rewrite.
    const reopened = makeStore(max);
    expect(reopened.count()).toBe(max);
    expect(reopened.all()[0]?.id).toBe(5);
  });

  it('trims an over-cap file down on hydrate', () => {
    // Write 20 lines directly (flat path, no nested dir), then open with a cap of 8.
    const flat = join(dir, 'flat.jsonl');
    const lines = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify({ id: i, name: `n${String(i)}` })
    );
    writeFileSync(flat, lines.join('\n') + '\n', 'utf-8');
    const store = new JsonlStore<Rec>({ filePath: flat, schema: RecordSchema, maxRecords: 8 });
    expect(store.count()).toBe(8);
    expect(store.all()[0]?.id).toBe(12);
  });
});
