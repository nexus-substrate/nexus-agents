import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { UNREADABLE_RECORD_PREFIX, serializeValidatedRecord } from './ledger-append.js';
import { VoteRecordSchema } from './vote-record.js';
import { buildVoteRecord } from './vote-record-store.js';

/** A schema-valid record from the REAL builder, so round-trip tests use the production shape. */
const VALID_VOTE_RECORD = buildVoteRecord({
  declaredOptions: undefined,
  resolvedDecision: undefined,
  id: 'vote-roundtrip',
  proposal: 'p',
  strategy: 'higher_order',
  result: {
    decision: 'approved',
    approvalPercentage: 100,
    voteCounts: { approve: 1, reject: 0, abstain: 0, error: 0, total: 1 },
  } as never,
  votes: [],
  sequence: 0,
});

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

describe('the guard cannot be talked past the JSON round-trip (#6054, ratification panel)', () => {
  it('the fixture is schema-valid — otherwise every test below passes for the wrong reason', () => {
    // The first version of this fixture lacked `voteCounts.total`, cast past the
    // compiler; the NaN test then "passed" because the record was already
    // invalid. A fixture that is invalid on its own makes a refusal test vacuous.
    expect(VoteRecordSchema.safeParse(VALID_VOTE_RECORD).success).toBe(true);
    expect(() =>
      serializeValidatedRecord(VoteRecordSchema, VALID_VOTE_RECORD, 'vote')
    ).not.toThrow();
  });

  // Two seats raised the same family: a value the schema ACCEPTS in memory but
  // that JSON cannot carry — `NaN`/`Infinity` become `null` on the wire, a
  // prototype `toJSON()` rewrites the bytes after validation — would reach
  // disk validated-yet-unreadable, which is the original defect re-entering
  // through the guard. Measured rather than argued: in this Zod even a BARE
  // `z.number()` rejects non-finite values, every ledger numeric is bounded
  // besides, and the records are object literals from the builders. These
  // tests make that a permanent fact instead of a per-panel rebuttal.

  it('refuses NaN and ±Infinity in a numeric field, so `null` can never be written', () => {
    const base = { ...VALID_VOTE_RECORD };
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const record = { ...base, approvalPercentage: bad };
      expect(() => serializeValidatedRecord(VoteRecordSchema, record, 'vote')).toThrow(
        UNREADABLE_RECORD_PREFIX
      );
    }
  });

  it('a prototype toJSON cannot rewrite the bytes after validation', () => {
    // `.strict()` validates own keys; JSON.stringify honours toJSON. If a caller
    // handed the guard a class instance, the two could diverge. The builders
    // never do, and this pins the property for any future caller: what is
    // written is what was validated.
    class Sneaky {
      constructor(fields: Record<string, unknown>) {
        Object.assign(this, fields);
      }
      toJSON(): unknown {
        return { forged: true };
      }
    }
    const instance = new Sneaky({ ...VALID_VOTE_RECORD }) as unknown as typeof VALID_VOTE_RECORD;
    // Measured: `.strict()` safeParse on the instance PASSES (own keys match) while
    // JSON.stringify writes {"forged":true}. Silence-then-garbage is the one
    // outcome this forbids; the guard must refuse.
    expect(() => serializeValidatedRecord(VoteRecordSchema, instance, 'vote')).toThrow(
      /JSON round-trip changed it/
    );
  });

  it('every line the guard writes parses back under the read schema — the general property', () => {
    const line = serializeValidatedRecord(VoteRecordSchema, VALID_VOTE_RECORD, 'vote');
    expect(VoteRecordSchema.safeParse(JSON.parse(line)).success).toBe(true);
  });
});
