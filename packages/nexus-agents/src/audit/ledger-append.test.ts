import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { UNREADABLE_RECORD_PREFIX, serializeValidatedRecord } from './ledger-append.js';

describe('serializeValidatedRecord (#6054)', () => {
  // Schema declares keys in one order; the record supplies them in another.
  // Zod's parsed output is rebuilt in SCHEMA order, so returning it would
  // silently reorder every valid record's bytes. An adversarial review ran both
  // real stores and found exactly that. The schema is consulted for its verdict
  // only; what is written is the caller's own object, byte for byte.
  const schema = z.object({ a: z.string(), b: z.number(), c: z.boolean().optional() }).strict();

  it("writes the caller's bytes, not Zod's rebuilt object — key order is preserved", () => {
    const record = { c: true, b: 2, a: 'x' }; // deliberately NOT schema order
    expect(serializeValidatedRecord(schema, record, 'test')).toBe(JSON.stringify(record) + '\n');
  });

  it('is byte-identical to the pre-guard `JSON.stringify(record) + newline`', () => {
    const record = { a: 'x', b: 1 };
    expect(serializeValidatedRecord(schema, record, 'test')).toBe(JSON.stringify(record) + '\n');
  });

  it('refuses a record the schema rejects, naming the ledger and the field', () => {
    const bad = { a: 'x', b: 'not-a-number' } as unknown as { a: string; b: number };
    expect(() => serializeValidatedRecord(schema, bad, 'vote')).toThrow(UNREADABLE_RECORD_PREFIX);
    expect(() => serializeValidatedRecord(schema, bad, 'vote')).toThrow(/vote record: b: /);
  });

  it('refuses an unknown key under a strict schema — the read path would drop the line', () => {
    const smuggled = { a: 'x', b: 1, zzz: 9 } as unknown as { a: string; b: number };
    expect(() => serializeValidatedRecord(schema, smuggled, 'vote')).toThrow(/zzz/);
  });
});
